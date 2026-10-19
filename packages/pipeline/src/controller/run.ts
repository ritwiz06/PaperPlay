/**
 * The controller (every-paper.md §3, R10, R11): one job, from a paper's identifier to a playable,
 * checked world, through real states only. It moves only along JOB_TRANSITIONS, spends at most two
 * scoped repairs, and reaches `ready` only when the builder, the family's checks, the level rule
 * and provenance have all run and passed. The reviewer's findings are advice it may act on; they
 * never turn a failed check into a pass. Every artifact and every model call is kept for the job.
 */
import { canMove, type JobState, type ModelSpec, type SourceRegisterEntry, type SourceText } from "@paperplay/contracts";
import { registry } from "@paperplay/primitives";
import { assembleWorld, namedInModel } from "../assemble/world.ts";
import { chooseStep, describeBehaviour, describeResponse, horizonOf, responseRows } from "../assemble/model.ts";
import { buildWorld, type BuiltWorld } from "../builder/build.ts";
import { checkProvenance } from "../checks/provenance.ts";
import { runOwnNumbers } from "../reproduce/index.ts";
import { fetchArxiv, fetchPmc, fromOwnerPdf, registerAndText, type Fetch } from "../ingest/index.ts";
import { completeStructured, ModelError, type ModelClient, type Stage } from "../models/index.ts";
import { sweepLevels, type LevelResult } from "../rule/sweep.ts";
import { decideReviews, definitionalProblem, describeDirectEffect, directEffectOf, type ReviewRecord } from "../rule/direct.ts";
import { hookSpreadProblem } from "../rule/spread.ts";
import { checkFindings } from "../rule/findings.ts";
import { visibilityOf } from "../rule/visibility.ts";
import { explain, reword, type Explanation } from "../stages/explainer.ts";
import { plan as planWorld, Plan, PLANNER_MAX_TOKENS, plannerMessages, type PlanLevel } from "../stages/planner.ts";
import { read } from "../stages/reader.ts";
import { equationsOf, review } from "../stages/reviewer.ts";
import { route } from "../stages/router.ts";
import { promptSource } from "../stages/source.ts";
import { TRANSCRIBER_MAX_TOKENS, transcribe, transcriberMessages } from "../stages/transcriber.ts";
import { findQuote, toModelSpec } from "../transcribe/convert.ts";
import { modelForComparison } from "../transcribe/score.ts";
import { compareValueSets, pickValueSet, withValueSet } from "../transcribe/valuesets.ts";
import { matchModels } from "../transcribe/match.ts";
import { TranscriptionWithSets } from "../transcribe/schema.ts";

export const MAX_REPAIRS = 2;

export interface JobConfig {
  /** Each stage's model, from apps/api/models.json. */
  /** A model per stage; the second planner and second reviewer may be absent, as in a job recorded before them (ADR-0043, ADR-0044). */
  readonly stages: Readonly<Partial<Record<Stage, string | null>>>;
  readonly structuredOutput: Readonly<Record<string, boolean>>;
}

export interface JobSink {
  emit(state: JobState, step: string, message: string): void;
  /** Keeps a named artifact of the job, as JSON. */
  artifact(name: string, value: unknown): void;
}

export type JobSource =
  | { readonly kind: "arxiv" | "pmc"; readonly id: string }
  /** A PDF given on this machine, its bytes and its file's name (ADR-0038). */
  | { readonly kind: "pdf"; readonly bytes: Uint8Array; readonly name: string }
  | { readonly kind: "ingested"; readonly text: SourceText; readonly register: SourceRegisterEntry };

export interface JobInput {
  readonly source: JobSource;
  readonly client: ModelClient;
  readonly config: JobConfig;
  readonly fetch: Fetch;
  /** The worked example the planner reads: another world's levels, in brief. */
  readonly example: string;
  readonly now?: () => string;
  readonly signal?: AbortSignal;
}

export interface JobOutcome {
  readonly state: JobState;
  readonly message: string;
  /** The world, when the job is ready. */
  readonly world: Record<string, unknown> | null;
}

/** How a job ends early, and why. */
class Stop extends Error {
  readonly state: "needs_information" | "unsupported" | "failed" | "cancelled";
  constructor(state: Stop["state"], message: string) {
    super(message);
    this.state = state;
  }
}

