/**
 * The controller (every-paper.md §3, R10, R11): one job, from a paper's identifier to a playable,
 * checked world, through real states only. It moves only along JOB_TRANSITIONS, spends at most two
 * scoped repairs, and reaches `ready` only when the builder, the family's checks, the level rule
 * and provenance have all run and passed. The reviewer's findings are advice it may act on; they
 * never turn a failed check into a pass. Every artifact and every model call is kept for the job.
 */
import { canMove, type JobState, type ModelSpec, type SourceRegisterEntry, type SourceText } from "@paperplay/contracts";
import { registry } from "@paperplay/primitives";
import { assembleWorld } from "../assemble/world.ts";
import { chooseStep, describeBehaviour, describeResponse, horizonOf } from "../assemble/model.ts";
import { buildWorld, type BuiltWorld } from "../builder/build.ts";
import { checkProvenance } from "../checks/provenance.ts";
import { fetchArxiv, fetchPmc, fromOwnerPdf, registerAndText, type Fetch } from "../ingest/index.ts";
import { completeStructured, type ModelClient, type Stage } from "../models/index.ts";
import { sweepLevels, type LevelResult } from "../rule/sweep.ts";
import { checkFindings } from "../rule/findings.ts";
import { visibilityOf } from "../rule/visibility.ts";
import { explain, type Explanation } from "../stages/explainer.ts";
import { plan as planWorld, Plan, PLANNER_MAX_TOKENS, plannerMessages, type PlanLevel } from "../stages/planner.ts";
import { read } from "../stages/reader.ts";
import { review, type Review } from "../stages/reviewer.ts";
import { route } from "../stages/router.ts";
import { promptSource } from "../stages/source.ts";
import { TRANSCRIBER_MAX_TOKENS, transcribe, transcriberMessages } from "../stages/transcriber.ts";
import { toModelSpec } from "../transcribe/convert.ts";
import { modelForComparison } from "../transcribe/score.ts";
import { compareValueSets, pickValueSet, withValueSet } from "../transcribe/valuesets.ts";
import { matchModels } from "../transcribe/match.ts";
import { TranscriptionWithSets } from "../transcribe/schema.ts";

export const MAX_REPAIRS = 2;

export interface JobConfig {
  /** Each stage's model, from apps/api/models.json. */
  readonly stages: Readonly<Record<Stage, string | null>>;
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

    say("planning", "planning the levels");
    const behaviour = describeBehaviour(model, horizon);
    const response = describeResponse(model, horizon);
    const plannerModel = modelFor("planner");
    let plan: Plan = (await planWorld(input.client, plannerModel, { title, reading: reading.value, model, example: input.example, behaviour, response })).value;
    const passages = promptSource(text, { maxCharacters: 60_000 }).block;
    const modelWords = `${describeBehaviour(model, horizon).split("\n").slice(0, 3).join("\n")}`;
    const explainerModel = modelFor("explainer");
    let explanation: Explanation = (await explain(input.client, explainerModel, { title, plan, passages, model: modelWords }, { structuredOutput: structured(explainerModel) })).value;

