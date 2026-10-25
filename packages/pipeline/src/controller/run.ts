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
import { explainLevel, reword, type ExplainedLevel, type Explanation } from "../stages/explainer.ts";
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

/**
 * The day the rules a world is judged by last changed (ADR-0044's second amendment): a world kept
 * from before it is never served as made under today's rules (R13, ADR-0053).
 */
export const RULES_VERSION = "2026-10-20";

/**
 * A job's deadline (R13, ADR-0053): the whole job's time, and each stage's longest call within it.
 * A call that runs past either is ended; a repair is asked for only when what it is expected to
 * take, from this job's own calls, still fits, and otherwise the levels that pass ship.
 */
export interface Deadline {
  readonly jobMs: number;
  readonly stageMs: Readonly<Partial<Record<Stage, number>>>;
  readonly clock?: () => number;
}

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
  /** Without one, a job takes as long as its calls do, as before 2026-10-24. */
  readonly deadline?: Deadline;
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
  /** How many levels the latest release holds (R13): said if the job stops at its deadline. */
  let released = 0;
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

  // The deadline (R13, ADR-0053): every call bounded by its stage's time and what is left of the
  // job's, and how long each stage's calls took here, for what a repair would cost.
  const clock = input.deadline?.clock ?? (() => Date.now());
  const began = clock();
  const left = (): number => (input.deadline ? input.deadline.jobMs - (clock() - began) : Number.POSITIVE_INFINITY);
  const took = new Map<Stage, number>();
  const timed = async <T>(stage: Stage, call: (client: ModelClient) => Promise<T>): Promise<T> => {
    const limit = Math.min(input.deadline?.stageMs[stage] ?? Number.POSITIVE_INFINITY, left());
    if (!Number.isFinite(limit)) return call(input.client);
    if (limit <= 0) throw new ModelError("timeout", `the job's time ran out before the ${stage} call`);
    const controller = new AbortController();
    const client: ModelClient = { complete: (request) => input.client.complete({ ...request, signal: controller.signal }) };
    const started = clock();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        call(client),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new ModelError("timeout", `the ${stage} call ran past its ${Math.round(limit / 1000)} s`));
          }, limit);
        }),
      ]);
      took.set(stage, Math.max(took.get(stage) ?? 0, clock() - started));
      return result;
    } finally {
      clearTimeout(timer);
    }
  };
  const outOfTime = (error: unknown): boolean => error instanceof ModelError && error.kind === "timeout";
  const settle = <T>(promise: Promise<T>): Promise<{ readonly value: T; readonly error: null } | { readonly value: null; readonly error: unknown }> =>
    promise.then(
      (value) => ({ value, error: null }),
      (error: unknown) => ({ value: null, error }),
    );
  /** What the named stages are expected to take: as long as they took in this job, or their whole time if they have not run. */
  const expected = (stages: readonly Stage[]): number => stages.reduce((sum, stage) => sum + (took.get(stage) ?? input.deadline?.stageMs[stage] ?? 0), 0);
  const seconds = (ms: number): string => `${Math.round(ms / 1000)} s`;
  /** Whether a repair, a planner's call and the changed levels' words, still fits with the review after it; said when it does not. */
  const repairFits = (): boolean => {
    const needs = expected(["planner", "explainer", "reviewer"]);
    if (left() >= needs) return true;
    say("deadline", `no time for a repair: ${seconds(left())} of the job's time is left, and a repair with the review after it is expected to take ${seconds(needs)}; the levels that pass ship`);
    return false;
  };
  const timing = () => ({ jobMs: input.deadline?.jobMs ?? null, spentMs: clock() - began, stages: Object.fromEntries([...took].map(([stage, ms]) => [stage, ms])) });

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
    const routed = await timed("router", (client) => route(client, modelFor("router"), { title, abstract: front ? text.text.slice(front.start, front.end) : text.text.slice(0, 2000), equations: text.equations.slice(0, 6).map((equation) => equation.latex.slice(0, 300)) }, { structuredOutput: structured(modelFor("router")) }));
    sink.artifact("route", routed.value);
    if (routed.value.family !== "compartments" || routed.value.tier !== "A") {
      throw new Stop("unsupported", `the router sends this paper to ${routed.value.family}, tier ${routed.value.tier}: ${routed.value.reason} PaperPlay generates compartment-model worlds only, so far.`);
    }
    say("routing", `compartments, tier A: ${routed.value.reason}`);
    cancelled();
    // The reading and the two transcriptions need nothing from each other, so they are asked at once
    // (ADR-0051); the gateway's client still spaces their starts.
    say("reading", "reading what the paper asks and shows");
    say("transcription", "the first transcription of the model");
    say("transcription", "the second transcription, by another vendor's model, which never sees the first");
    const [reading, firstTranscription, secondTranscription] = await Promise.all([
      timed("reader", (client) => read(client, modelFor("reader"), text, title, { structuredOutput: structured(modelFor("reader")) })),
      timed("transcriber", (client) => transcribe(client, modelFor("transcriber"), text, title, { structuredOutput: structured(modelFor("transcriber")) })),
      timed("second-transcriber", (client) => transcribe(client, modelFor("second-transcriber"), text, title, { structuredOutput: structured(modelFor("second-transcriber")), stage: "second-transcriber" })),
    ]);
    sink.artifact("reading", reading.value);
    let first = firstTranscription.value;
    const second = secondTranscription.value;
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
      if (left() < expected(["transcriber"])) throw new Stop("needs_information", `the two transcriptions disagree, and no time is left to ask again: ${seconds(left())} of the job's time is left`);
      repairs++;
      const why = [...compared.setProblems, ...compared.a.problems, ...(compared.b ? [] : ["the second transcription does not become a model"]), ...(compared.match?.problems ?? [])].slice(0, 8);
      move("repairing", "transcription", `the two transcriptions disagree (${why.join("; ") || "they could not be compared"}); asking the first transcriber to check against the paper`);
      const messages = transcriberMessages(text, title);
      const retried = await timed("transcriber", (client) => completeStructured(
        client,
        {
          stage: "transcriber",
          model: modelFor("transcriber"),
          messages: [...messages, { role: "assistant", content: JSON.stringify(first) }, { role: "user", content: `A second, independent reading of the paper disagrees with yours here:\n${why.map((line) => `- ${line}`).join("\n")}\nCheck each against the paper's own equations, table and text, and give the whole transcription again, corrected where the paper says so. Every quote must be copied exactly.` }],
          temperature: 0,
          maxTokens: TRANSCRIBER_MAX_TOKENS,
        },
        TranscriptionWithSets,
        { name: "transcription", structuredOutput: structured(modelFor("transcriber")) },
      ));
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
    // Each planner within its stage's time (R13): a plan in hand never waits on the other longer.
    const secondPlannerModel = input.config.stages["second-planner"] ?? null;
    const [firstSettled, secondSettled] = await Promise.all([
      settle(timed("planner", (client) => planWorld(client, plannerModel, plannerInput))),
      secondPlannerModel === null ? Promise.resolve(null) : settle(timed("second-planner", (client) => planWorld(client, secondPlannerModel, plannerInput, { stage: "second-planner" }))),
    ]);
    const why = (error: unknown): string => (outOfTime(error) ? "within its time" : `the schema reads (${(error instanceof Error ? error.message : String(error)).split("\n")[0] ?? ""})`);
    const firstPlan = firstSettled.value;
    const secondPlan = secondSettled?.value ?? null;
    if (secondSettled && secondSettled.error !== null) say("planning", `the second planner, ${secondPlannerModel ?? ""}, gave no plan ${why(secondSettled.error)}; the first planner's plan is used alone`);
    if (firstPlan === null) {
      if (secondPlan === null) throw firstSettled.error instanceof Error ? firstSettled.error : new Error("the planner's call failed");
      say("planning", `the first planner, ${plannerModel}, gave no plan ${why(firstSettled.error)}; the second planner's plan is used alone`);
    }
    let plan: Plan = (firstPlan ?? secondPlan)?.value ?? ({} as Plan);
    /** Which planner each level came from, in step with the plan (ADR-0043). */
    let sources: string[] = plan.levels.map(() => (firstPlan ? plannerModel : (secondPlannerModel ?? plannerModel)));
    if (firstPlan && secondPlan && secondPlannerModel !== null) {
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
    // Read once (R13): the explainer and the reviewers are given the sections the reader named.
    const passages = promptSource(text, { maxCharacters: 60_000, sections: reading.value.sections }).block;
    const modelWords = `${describeBehaviour(model, horizon).split("\n").slice(0, 3).join("\n")}`;
    const explainerModel = modelFor("explainer");
    let explanation: Explanation = { levels: [] };

    /**
     * The named levels' words, asked at once, each within the explainer's time. A level whose words
     * do not come, or come unreadable, is left out of the world (never the hook), so one slow or
     * broken reply no longer ends the job (R13).
     */
    const wordsFor = async (target: Plan, indices: readonly number[]): Promise<Map<number, ExplainedLevel>> => {
      const words = new Map<number, ExplainedLevel>();
      await Promise.all(
        indices.map(async (index) => {
          try {
            words.set(index, (await timed("explainer", (client) => explainLevel(client, explainerModel, { title, plan: target, passages, model: modelWords }, index, { structuredOutput: structured(explainerModel) }))).value);
          } catch (error) {
            if (!(error instanceof ModelError)) throw error;
            say("explaining", `level ${index + 1}'s words ${outOfTime(error) ? "did not come within the explainer's time" : `could not be read: ${error.message.replace(/\s+/g, " ").slice(0, 200)}`}`);
          }
        }),
      );
      return words;
    };

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
        replanned = await timed("planner", (client) =>
          completeStructured(
            client,
            { stage: "planner", model: plannerModel, messages: [...messages, { role: "assistant", content: JSON.stringify(plan) }, { role: "user", content: `These problems were found:\n${problems.map((line) => `- ${line}`).join("\n")}\nChange only the levels named, as little as fixes them, and give the whole plan again.` }], temperature: 0, maxTokens: PLANNER_MAX_TOKENS },
            Plan,
            { name: "plan", structuredOutput: false, moreRoom: true },
          ),
        );
      } catch (error) {
        if (!(error instanceof ModelError) || (error.kind !== "invalid-response" && error.kind !== "timeout")) throw error;
        say("planning", `the planner's repair ${error.kind === "timeout" ? "did not come within its time" : "could not be read"}, so the plan stays as it was: ${error.message.replace(/\s+/g, " ").slice(0, 400)}`);
        return;
      }
      // A level the repair changed is the repairing planner's now.
      sources = replanned.value.levels.map((level, index) => (JSON.stringify(level) === JSON.stringify(plan.levels[index]) ? (sources[index] ?? plannerModel) : `${plannerModel}, in repair`));
      // Only the levels the repair changed are explained again; the rest keep their words (R13).
      const before = { plan, explanation };
      plan = replanned.value;
      const same = plan.levels.map((level) => before.plan.levels.findIndex((old) => JSON.stringify(old) === JSON.stringify(level)));
      const changed = plan.levels.map((_, index) => index).filter((index) => (same[index] ?? -1) < 0);
      const words = await wordsFor(plan, changed);
      say("planning", `the repair changed ${changed.length} of ${plan.levels.length} levels; only theirs are explained again`);
      placeWords(words, (index) => before.explanation.levels[same[index] ?? -1]);
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
    /** The plan's words, from this round or kept from before; a level with none is left out, and the job stops if that is the hook or leaves fewer than three. */
    const placeWords = (words: ReadonlyMap<number, ExplainedLevel>, kept: (index: number) => ExplainedLevel | undefined): void => {
      const all = plan.levels.map((_, index) => index);
      const missing = all.filter((index) => !words.has(index) && kept(index) === undefined);
      const wordsOf = (index: number): ExplainedLevel[] => {
        const level = words.get(index) ?? kept(index);
        return level ? [level] : [];
      };
      if (missing.length === 0) {
        explanation = { levels: all.flatMap(wordsOf) };
        return;
      }
      if (missing.includes(0)) throw new Stop("failed", "level 1's words, the hook's, did not come, and the hook is never dropped");
      const keep = all.filter((index) => !missing.includes(index));
      if (keep.length < 3) throw new Stop("failed", `too few levels have their words: ${missing.length} of ${all.length} did not come`);
      dropped.push(...missing.map((index) => ({ level: index + 1, title: plan.levels[index]?.title ?? "", reasons: ["its words did not come, or could not be read"] })));
      sink.artifact("dropped", dropped);
      explanation = { levels: keep.flatMap(wordsOf) };
      sources = keep.map((index) => sources[index] ?? plannerModel);
      plan = { ...plan, levels: keep.flatMap((index) => (plan.levels[index] ? [plan.levels[index]] : [])) };
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
    placeWords(await wordsFor(plan, plan.levels.map((_, index) => index)), () => undefined);

    /**
     * Progressive delivery (R13, ADR-0053): once the hook and at least two more levels pass every
     * check, provenance included, they are released as a world of their own, playable while the
     * job goes on; each time the passing set changes, again. The reviewers have not read it yet,
     * and it says so. A world holds at least three levels, so three is the first release.
     */
    let releasedAs: string | null = null;
    const release = (passing: readonly number[]): void => {
      if (!passing.includes(0) || passing.length < 3) return;
      const titles = passing.map((index) => plan.levels[index]?.title ?? "");
      if (titles.join("\n") === releasedAs) return;
      const part = assembleWorld({ source: text, register, reading: reading.value, model, plan: { ...plan, levels: passing.flatMap((index) => (plan.levels[index] ? [plan.levels[index]] : [])) }, explanation: { levels: passing.flatMap((index) => (explanation.levels[index] ? [explanation.levels[index]] : [])) }, routingReason: routed.value.reason, ownNumbers: ownNumbersForWorld() });
      if (!buildWorld(part.spec, registry).ok || checkProvenance(part.spec, text).length > 0) return;
      releasedAs = titles.join("\n");
      released = passing.length;
      sink.artifact("released", { levels: passing.map((index, at) => ({ level: index + 1, title: titles[at] ?? "" })), of: plan.levels.length, reviewed: false, world: part.spec });
      say("release", `${passing.length} of ${plan.levels.length} levels pass every check and are playable while the job goes on: ${titles.map((title) => `"${title}"`).join(", ")}`);
    };

    let built: BuiltWorld | null = null;
    let swept: LevelResult[] = [];
    let spec: Record<string, unknown> = {};
    /** Why the world ships without its review, when the reviewers did not answer in time. */
    let unreviewed: string | null = null;
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
          if (repairs < MAX_REPAIRS && repairFits()) {
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
        release(plan.levels.map((_, index) => index).filter((index) => !failing.includes(index)));
        if (failing.length === 0 && found.world.length === 0) break;
        const words = [
          ...failing.map((index) => `level ${index + 1} ("${plan.levels[index]?.title ?? ""}"): ${problemsOf(index).join("; ")}`),
          ...found.world,
        ];
        if (repairs < MAX_REPAIRS && repairFits()) {
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
      // Each reviewer within its stage's time (R13); one that does not answer, or answers unreadably, leaves the other's review.
      const [firstReview, secondReview] = await Promise.all([
        settle(timed("reviewer", (client) => review(client, reviewerModel, reviewInput, { structuredOutput: structured(reviewerModel) }).then((result) => result.value))),
        secondReviewerModel === null ? Promise.resolve(null) : settle(timed("second-reviewer", (client) => review(client, secondReviewerModel, reviewInput, { structuredOutput: structured(secondReviewerModel), stage: "second-reviewer" }).then((result) => result.value))),
      ]);
      for (const [settled, who] of [[firstReview, reviewerModel], [secondReview, secondReviewerModel]] as const) {
        if (settled === null || settled.error === null) continue;
        if (!(settled.error instanceof ModelError)) throw settled.error instanceof Error ? settled.error : new Error("a reviewer's call failed");
        say("review", `${who ?? ""} gave no review ${outOfTime(settled.error) ? "within its time" : `the schema reads: ${settled.error.message.replace(/\s+/g, " ").slice(0, 200)}`}`);
      }
      const reviewed = firstReview.value;
      const secondReviewed = secondReview?.value ?? null;
      if (reviewed === null && secondReviewed === null) {
        // No reviewer answered in time. A world never read by one ships checked and says it was not
        // reviewed; levels whose words were written again since the last review are left out, as no
        // reviewer has read their new words.
        const unread = plan.levels.map((_, index) => index).filter((index) => reworded.has(plan.levels[index]?.title ?? ""));
        if (unread.length > 0) {
          const keep = dropFailing(unread, () => ["its words were written again, and no reviewer read them in time"], "failed", unread.map((index) => `level ${index + 1}: its new words were not reviewed in time`));
          say("review", `no reviewer answered in time: dropping ${unread.length} level(s) whose new words no reviewer read, keeping ${keep}`);
        }
        unreviewed = reviewPasses === 0 ? "no reviewer answered within its time, so no reviewer read this world; every check passed" : "the last review pass did not answer in time; every level kept was read by an earlier pass, and every check passed";
        say("review", unreviewed);
        if (unread.length > 0) {
          spec = assembleWorld({ source: text, register, reading: reading.value, model, plan, explanation, routingReason: routed.value.reason, ownNumbers: ownNumbersForWorld() }).spec;
          if (!buildWorld(spec, registry).ok || checkProvenance(spec, text).length > 0) throw new Stop("failed", "the world without its unreviewed levels does not pass its checks");
        }
        break;
      }
      if (reviewed) sink.artifact("review", reviewed);
      if (secondReviewed) sink.artifact("second-review", secondReviewed);
      const decisions = decideReviews(model, named, tags, [...(reviewed ? [{ model: reviewerModel, review: reviewed }] : []), ...(secondReviewed && secondReviewerModel ? [{ model: secondReviewerModel, review: secondReviewed }] : [])]);
      reviewPasses++;
      reviewDecisions.push(...decisions.records.map((record) => ({ pass: reviewPasses, ...record })));
      sink.artifact("review-decisions", reviewDecisions);
      for (const record of decisions.records.filter((entry) => entry.blocking && !entry.stands)) say("review", `level ${record.level ?? "?"}: ${record.reviewer}'s ${record.kind} block does not stand: ${record.reason}`);
      const definitional = decisions.standing("definitional");
      const misworded = decisions.standing("unsupported");
      const blocksOn = (index: number, kind: string): string => [reviewed, secondReviewed].flatMap((entry) => entry?.findings.filter((finding) => finding.level === index + 1 && finding.kind === kind && finding.severity === "blocking") ?? []).map((finding) => `${finding.finding} ${finding.suggestion}`).join(" ");
      if (definitional.length > 0) {
        const words = definitional.map((index) => `level ${index + 1} ("${plan.levels[index]?.title ?? ""}"): ${secondReviewed ? "both reviewers find" : "the reviewer finds"} its effect follows from the model's definitions alone: ${blocksOn(index, "definitional")}; test one of the paper's findings instead`);
        if (repairs < MAX_REPAIRS && repairFits()) {
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
        // Words written again need a review after them: without time for both, they are dropped as if written again already.
        const time = left() >= expected(["explainer", "reviewer"]);
        if (!time) say("deadline", `no time to write words again and review them: ${seconds(left())} of the job's time is left`);
        const again = misworded.filter((index) => !time || reworded.has(plan.levels[index]?.title ?? ""));
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
          const words = (await timed("explainer", (client) => reword(client, explainerModel, { title, plan, passages, model: modelWords }, index, problem, { structuredOutput: structured(explainerModel) }))).value;
          const { goal, whatIf, prediction, effect, ...level } = words;
          reworded.add(plan.levels[index]?.title ?? "");
          plan = { ...plan, levels: plan.levels.map((entry, at) => (at === index ? { ...entry, goal, effect, whatIf: { ...entry.whatIf, prompt: whatIf }, prediction: { ...entry.prediction, prompt: prediction } } : entry)) };
          explanation = { levels: explanation.levels.map((entry, at) => (at === index ? level : entry)) };
        }
        continue;
      }
      const blocking = [reviewed, secondReviewed].flatMap((entry) => entry?.findings.filter((finding) => finding.severity === "blocking") ?? []);
      if (blocking.length > 0) {
        say("review", `the reviewers found ${blocking.length} blocking finding(s) that do not stand, advice only: the checks decide. ${blocking.map((finding) => finding.finding).join(" ")}`);
      } else say("review", `the reviewer found nothing blocking (${(reviewed?.findings.length ?? 0) + (secondReviewed?.findings.length ?? 0)} piece(s) of advice)`);
      break;
    }
    sink.artifact("plan-sources", plan.levels.map((level, index) => ({ level: index + 1, title: level.title, planner: sources[index] ?? plannerModel })));
    sink.artifact("world", spec);
    sink.artifact("timing", timing());
    move("ready", "ready", `the world is built and checked: ${plan.levels.length} levels, every one meeting the level rule, showing its difference and testing the paper's findings, every anchor in the source${unreviewed === null ? "" : `; not reviewed: ${unreviewed}`}`);
    return { state, message: "ready", world: spec };
  } catch (error) {
    // A deadline passed: the job stops rather than run on, and says what is left to play (R13).
    const deadlineWords = (error: unknown): string => `${error instanceof Error ? error.message : String(error)}: the job stops at its deadline of ${seconds(input.deadline?.jobMs ?? 0)} rather than run on; ${released > 0 ? `the ${released} levels released stay playable, checked but not reviewed` : "no level passed its checks in time, so this paper falls back to the explainer page, tier C"}`;
    const stop = error instanceof Stop ? error : outOfTime(error) && input.deadline ? new Stop("failed", deadlineWords(error)) : new Stop("failed", error instanceof Error ? error.message.split("\n")[0] ?? "" : String(error));
    sink.artifact("timing", timing());
    if (state !== stop.state && canMove(state, stop.state)) move(stop.state, "stopped", stop.message);
    else sink.emit(stop.state === "failed" || stop.state === "cancelled" ? stop.state : "failed", "stopped", stop.message);
    return { state: stop.state, message: stop.message, world: null };
  }
}