export async function runJob(input: JobInput, sink: JobSink): Promise<JobOutcome> {
  // Moved by the closures below, so declared wide.
  let state = "received" as JobState;
  let repairs = 0;
  const move = (to: JobState, step: string, message: string): void => {
    if (!canMove(state, to)) throw new Error(`the controller cannot move from ${state} to ${to}`);
    state = to;
    sink.emit(to, step, message);
  };
  const say = (step: string, message: string): void => sink.emit(state, step, message);
  const modelFor = (stage: Stage): string => {
    const model = input.config.stages[stage];
    if (!model) throw new Stop("failed", `no model is chosen for the ${stage} stage in apps/api/models.json`);
    return model;
  };
  const structured = (model: string): boolean => input.config.structuredOutput[model] ?? false;
  const cancelled = (): void => {
    if (input.signal?.aborted) throw new Stop("cancelled", "the job was cancelled");
  };

  const asked = input.source.kind === "ingested" ? input.source.register.sourceId : input.source.kind === "pdf" ? `a PDF, ${input.source.name}` : `${input.source.kind}:${input.source.id}`;
  sink.emit("received", "the request", `received ${asked}`);
  try {
    // Parsing: fetch and read the source with the restricted readers.
    move("parsing", "ingest", "fetching the source and reading it");
    let text: SourceText;
    let register: SourceRegisterEntry;
    if (input.source.kind === "ingested") ({ text, register } = { text: input.source.text, register: input.source.register });
    else {
      const given = input.source;
      const fetched = given.kind === "pdf" ? await fromOwnerPdf(given.bytes, given.name) : given.kind === "arxiv" ? await fetchArxiv(input.fetch, given.id) : await fetchPmc(input.fetch, given.id);
      ({ entry: register, text } = registerAndText(fetched, input.now?.() ?? new Date().toISOString()));
      // A PDF's display equations that could not be read are said, never guessed at.
      if (fetched.refused && fetched.refused.length > 0) say("ingest", `from the PDF, ${fetched.refused.length} display equation(s) could not be read: ${fetched.refused.map((equation) => `(${equation.number}) on page ${equation.page}, ${equation.reason}`).join("; ")}`);
    }
    sink.artifact("register", register);
    sink.artifact("sanitiser", promptSource(text).removals);
    say("ingest", `read "${register.title}": ${text.sections.length} sections, ${text.equations.length} display equations; licence ${register.licence}`);
    cancelled();

    // Planning: route, read, transcribe twice, match.
    move("planning", "routing", "deciding which family covers the paper's mechanism");
    const title = register.title;
    const front = text.sections.find((section) => section.title === "Abstract");
    const routed = await route(input.client, modelFor("router"), { title, abstract: front ? text.text.slice(front.start, front.end) : text.text.slice(0, 2000), equations: text.equations.slice(0, 6).map((equation) => equation.latex.slice(0, 300)) }, { structuredOutput: structured(modelFor("router")) });
    sink.artifact("route", routed.value);
    if (routed.value.family !== "compartments" || routed.value.tier !== "A") {
      throw new Stop("unsupported", `the router sends this paper to ${routed.value.family}, tier ${routed.value.tier}: ${routed.value.reason} PaperPlay generates compartment-model worlds only, so far.`);
    }
    say("routing", `compartments, tier A: ${routed.value.reason}`);
    cancelled();
    say("reading", "reading what the paper asks and shows");
    const reading = await read(input.client, modelFor("reader"), text, title, { structuredOutput: structured(modelFor("reader")) });
    sink.artifact("reading", reading.value);
    say("transcription", "the first transcription of the model");
    let first = (await transcribe(input.client, modelFor("transcriber"), text, title, { structuredOutput: structured(modelFor("transcriber")) })).value;
    say("transcription", "the second transcription, by another vendor's model, which never sees the first");
    const second = (await transcribe(input.client, modelFor("second-transcriber"), text, title, { structuredOutput: structured(modelFor("second-transcriber")), stage: "second-transcriber" })).value;
    sink.artifact("transcription-first", first);
    sink.artifact("transcription-second", second);
    // The first transcription's quotes become the world's anchors, so every one must be found; the
    // second exists to check the structure, so only its structure is compared, quotes aside.
    // A paper with several value sets: each transcription's sets, the rule's pick from each, and the
    // two compared by the values they share; the others become the model's named alternatives.
    const resolved = (transcription: TranscriptionWithSets) => {
      const sets = transcription.valueSets ?? [];
      if (sets.length === 0) return { transcription, sets, pick: null, problems: [] as readonly string[] };
      const pick = pickValueSet(sets, text);
      if (!pick.set) return { transcription, sets, pick, problems: [] as readonly string[] };
      const applied = withValueSet(transcription, pick.set);
      return { transcription: applied.transcription, sets, pick, problems: applied.problems };
    };
    const compare = () => {
      const first_ = resolved(first);
      const second_ = resolved(second);
      const sets = first_.sets.length + second_.sets.length > 0 ? compareValueSets(first_.sets, second_.sets) : null;
      const picked = (side: typeof first_) => (side.pick && side.pick.set ? side.pick.set : null);
      const pickA = picked(first_);
      const pickB = picked(second_);
      const setProblems = [...first_.problems, ...(sets?.problems ?? [])];
      if (pickA && pickB && sets?.pairs[pickA.id] !== pickB.id) setProblems.push(`the rule picks "${pickA.label}" from the first and "${pickB.label}" from the second, which are not the same set`);
      const a = toModelSpec(first_.transcription, text, { alternatives: first_.sets.filter((set) => set !== pickA) });
      const b = modelForComparison(second_.transcription, text);
      const match = a.model && b ? matchModels(a.model, b) : null;
      const ambiguous = [first_.pick, second_.pick].map((pick) => (pick && !pick.set ? pick.ambiguous : null)).find((reason) => reason !== null) ?? null;
      return { a, b, match, sets, setProblems, pickA: first_.pick, ambiguous };
    };
    let compared = compare();
    const undecided = (): void => {
      if (compared.ambiguous) throw new Stop("needs_information", `the paper states several sets of values and the rule cannot pick one: ${compared.ambiguous}. The owner decides which a world uses.`);
    };
    undecided();
    const agree = (): boolean => compared.match?.structural === true && compared.match.values && compared.a.problems.length === 0 && compared.setProblems.length === 0;
    if (!agree()) {
      if (repairs >= MAX_REPAIRS) throw new Stop("needs_information", "the two transcriptions disagree, and no repair is left");
      repairs++;
      const why = [...compared.setProblems, ...compared.a.problems, ...(compared.b ? [] : ["the second transcription does not become a model"]), ...(compared.match?.problems ?? [])].slice(0, 8);
      move("repairing", "transcription", `the two transcriptions disagree (${why.join("; ") || "they could not be compared"}); asking the first transcriber to check against the paper`);
      const messages = transcriberMessages(text, title);
      const retried = await completeStructured(
        input.client,
        {
          stage: "transcriber",
          model: modelFor("transcriber"),
          messages: [...messages, { role: "assistant", content: JSON.stringify(first) }, { role: "user", content: `A second, independent reading of the paper disagrees with yours here:\n${why.map((line) => `- ${line}`).join("\n")}\nCheck each against the paper's own equations, table and text, and give the whole transcription again, corrected where the paper says so. Every quote must be copied exactly.` }],
          temperature: 0,
          maxTokens: TRANSCRIBER_MAX_TOKENS,
        },
        TranscriptionWithSets,
        { name: "transcription", structuredOutput: structured(modelFor("transcriber")) },
      );
      first = retried.value;
      sink.artifact("transcription-first-repaired", first);
      compared = compare();
      move("planning", "transcription", agree() ? "the repaired transcription agrees with the second" : "the transcriptions still disagree");
      undecided();
      if (!agree()) throw new Stop("needs_information", `the two transcriptions still disagree: ${[...compared.setProblems, ...compared.a.problems, ...(compared.match?.problems ?? [])].slice(0, 6).join("; ") || "they could not be compared"}. The model is not verified, so the owner decides.`);
    }
    sink.artifact("match", compared.match);
    if (compared.sets) sink.artifact("value-sets", { comparison: compared.sets, pick: compared.pickA });
    if (compared.a.unstated.length > 0) throw new Stop("needs_information", `the paper does not state ${compared.a.unstated.join(", ")}; a world needs every value`);
    const transcribed = compared.a.model;
    if (!transcribed) throw new Stop("failed", "the transcription did not become a model");
    const horizon = horizonOf(transcribed);
    const dt = chooseStep(transcribed, horizon * 2);
    if (dt === null) throw new Stop("unsupported", "the model is too stiff for the solver at any step it offers: the accuracy check refuses it, so it is never drawn wrong");
    const model: ModelSpec = { ...transcribed, solver: { ...transcribed.solver, dt } };
    sink.artifact("model", model);
    const onSet = compared.pickA?.set ? `, on the paper's set "${compared.pickA.set.label}" (${compared.pickA.reason})` : "";
    say("transcription", `the two transcriptions agree up to renaming, values included${onSet}; the solver's step is ${dt} ${model.timeUnit}`);
    cancelled();

    // Running the paper's own numbers (ADR-0040): deterministic, with no model call, before anything is planned.
    const ownNumbers = runOwnNumbers({ source: text, model, headline: reading.value.result });
    sink.artifact("own-numbers", ownNumbers);
    say("own numbers", `running the paper's own numbers: ${ownNumbers.summary}`);
    if (ownNumbers.stop !== null) throw new Stop("needs_information", ownNumbers.stop);
    cancelled();

    say("planning", "planning the levels");
    const behaviour = describeBehaviour(model, horizon);
    const response = describeResponse(model, horizon);
    const plannerModel = modelFor("planner");
    const forPlanner = { verdict: ownNumbers.verdict, summary: ownNumbers.summary, observation: ownNumbers.observation };
    const plannerInput = { title, reading: reading.value, model, example: input.example, behaviour, response, ownNumbers: forPlanner };

    /**
     * Every level of a plan judged by the deterministic rules before any words are written: the
     * builder, the level rule, the visibility rule and the findings check. A level that does not
     * build is judged by that alone, and the rest are built without it.
     */
    /**
     * The rules a plan's words do not touch, level by level (ADR-0044, corrected 2026-10-18): a
     * definitional level, and a hook that does not measure the spread its headline speaks of.
     */
    const ruleProblems = (candidate: Plan): readonly (readonly string[])[] => {
      const named = namedInModel(candidate, model);
      return named.levels.map((level, index) => {
        const tag = directEffectOf(model, level.control.parameter, level.difference.compartment, level.difference);
        const spread = index === 0 ? hookSpreadProblem(model, reading.value.result, level.difference.compartment) : null;
        return [...(tag.definitional ? [definitionalProblem(tag)] : []), ...(spread ? [spread] : [])];
      });
    };
    const assess = (candidate: Plan): { readonly problems: readonly (readonly string[])[]; readonly holds: readonly number[] } => {
      const assembled = (levels: readonly number[]) => buildWorld(assembleWorld({ source: text, register, reading: reading.value, model, plan: { ...candidate, levels: levels.flatMap((index) => (candidate.levels[index] ? [candidate.levels[index]] : [])) }, explanation: { levels: [] }, routingReason: routed.value.reason, ownNumbers }).spec, registry);
      const all = candidate.levels.map((_, index) => index);
      let result = assembled(all);
      const broken = new Map<number, string[]>();
      if (!result.ok) {
        for (const problem of result.problems) {
          const at = /^levels\.(\d+)/.exec(problem.path)?.[1];
          if (at !== undefined) broken.set(Number(at), [...(broken.get(Number(at)) ?? []), problem.message]);
        }
        const rest = all.filter((index) => !broken.has(index));
        if (broken.size === 0 || rest.length === 0) return { problems: all.map(() => ["the world does not build"]), holds: all.map(() => 0) };
        result = assembled(rest);
        if (!result.ok) return { problems: all.map(() => ["the world does not build"]), holds: all.map(() => 0) };
      }
      const built = result.world;
      const rest = all.filter((index) => !broken.has(index));
      const swept = sweepLevels(built);
      const seen = visibilityOf(built);
      const found = checkFindings(candidate, reading.value, text);
      const rules = ruleProblems(candidate);
      const problems = all.map((index) => {
        const at = rest.indexOf(index);
        if (at < 0) return broken.get(index) ?? [];
        const level = swept[at];
        const visible = seen[at];
        return [...(level && !level.meets ? [`its claim holds on ${level.holds} of 20 starts`] : []), ...(visible && !visible.visible ? ["its difference is too small to see"] : []), ...(found.levels[index] ?? []), ...(rules[index] ?? [])];
      });
      return { problems, holds: all.map((index) => swept[rest.indexOf(index)]?.holds ?? 0) };
    };

    // Two planners from different vendors (ADR-0043): each plans the world; the deterministic rules
    // judge every level of both, and each slot keeps the better level, the first planner's on a tie.
    const secondPlannerModel = input.config.stages["second-planner"] ?? null;
    const [firstPlan, secondPlan] = await Promise.all([
      planWorld(input.client, plannerModel, plannerInput),
      secondPlannerModel === null
        ? Promise.resolve(null)
        : planWorld(input.client, secondPlannerModel, plannerInput, { stage: "second-planner" }).catch((error: unknown) => {
            say("planning", `the second planner, ${secondPlannerModel}, gave no plan the schema reads (${(error instanceof Error ? error.message : String(error)).split("\n")[0] ?? ""}); the first planner's plan is used alone`);
            return null;
          }),
    ]);
    let plan: Plan = firstPlan.value;
    /** Which planner each level came from, in step with the plan (ADR-0043). */
    let sources: string[] = plan.levels.map(() => plannerModel);
    if (secondPlan && secondPlannerModel !== null) {
      const a = firstPlan.value;
      const b = secondPlan.value;
      const [ja, jb] = [assess(a), assess(b)];
      const score = (problems: readonly string[] | undefined, holds: number | undefined): readonly number[] => (problems === undefined ? [-1, -Infinity, -1] : [problems.length === 0 ? 1 : 0, -problems.length, holds ?? 0]);
      const secondWins = (index: number): boolean => {
        const [sa, sb] = [score(a.levels[index] ? ja.problems[index] : undefined, ja.holds[index]), score(b.levels[index] ? jb.problems[index] : undefined, jb.holds[index])];
        for (let at = 0; at < sa.length; at++) if ((sb[at] ?? 0) !== (sa[at] ?? 0)) return (sb[at] ?? 0) > (sa[at] ?? 0);
        return false;
      };
      const slots = Array.from({ length: Math.max(a.levels.length, b.levels.length) }, (_, index) => index);
      const picks = slots.map((index) => (secondWins(index) ? "second" : "first"));
      let merged: Plan = { ...a, levels: slots.flatMap((index) => { const level = picks[index] === "second" ? b.levels[index] : a.levels[index]; return level ? [level] : []; }) };
      let mergedSources = slots.flatMap((index) => ((picks[index] === "second" ? b.levels[index] : a.levels[index]) ? [picks[index] === "second" ? secondPlannerModel : plannerModel] : []));
      // The kept levels must still test enough of the paper's findings together; if not, the better whole plan.
      if (checkFindings(merged, reading.value, text).world.length > 0) {
        const passing = (judged: typeof ja) => judged.problems.filter((problems) => problems.length === 0).length;
        const whole = passing(jb) > passing(ja) ? "second" : "first";
        merged = whole === "second" ? b : a;
        mergedSources = merged.levels.map(() => (whole === "second" ? secondPlannerModel : plannerModel));
      }
      plan = merged;
      sources = mergedSources;
      sink.artifact("plan-choice", slots.map((index) => ({ level: index + 1, kept: picks[index] === "second" ? secondPlannerModel : plannerModel, first: { title: a.levels[index]?.title ?? null, problems: ja.problems[index] ?? [] }, second: { title: b.levels[index]?.title ?? null, problems: jb.problems[index] ?? [] } })));
      const passingOf = (judged: typeof ja, candidate: Plan) => `${judged.problems.filter((problems, index) => problems.length === 0 && candidate.levels[index]).length} of ${candidate.levels.length}`;
      say("planning", `two planners planned: ${plannerModel}, ${passingOf(ja, a)} levels meeting the rules; ${secondPlannerModel}, ${passingOf(jb, b)}; kept ${sources.map((source, index) => `level ${index + 1} from ${source}`).join(", ")}`);
    }
    const passages = promptSource(text, { maxCharacters: 60_000 }).block;
    const modelWords = `${describeBehaviour(model, horizon).split("\n").slice(0, 3).join("\n")}`;
    const explainerModel = modelFor("explainer");
    let explanation: Explanation = (await explain(input.client, explainerModel, { title, plan, passages, model: modelWords }, { structuredOutput: structured(explainerModel) })).value;

    /**
     * Asks the planner to change only the named levels, keeping the rest. A repair that runs out of
     * room before it writes anything is asked again with twice the room; one that still cannot be
     * read changes nothing, and the plan stays as it was: the repair is spent, and the rules then
     * drop the levels it was to mend, as after any repair that fails (CLAUDE.md, boundary 5).
     */
    const replan = async (problems: readonly string[]): Promise<void> => {
      repairs++;
      move("repairing", "planning", `asking the planner to change only the levels with problems: ${problems.slice(0, 4).join("; ")}`);
      const messages = plannerMessages({ title, reading: reading.value, model, example: input.example, behaviour, response, ownNumbers: forPlanner });
      let replanned: { readonly value: Plan };
      try {
        replanned = await completeStructured(
          input.client,
          { stage: "planner", model: plannerModel, messages: [...messages, { role: "assistant", content: JSON.stringify(plan) }, { role: "user", content: `These problems were found:\n${problems.map((line) => `- ${line}`).join("\n")}\nChange only the levels named, as little as fixes them, and give the whole plan again.` }], temperature: 0, maxTokens: PLANNER_MAX_TOKENS },
          Plan,
          { name: "plan", structuredOutput: false, moreRoom: true },
        );
      } catch (error) {
        if (!(error instanceof ModelError) || error.kind !== "invalid-response") throw error;
        say("planning", `the planner's repair could not be read, so the plan stays as it was: ${error.message.replace(/\s+/g, " ").slice(0, 400)}`);
        return;
      }
      // A level the repair changed is the repairing planner's now.
      sources = replanned.value.levels.map((level, index) => (JSON.stringify(level) === JSON.stringify(plan.levels[index]) ? (sources[index] ?? plannerModel) : `${plannerModel}, in repair`));
      plan = replanned.value;
      explanation = (await explain(input.client, explainerModel, { title, plan, passages, model: modelWords }, { structuredOutput: structured(explainerModel) })).value;
    };

    /** How a level's control, and its What-if's value when another, move the model: its rows of the response table, for a repair (ADR-0040). */
    const responseOf = (index: number): string => {
      const level = plan.levels[index];
      if (!level) return "";
      const rows = responseRows(model, horizon, [...new Set([level.control.parameter, level.whatIf.parameter])]);
      return rows === "" ? "" : `; how its control moves the model, each halved and doubled: ${rows.split("\n").join("; ")}`;
    };

    // The hook is never dropped (ADR-0040). When it fails after its repairs and the paper's own numbers
    // confirmed its headline does not appear at the paper's values, the first passing level on an
    // anchored finding takes its place, saying why; any other failing level is dropped, its reasons kept.
    const findingsOf = [reading.value.result, ...reading.value.findings];
    let hookFinding = 0;
    let hookFallback: string | null = null;
    const dropped: { readonly level: number; readonly title: string; readonly reasons: readonly string[] }[] = [];
    /** The levels whose words were written again once already, by title (ADR-0044). */
    const reworded = new Set<string>();
    /** Every review's decisions, pass by pass, each with its reason (ADR-0044). */
    const reviewDecisions: (ReviewRecord & { readonly pass: number })[] = [];
    let reviewPasses = 0;
    const dropFailing = (failing: readonly number[], reasonsOf: (index: number) => readonly string[], stopAs: "failed" | "needs_information", words: readonly string[]): number => {
      const failingSet = new Set(failing);
      let hookFrom: number | null = null;
      if (failingSet.has(0)) {
        const candidates = plan.levels
          .map((level, index) => ({ level, index }))
          .filter(({ level, index }) => index !== 0 && !failingSet.has(index) && level.finding !== null && level.finding > 0 && findQuote(text.text, findingsOf[level.finding]?.quote ?? "") !== null)
          .sort((a, b) => (a.level.finding ?? 0) - (b.level.finding ?? 0));
        hookFrom = ownNumbers.verdict === "mismatch" ? (candidates[0]?.index ?? null) : null;
        if (hookFrom === null) {
          throw new Stop(stopAs, `level 1, the hook on the paper's headline, still fails after its repairs, and the hook is never dropped${ownNumbers.verdict === "mismatch" ? "; no other level tests an anchored finding the model shows" : ""}: ${words.join("; ")}`);
        }
      }
      const order = [...(hookFrom === null ? [] : [hookFrom]), ...plan.levels.map((_, index) => index).filter((index) => !failingSet.has(index) && index !== hookFrom)];
      if (order.length < 3) throw new Stop(stopAs, `too few levels meet the rules: ${words.join("; ")}`);
      dropped.push(...failing.map((index) => ({ level: index + 1, title: plan.levels[index]?.title ?? "", reasons: reasonsOf(index) })));
      if (hookFrom !== null) {
        const finding = plan.levels[hookFrom]?.finding ?? 0;
        hookFinding = finding;
        hookFallback = `The paper's headline does not appear in this world at the values it lists, and its direction does not show here either, so this level tests another of its findings: ${findingsOf[finding]?.text ?? ""}`;
      }
      sources = order.map((index) => sources[index] ?? plannerModel);
      plan = { ...plan, levels: order.flatMap((index) => (plan.levels[index] ? [plan.levels[index]] : [])) };
      explanation = { levels: order.flatMap((index) => (explanation.levels[index] ? [explanation.levels[index]] : [])) };
      sink.artifact("dropped", dropped);
      return order.length;
    };
    /** The check's findings for the world, with level 1's fallback said on its page and beside its goal. */
    const ownNumbersForWorld = () =>
      hookFallback === null ? ownNumbers : { ...ownNumbers, observation: hookFallback, statements: [...ownNumbers.statements, { text: hookFallback, origin: "computed-observation" as const, anchors: [] }] };

    /** What a level's first start, the world's own values, measured: so a repair can aim its claim. */
    const measuredAt = (level: LevelResult): string => {
      const first = level.skies[0];
      if (!first) return "";
      const shown = (value: number): string => (Number.isFinite(value) ? Number(value.toPrecision(3)).toString() : "never");
      const way = first.there > first.here ? "higher" : first.there < first.here ? "lower" : "the same";
      return `; at the world's own values this world measures ${shown(first.here)} and the What-if ${shown(first.there)}, ${way}${way === "the same" ? "" : ` by ${shown(Math.abs(first.there - first.here))}`}`;
    };

    // Building and running: assemble, build, sweep; the level rule, the visibility rule and the
    // findings check (ADR-0037); repair the levels that fail, or drop them. Then checking, where the
    // reviewer may send a definitional level back for repair.
    let built: BuiltWorld | null = null;
    let swept: LevelResult[] = [];
    let spec: Record<string, unknown> = {};
    for (;;) {
      for (;;) {
        move("building", "assembly", "assembling the world and building it against the solver");
        const assembled = assembleWorld({ source: text, register, reading: reading.value, model, plan, explanation, routingReason: routed.value.reason, ownNumbers: ownNumbersForWorld() });
        spec = assembled.spec;
        for (const note of assembled.notes) say("assembly", note);
        const result = buildWorld(spec, registry);
        if (!result.ok) {
          const byLevel = result.problems.map((problem) => `${/^levels\.(\d+)/.test(problem.path) ? `level ${Number(/^levels\.(\d+)/.exec(problem.path)?.[1]) + 1}` : problem.path}: ${problem.message}`);
          sink.artifact("build-problems", result.problems);
          if (repairs < MAX_REPAIRS) {
            await replan(byLevel);
            continue;
          }
          // No repair left: drop the levels that do not build, never the hook, if three remain.
          const failing = [...new Set(result.problems.map((problem) => /^levels\.(\d+)/.exec(problem.path)?.[1]).filter((index): index is string => index !== undefined).map(Number))];
          if (failing.length === 0) throw new Stop("failed", `the world does not build: ${byLevel.slice(0, 4).join("; ")}`);
          const kept = dropFailing(failing, (index) => result.problems.filter((problem) => problem.path.startsWith(`levels.${index}.`)).map((problem) => problem.message), "failed", byLevel.slice(0, 4));
          move("repairing", "assembly", `dropping ${failing.length} level(s) that do not build, keeping ${kept}: ${dropped.slice(-failing.length).map((entry) => `"${entry.title}", ${entry.reasons.join("; ")}`).join("; ")}`);
          continue;
        }
        built = result.world;
        move("running", "level rule", `sweeping every What-if over 20 starts: the world's values and 19 within a tenth of them`);
        swept = sweepLevels(built);
        sink.artifact("level-rule", swept);
        // Beside the level rule, the visibility rule: the difference must show on the chart and in the scene.
        const seen = visibilityOf(built);
        sink.artifact("visibility", seen);
        // And the findings check: the hook on the headline result, three levels on anchored findings.
        const found = checkFindings(plan, reading.value, text, hookFinding);
        sink.artifact("findings", found);
        // And the rules the words do not touch: definitional levels, and a hook off the headline's spread.
        const rules = ruleProblems(plan);
        sink.artifact("definitional", rules);
        const problemsOf = (index: number): string[] => {
          const level = swept[index];
          const visible = seen[index];
          return [
            ...(level && !level.meets ? [`its claim holds on ${level.holds} of 20 starts, fewer than 16${measuredAt(level)}`] : []),
            ...(visible && !visible.visible ? [`its difference is too small to see: ${visible.why ?? ""}`] : []),
            ...(found.levels[index] ?? []),
            ...(rules[index] ?? []),
          ];
        };
        const failing = plan.levels.map((_, index) => index).filter((index) => problemsOf(index).length > 0);
        if (failing.length === 0 && found.world.length === 0) break;
        const words = [
          ...failing.map((index) => `level ${index + 1} ("${plan.levels[index]?.title ?? ""}"): ${problemsOf(index).join("; ")}`),
          ...found.world,
        ];
        if (repairs < MAX_REPAIRS) {
          await replan([...failing.map((index) => `level ${index + 1} ("${plan.levels[index]?.title ?? ""}"): ${problemsOf(index).join("; ")}${responseOf(index)}`), ...found.world]);
          continue;
        }
        const keep = dropFailing(failing, problemsOf, "failed", words);
        if (checkFindings(plan, reading.value, text, hookFinding).world.length > 0) throw new Stop("failed", `the levels left do not test enough of the paper's findings: ${words.join("; ")}`);
        say("level rule", `dropped ${failing.length} level(s) the rules refuse, keeping ${keep}: ${dropped.slice(-failing.length).map((entry) => `"${entry.title}", ${entry.reasons.join("; ")}`).join(" | ")}${hookFallback !== null && failing.includes(0) ? `; level 1 now tests finding ${hookFinding}, as the headline does not show` : ""}`);
        move("repairing", "level rule", "rebuilding without the dropped levels");
      }
      say("level rule", `every level meets the rule, shows its difference and tests what the paper found: ${swept.map((level) => `level ${level.order} ${level.holds} of 20`).join(", ")}`);

      // Checking: provenance, then the reviewer, who can suggest but never overturn a check.
      move("checking", "provenance", "checking every anchor quotes the source exactly");
      const provenance = checkProvenance(spec, text);
      sink.artifact("provenance", provenance);
      if (provenance.length > 0) throw new Stop("failed", `provenance fails: ${provenance.slice(0, 3).map((problem) => `${problem.path}: ${problem.message}`).join("; ")}`);
      // Two reviewers of different vendors (ADR-0044), each given the equations and every level's
      // direct-effect tag. One reviewer's unsupported block sends a level's words back, unless the
      // model refutes what it claims; any other block stands only where both make it, and a
      // definitional one only on a level the code finds definitional. Every decision is kept.
      const reviewerModel = modelFor("reviewer");
      const secondReviewerModel = input.config.stages["second-reviewer"] ?? null;
      say("review", secondReviewerModel === null ? "the reviewer reads the world and the checks' results" : `two reviewers, ${reviewerModel} and ${secondReviewerModel}, read the world and the checks' results`);
      const checks = ["The builder: passed, the family's checks included.", `The level rule: ${swept.map((level) => `level ${level.order} holds on ${level.holds} of 20`).join("; ")}.`, "The visibility rule: every level's difference shows on its chart and in the scene.", "Provenance: every anchor quotes the source exactly."].join("\n");
      const worldWords = plan.levels.map((level: PlanLevel, index) => `Level ${index + 1}, ${level.title}: ${level.goal} Control: ${level.control.label}. What if: ${level.whatIf.prompt} It states: ${level.effect}`).join("\n");
      const named = namedInModel(plan, model);
      const tags = named.levels.map((level) => directEffectOf(model, level.control.parameter, level.difference.compartment, level.difference));
      const reviewInput = { title, world: worldWords, checks, passages, equations: equationsOf(model), evidence: tags.map((tag, index) => `Level ${index + 1}: ${describeDirectEffect(tag)}.`).join("\n") };
      const [reviewed, secondReviewed] = await Promise.all([
        review(input.client, reviewerModel, reviewInput, { structuredOutput: structured(reviewerModel) }).then((result) => result.value),
        secondReviewerModel === null ? Promise.resolve(null) : review(input.client, secondReviewerModel, reviewInput, { structuredOutput: structured(secondReviewerModel), stage: "second-reviewer" }).then((result) => result.value),
      ]);
      sink.artifact("review", reviewed);
      if (secondReviewed) sink.artifact("second-review", secondReviewed);
      const decisions = decideReviews(model, named, tags, [{ model: reviewerModel, review: reviewed }, ...(secondReviewed && secondReviewerModel ? [{ model: secondReviewerModel, review: secondReviewed }] : [])]);
      reviewPasses++;
      reviewDecisions.push(...decisions.records.map((record) => ({ pass: reviewPasses, ...record })));
      sink.artifact("review-decisions", reviewDecisions);
      for (const record of decisions.records.filter((entry) => entry.blocking && !entry.stands)) say("review", `level ${record.level ?? "?"}: ${record.reviewer}'s ${record.kind} block does not stand: ${record.reason}`);
      const definitional = decisions.standing("definitional");
      const misworded = decisions.standing("unsupported");
      const blocksOn = (index: number, kind: string): string => [reviewed, secondReviewed].flatMap((entry) => entry?.findings.filter((finding) => finding.level === index + 1 && finding.kind === kind && finding.severity === "blocking") ?? []).map((finding) => `${finding.finding} ${finding.suggestion}`).join(" ");
      if (definitional.length > 0) {
        const words = definitional.map((index) => `level ${index + 1} ("${plan.levels[index]?.title ?? ""}"): ${secondReviewed ? "both reviewers find" : "the reviewer finds"} its effect follows from the model's definitions alone: ${blocksOn(index, "definitional")}; test one of the paper's findings instead`);
        if (repairs < MAX_REPAIRS) {
          await replan(definitional.map((index, at) => `${words[at] ?? ""}${responseOf(index)}`));
          continue;
        }
        const reviewerWords = (index: number): string[] => [`definitional, by ${decisions.records.filter((record) => record.level === index + 1 && record.kind === "definitional" && record.stands).map((record) => `${record.reviewer} (${record.term ?? ""})`).join(" and ")}`];
        const keep = dropFailing(definitional, reviewerWords, "needs_information", words.map((line) => `${line}. The owner decides`));
        if (checkFindings(plan, reading.value, text, hookFinding).world.length > 0) throw new Stop("needs_information", `dropping the levels the reviewers find definitional leaves too few on the paper's findings: ${words.join("; ")}. The owner decides.`);
        move("repairing", "review", `dropping ${definitional.length} level(s) the reviewers find definitional, keeping ${keep}`);
        continue;
      }
      // Words that misdescribe the model go back to the explainer, once a level; if they survive it, the level is dropped.
      if (misworded.length > 0) {
        const again = misworded.filter((index) => reworded.has(plan.levels[index]?.title ?? ""));
        const first = misworded.filter((index) => !again.includes(index));
        if (again.length > 0) {
          const words = again.map((index) => `level ${index + 1} ("${plan.levels[index]?.title ?? ""}"): its words still misdescribe the model after they were written again: ${blocksOn(index, "unsupported")}`);
          const keep = dropFailing(again, (index) => [`its words still misdescribe the model after they were written again: ${blocksOn(index, "unsupported")}`], "needs_information", words.map((line) => `${line}. The owner decides`));
          if (checkFindings(plan, reading.value, text, hookFinding).world.length > 0) throw new Stop("needs_information", `dropping the levels whose words still misdescribe the model leaves too few on the paper's findings: ${words.join("; ")}. The owner decides.`);
          move("repairing", "review", `dropping ${again.length} level(s) whose words still misdescribe the model, keeping ${keep}`);
          continue;
        }
        move("repairing", "review", `writing again the words of ${first.map((index) => `level ${index + 1} ("${plan.levels[index]?.title ?? ""}")`).join(", ")}, which a reviewer finds misdescribe the model`);
        for (const index of first) {
          const problem = `${blocksOn(index, "unsupported")}\nThe model's equations, in its ids:\n${equationsOf(model)}`;
          const words = (await reword(input.client, explainerModel, { title, plan, passages, model: modelWords }, index, problem, { structuredOutput: structured(explainerModel) })).value;
          const { goal, effect, ...level } = words;
          reworded.add(plan.levels[index]?.title ?? "");
          plan = { ...plan, levels: plan.levels.map((entry, at) => (at === index ? { ...entry, goal, effect } : entry)) };
          explanation = { levels: explanation.levels.map((entry, at) => (at === index ? level : entry)) };
        }
        continue;
      }
      const blocking = [reviewed, secondReviewed].flatMap((entry) => entry?.findings.filter((finding) => finding.severity === "blocking") ?? []);
      if (blocking.length > 0) {
        say("review", `the reviewers found ${blocking.length} blocking finding(s) that do not stand, advice only: the checks decide. ${blocking.map((finding) => finding.finding).join(" ")}`);
      } else say("review", `the reviewer found nothing blocking (${reviewed.findings.length + (secondReviewed?.findings.length ?? 0)} piece(s) of advice)`);
      break;
    }
    sink.artifact("plan-sources", plan.levels.map((level, index) => ({ level: index + 1, title: level.title, planner: sources[index] ?? plannerModel })));
    sink.artifact("world", spec);
    move("ready", "ready", `the world is built and checked: ${plan.levels.length} levels, every one meeting the level rule, showing its difference and testing the paper's findings, every anchor in the source`);
    return { state, message: "ready", world: spec };
  } catch (error) {
    const stop = error instanceof Stop ? error : new Stop("failed", error instanceof Error ? error.message.split("\n")[0] ?? "" : String(error));
    if (state !== stop.state && canMove(state, stop.state)) move(stop.state, "stopped", stop.message);
    else sink.emit(stop.state === "failed" || stop.state === "cancelled" ? stop.state : "failed", "stopped", stop.message);
    return { state: stop.state, message: stop.message, world: null };
  }
}