    /** Asks the planner to change only the named levels, keeping the rest. */
    const replan = async (problems: readonly string[]): Promise<void> => {
      repairs++;
      move("repairing", "planning", `asking the planner to change only the levels with problems: ${problems.slice(0, 4).join("; ")}`);
      const messages = plannerMessages({ title, reading: reading.value, model, example: input.example, behaviour, response });
      const replanned = await completeStructured(
        input.client,
        { stage: "planner", model: plannerModel, messages: [...messages, { role: "assistant", content: JSON.stringify(plan) }, { role: "user", content: `These problems were found:\n${problems.map((line) => `- ${line}`).join("\n")}\nChange only the levels named, as little as fixes them, and give the whole plan again.` }], temperature: 0, maxTokens: PLANNER_MAX_TOKENS },
        Plan,
        { name: "plan", structuredOutput: false },
      );
      plan = replanned.value;
      explanation = (await explain(input.client, explainerModel, { title, plan, passages, model: modelWords }, { structuredOutput: structured(explainerModel) })).value;
    };

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
    /** Drops the levels at these places, keeping the explanation in step. */
    const drop = (indices: ReadonlySet<number>): void => {
      plan = { ...plan, levels: plan.levels.filter((_, index) => !indices.has(index)) };
      explanation = { levels: explanation.levels.filter((_, index) => !indices.has(index)) };
    };
    for (;;) {
      for (;;) {
        move("building", "assembly", "assembling the world and building it against the solver");
        const assembled = assembleWorld({ source: text, register, reading: reading.value, model, plan, explanation, routingReason: routed.value.reason });
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
          // No repair left: drop the levels that do not build, if three remain.
          const failing = new Set(result.problems.map((problem) => /^levels\.(\d+)/.exec(problem.path)?.[1]).filter((index): index is string => index !== undefined).map(Number));
          if (failing.size === 0 || plan.levels.length - failing.size < 3) throw new Stop("failed", `the world does not build: ${byLevel.slice(0, 4).join("; ")}`);
          drop(failing);
          move("repairing", "assembly", `dropping ${failing.size} level(s) that do not build, keeping ${plan.levels.length}`);
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
        const found = checkFindings(plan, reading.value, text);
        sink.artifact("findings", found);
        const problemsOf = (index: number): string[] => {
          const level = swept[index];
          const visible = seen[index];
          return [
            ...(level && !level.meets ? [`its claim holds on ${level.holds} of 20 starts, fewer than 16${measuredAt(level)}`] : []),
            ...(visible && !visible.visible ? [`its difference is too small to see: ${visible.why ?? ""}`] : []),
            ...(found.levels[index] ?? []),
          ];
        };
        const failing = plan.levels.map((_, index) => index).filter((index) => problemsOf(index).length > 0);
        if (failing.length === 0 && found.world.length === 0) break;
        const words = [
          ...failing.map((index) => `level ${index + 1} ("${plan.levels[index]?.title ?? ""}"): ${problemsOf(index).join("; ")}`),
          ...found.world,
        ];
        if (repairs < MAX_REPAIRS) {
          await replan(words);
          continue;
        }
        const keep = plan.levels.length - failing.length;
        if (keep < 3) throw new Stop("failed", `too few levels meet the rules: ${words.join("; ")}`);
        drop(new Set(failing));
        if (checkFindings(plan, reading.value, text).world.length > 0) throw new Stop("failed", `the levels left do not test enough of the paper's findings: ${words.join("; ")}`);
        say("level rule", `dropped ${failing.length} level(s) the rules refuse, keeping ${keep}`);
        move("repairing", "level rule", "rebuilding without the dropped levels");
      }
      say("level rule", `every level meets the rule, shows its difference and tests what the paper found: ${swept.map((level) => `level ${level.order} ${level.holds} of 20`).join(", ")}`);

      // Checking: provenance, then the reviewer, who can suggest but never overturn a check.
      move("checking", "provenance", "checking every anchor quotes the source exactly");
      const provenance = checkProvenance(spec, text);
      sink.artifact("provenance", provenance);
      if (provenance.length > 0) throw new Stop("failed", `provenance fails: ${provenance.slice(0, 3).map((problem) => `${problem.path}: ${problem.message}`).join("; ")}`);
      say("review", "the reviewer reads the world and the checks' results");
      const reviewerModel = modelFor("reviewer");
      const checks = ["The builder: passed, the family's checks included.", `The level rule: ${swept.map((level) => `level ${level.order} holds on ${level.holds} of 20`).join("; ")}.`, "The visibility rule: every level's difference shows on its chart and in the scene.", "Provenance: every anchor quotes the source exactly."].join("\n");
      const worldWords = plan.levels.map((level: PlanLevel, index) => `Level ${index + 1}, ${level.title}: ${level.goal} Control: ${level.control.label}. What if: ${level.whatIf.prompt} It states: ${level.effect}`).join("\n");
      const reviewed: Review = (await review(input.client, reviewerModel, { title, world: worldWords, checks, passages }, { structuredOutput: structured(reviewerModel) })).value;
      sink.artifact("review", reviewed);
      // A level the reviewer finds definitional teaches nothing the paper found: repaired, or dropped when no repair is left.
      const definitional = [...new Set(reviewed.findings.filter((finding) => finding.severity === "blocking" && finding.kind === "definitional" && finding.level !== null && finding.level <= plan.levels.length).map((finding) => (finding.level ?? 1) - 1))];
      const blocking = reviewed.findings.filter((finding) => finding.severity === "blocking");
      if (definitional.length > 0) {
        const words = definitional.map((index) => `level ${index + 1} ("${plan.levels[index]?.title ?? ""}"): the reviewer finds its effect follows from the model's definitions alone: ${reviewed.findings.filter((finding) => finding.level === index + 1 && finding.kind === "definitional").map((finding) => `${finding.finding} ${finding.suggestion}`).join(" ")}; test one of the paper's findings instead`);
        if (repairs < MAX_REPAIRS) {
          await replan(words);
          continue;
        }
        if (plan.levels.length - definitional.length < 3) throw new Stop("needs_information", `the reviewer finds ${definitional.length} level(s) follow from the model's definitions alone, and no repair is left: ${words.join("; ")}. The owner decides.`);
        drop(new Set(definitional));
        if (checkFindings(plan, reading.value, text).world.length > 0) throw new Stop("needs_information", `dropping the levels the reviewer finds definitional leaves too few on the paper's findings: ${words.join("; ")}. The owner decides.`);
        move("repairing", "review", `dropping ${definitional.length} level(s) the reviewer finds definitional, keeping ${plan.levels.length}`);
        continue;
      }
      if (blocking.length > 0) {
        say("review", `the reviewer found ${blocking.length} blocking finding(s), advice only: the checks decide. ${blocking.map((finding) => finding.finding).join(" ")}`);
      } else say("review", `the reviewer found nothing blocking (${reviewed.findings.length} piece(s) of advice)`);
      break;
    }
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
