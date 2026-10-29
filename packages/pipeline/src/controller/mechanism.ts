/**
 * The generated-mechanism tier's job (ADR-0058): a paper no family covers. A coding model writes its
 * mechanism as a module, which the sandbox's checks hold to at most three fixes; then the machinery
 * every world goes through, unchanged in what it decides: candidate levels made and judged in code
 * over the level rule's 20 seeds, the planner choosing among them, the explainer writing every word,
 * the builder, the level, visibility and findings rules, provenance and both reviewers. The job has
 * the tier's longer deadline. A module that never passes its checks, or a paper the writer finds
 * nothing to play in, falls back to the explainer page, saying why.
 */
import { createHash } from "node:crypto";
import { GENERATED_MODEL_LABEL, type JobState, type MechanismManifest, type SourceRegisterEntry, type SourceText } from "@paperplay/contracts";
import { registry } from "@paperplay/primitives";
import { assembleMechanismWorld } from "../assemble/world.ts";
import { buildWorld } from "../builder/build.ts";
import { CandidatePicks, pickerMessages, pickLevels, planFromPicks, PICKER_MAX_TOKENS, shortList } from "../candidates/picker.ts";
import { checkProvenance } from "../checks/provenance.ts";
import { judgeMechanismCandidates, sweepMechanism } from "../mechanism/candidates.ts";
import { resultNumbersOf } from "../mechanism/checks.ts";
import { writeCheckedMechanism, type WriterRound } from "../mechanism/loop.ts";
import { completeStructured, ModelError, type ModelClient, type Stage } from "../models/index.ts";
import { checkFindings } from "../rule/findings.ts";
import { reword, writeLevel, writeWorld, type ExplainedLevel, type WrittenLevel } from "../stages/explainer.ts";
import { mechanismWriterInput } from "../stages/mechanism-writer.ts";
import type { Plan, PlanLevel } from "../stages/planner.ts";
import { read, type Reading } from "../stages/reader.ts";
import { reviewMechanism, type MechanismReview } from "../stages/mechanism-reviewer.ts";
import type { RouteDecision } from "../stages/router.ts";
import { promptSource } from "../stages/source.ts";
import { anchorOf } from "../transcribe/convert.ts";
import type { JobInput, JobOutcome, JobSink } from "./run.ts";
import { Stop } from "./stop.ts";

export interface MechanismTierConfig {
  /** The module the writer is shown for its shape: one that passes every check. */
  readonly example: string;
}

/** What the tier is given of the job's controller: its closures, so the states, deadline and calls are the job's own. */
export interface TierContext {
  readonly input: JobInput;
  readonly config: MechanismTierConfig;
  readonly sink: JobSink;
  readonly text: SourceText;
  readonly register: SourceRegisterEntry;
  readonly title: string;
  readonly route: RouteDecision;
  readonly move: (to: JobState, step: string, message: string) => void;
  readonly say: (step: string, message: string) => void;
  readonly timed: <T>(stage: Stage, call: (client: ModelClient) => Promise<T>, cancel?: AbortSignal) => Promise<T>;
  readonly modelFor: (stage: Stage) => string;
  readonly structured: (model: string) => boolean;
  readonly cancelled: () => void;
  readonly left: () => number;
  readonly extend: (jobMs: number) => void;
  readonly timing: () => unknown;
  readonly released: (count: number) => void;
  /** The reading, once the reader has given it, for the explainer page. */
  readonly keep: (reading: Reading) => void;
  readonly reading: () => Reading | null;
}

const seconds = (ms: number): string => `${Math.round(ms / 1000)} s`;
const settle = <T>(promise: Promise<T>): Promise<{ readonly value: T; readonly error: null } | { readonly value: null; readonly error: unknown }> =>
  promise.then(
    (value) => ({ value, error: null }),
    (error: unknown) => ({ value: null, error }),
  );
const firstLine = (error: unknown): string => (error instanceof Error ? (error.message.split("\n")[0] ?? "") : String(error));

/** The model, in words, as the explainer and the reviewers read it: what it is, its parameters and measurements, and how it was made. */
export function mechanismWords(manifest: MechanismManifest): string {
  return [
    `"${manifest.title}", a ${GENERATED_MODEL_LABEL}: a coding model wrote it as a module from the paper's description, and code checked how it behaves; it reproduces none of the paper's experiments.`,
    `Its parameters: ${manifest.params.map((param) => `${param.label} (${param.id}, ${param.min} to ${param.max}${param.unit ? ` ${param.unit}` : ""}, starting at ${param.default})`).join("; ")}.`,
    `What it measures: ${manifest.measurements.map((measurement) => `${measurement.label} (${measurement.id}${measurement.unit ? `, in ${measurement.unit}` : ""}): ${measurement.meaning}`).join(" ")}`,
    `One step is a ${manifest.stepLabel}; a run lasts ${manifest.steps} steps.`,
  ].join("\n");
}

/** The tier C page's content (ADR-0058): what the paper asks and finds, each finding with its passage where the source holds it, and why there is no world. */
function explainerPage(ctx: TierContext, reading: Reading | null, why: string): Record<string, unknown> {
  const findings = reading ? [reading.result, ...reading.findings] : [];
  return {
    schemaVersion: "explainer/0",
    title: ctx.title,
    why,
    question: reading?.question ?? null,
    mechanism: reading?.mechanism ?? ctx.route.mechanism,
    findings: findings.map((finding) => {
      const anchor = anchorOf(ctx.text, finding.quote);
      return { text: finding.text, origin: anchor ? "paper-derived" : "generated-inference", quote: anchor ? anchor.quote : null, sectionId: anchor?.sectionId ?? null };
    }),
  };
}

/** A level's facts, as code chose them: its What-if, what it measures, and how. */
const factsKey = (level: PlanLevel): string => `${level.whatIf.parameter}=${level.whatIf.value}|${level.difference.compartment}|${level.difference.summary}`;

/** A world name that is not one: its instruction repeated, or a phrase that runs on with commas or colons. */
export const garbledName = (name: string): boolean => /\bat most\b|\bwords?\b.*\bnam|\bnaming\b/i.test(name) || /[,:;"“”]/.test(name) || name.trim().split(/\s+/).length > 6;

/** Words that say a setting is taken away. */
const TAKES_AWAY = /\b(remov\w*|without|no longer|tak(?:e|es|en|ing) (?:it |the \w+ )?away|turn\w* off|switch\w* off|disabl\w*|eliminat\w*|drop(?:s|ped|ping)? the)\b/i;

/**
 * The findings check on What-ifs (ADR-0058's amendment): a What-if whose words say it takes a setting
 * away must set it to the value that takes it away as the paper means, and to nothing else.
 */
export function whatIfWordsProblems(levels: readonly PlanLevel[], manifest: MechanismManifest): Map<number, string> {
  const problems = new Map<number, string>();
  levels.forEach((level, index) => {
    const param = manifest.params.find((entry) => entry.id === level.whatIf.parameter);
    if (!param || !TAKES_AWAY.test(level.whatIf.prompt)) return;
    const without = param.paper?.without ?? null;
    if (without === null) problems.set(index, `its What-if says it takes ${param.label} away, but the paper gives no such meaning (${param.paper?.meaning ?? "none given"}); say it sets ${param.id} to ${level.whatIf.value}`);
    else if (level.whatIf.value !== without) problems.set(index, `its What-if says it takes ${param.label} away, but sets it to ${level.whatIf.value}, not ${without}, which is taking it away as the paper means (${param.paper?.meaning ?? ""}); say it sets ${param.id} to ${level.whatIf.value}`);
  });
  return problems;
}

export async function runMechanismTier(ctx: TierContext): Promise<JobOutcome> {
  let released = false;
  try {
    return await tier(ctx, () => {
      released = true;
    });
  } catch (error) {
    // Out of time before any level was playable: the explainer page, saying so (R13). After a
    // release, the controller's own ending keeps the released levels playable.
    if (!released && error instanceof ModelError && error.kind === "timeout") {
      ctx.sink.artifact("explainer", explainerPage(ctx, ctx.reading(), `the job's time ran out before a level passed its checks: ${error.message}`));
      throw new Stop("unsupported", `the job's time ran out before a level passed its checks (${error.message}); this paper falls back to the explainer page, tier C`);
    }
    throw error;
  }
}

async function tier(ctx: TierContext, releasing: () => void): Promise<JobOutcome> {
  const { input, sink, text, register, title, move, say, timed, modelFor, structured } = ctx;
  if (input.deadline?.mechanismJobMs) ctx.extend(input.deadline.mechanismJobMs);
  // The router's reason is kept in its artifact; the event says what follows from it, briefly.
  say("routing", `${ctx.route.tier === "B" ? `the ${ctx.route.family} family covers this paper but does not make worlds from papers yet` : "no family whose worlds are made from papers covers this paper"} (tier ${ctx.route.tier}); a coding model writes its mechanism as a module instead, checked in a sandbox (ADR-0058)${input.deadline?.mechanismJobMs ? `, within ${Math.round(input.deadline.mechanismJobMs / 60_000)} minutes` : ""}`);
  let reading: Reading | null = null;
  const fallBack = (why: string): never => {
    sink.artifact("explainer", explainerPage(ctx, reading, why));
    throw new Stop("unsupported", `${why}; this paper falls back to the explainer page, tier C`);
  };

  // Reading: what the paper asks, its mechanism and its anchored findings.
  say("reading", "reading what the paper asks, its mechanism and what it finds");
  const read_ = await timed("reader", (client) => read(client, modelFor("reader"), text, title, { structuredOutput: structured(modelFor("reader")), sections: true }));
  reading = read_.value;
  ctx.keep(reading);
  sink.artifact("reading", reading);
  ctx.cancelled();

  // Writing: the module, checked in the sandbox, with at most three fixes the deadline can hold.
  const writer = modelFor("writer");
  say("writing", `${writer} writes the paper's mechanism as a module`);
  const writerInput = mechanismWriterInput(text, title, reading, ctx.config.example);
  const outcome = await writeCheckedMechanism(writerInput, {
    call: async (messages, round) => {
      if (round > 0) move("repairing", "writing", `asking ${writer} for fix ${round} of the module`);
      try {
        return (await timed("writer", (client) => client.complete({ stage: "writer", model: writer, messages, temperature: 0 }))).text;
      } finally {
        // Back to planning whether the reply came or its time ran out, so the next round can repair again.
        if (round > 0) move("planning", "checks", `fix ${round}'s call has ended`);
      }
    },
    // A fix begins only if it and the levels after it can still finish: the levels need a few minutes.
    timeLeft: () => ctx.left() - 4 * 60_000,
    // The paper's reported results, which a module must compute and never write in.
    results: resultNumbersOf([reading.result.text, reading.result.quote, ...reading.findings.flatMap((finding) => [finding.text, finding.quote])]),
    onRound: (round: WriterRound) => {
      sink.artifact(`mechanism-round-${round.round}`, { round: round.round, writeMs: round.writeMs, checkMs: round.checkMs, checks: round.report?.checks ?? null, stepMs: round.report?.stepMs ?? null, problems: round.problems });
      const failed = round.report?.checks.filter((check) => !check.passed).map((check) => check.name) ?? ["no module"];
      say("checks", round.report?.passed ? `the module passes every check: it loads, repeats on a seed, runs across every range, stays finite, responds to its parameters, draws in its ${round.report.manifest?.kit ?? ""} kit, and steps in ${round.report.stepMs?.toFixed(2) ?? "?"} ms` : `round ${round.round}: the module fails ${failed.join(", ")} (${round.problems.split("\n").slice(0, 3).join(" ").slice(0, 300)})`);
    },
  });
  if (outcome.kind === "refused") fallBack(`the writer finds no mechanism a learner could play with: ${outcome.reason}`);
  if (outcome.kind === "failed") {
    if (outcome.source) sink.artifact("mechanism-failed", { source: outcome.source, checks: outcome.report?.checks ?? null });
    fallBack(`the module still fails its checks: ${outcome.reason}`);
  }
  if (outcome.kind !== "passed") throw new Stop("failed", "the writer's loop ended without a module");
  const { source, manifest } = outcome;
  const sha256 = createHash("sha256").update(source).digest("hex");
  const module = { sha256, characters: source.length, manifest };
  sink.artifact("mechanism", { schemaVersion: "mechanism/1", sha256, source, manifest, checks: outcome.report.checks, stepMs: outcome.report.stepMs, writer });
  ctx.cancelled();

  // Candidates: every level the module allows, judged by the level and visibility rules over 20 seeds.
  say("candidates", "making the module's candidate levels in code, each run on 20 seeds in the sandbox");
  const sweep = await sweepMechanism(source, manifest);
  const judged = judgeMechanismCandidates(manifest, sweep);
  for (const failure of sweep.failures.slice(0, 3)) say("candidates", `a run failed: ${failure}`);
  const shown = shortList(judged.passing);
  sink.artifact("candidates", { runs: judged.runs, passing: judged.passing.map((candidate) => ({ id: candidate.id, brief: candidate.brief, holds: candidate.holds ?? 0 })), refused: judged.refused, shown: shown.map((candidate) => candidate.id) });
  say("candidates", `${judged.passing.length + judged.refused.length} candidate levels from ${judged.runs} runs; ${judged.passing.length} pass every rule; the planners choose among ${shown.length}`);
  if (judged.passing.length < 3) fallBack(`only ${judged.passing.length} of the module's candidate levels pass the rules, and a world needs three`);

  // Planning: the planners choose among them, the first whose picks the rules accept.
  const pickProblems = (picks: CandidatePicks): string[] => {
    const problems: string[] = [];
    const ids = picks.levels.map((pick) => pick.candidate);
    const unknown = ids.filter((id) => !shown.some((candidate) => candidate.id === id));
    if (unknown.length > 0) problems.push(`no candidate ${unknown.join(", ")}`);
    if (new Set(ids).size !== ids.length) problems.push("a candidate is chosen twice");
    const findings = [reading?.result, ...(reading?.findings ?? [])];
    if (picks.levels.some((pick) => pick.finding >= findings.length)) problems.push("a pick names a finding the paper does not have");
    if (hooks.length > 0 && !hooks.includes(ids[0] ?? "")) problems.push(`level 1, the hook, is one of ${hooks.join(", ")}: they take a parameter away as the paper means it`);
    if (problems.length > 0 || !reading) return problems;
    const found = checkFindings(planFromPicks(picks, shown, reading, manifest.steps), reading, text, 0);
    return [...found.levels.flatMap((level, index) => level.map((problem) => `level ${index + 1}: ${problem}`)), ...found.world];
  };
  // The hook's candidates: those taking a parameter away as the paper means, when there are any.
  const hooks = shown.filter((candidate) => judged.away.includes(candidate.id)).map((candidate) => candidate.id);
  const pickInput = { title, reading, candidates: shown, hooks };
  const done = new AbortController();
  const attempt = async (who: string, stage: "planner" | "second-planner") => {
    const picked = await timed(stage, (client) => pickLevels(client, who, pickInput, { stage, structuredOutput: structured(who) }), done.signal);
    const problems = pickProblems(picked.value);
    if (problems.length > 0) {
      // Said as it happens, so a job that waits on the other planner shows why (R13).
      say("planning", `${who}'s picks break the rules: ${problems.slice(0, 3).join("; ")}`);
      throw Object.assign(new Error(`${who}'s picks: ${problems.slice(0, 3).join("; ")}`), { who, picks: picked.value, problems });
    }
    return { who, picks: picked.value };
  };
  const plannerModel = modelFor("planner");
  const secondPlanner = input.config.stages["second-planner"] ?? null;
  let chosen: { readonly who: string; readonly picks: CandidatePicks };
  try {
    chosen = await Promise.any([attempt(plannerModel, "planner"), ...(secondPlanner ? [attempt(secondPlanner, "second-planner")] : [])]);
  } catch (error) {
    const errors: unknown[] = error instanceof AggregateError ? error.errors : [error];
    const refused = errors.find((entry): entry is Error & { who: string; picks: CandidatePicks; problems: string[] } => entry instanceof Error && "picks" in entry);
    if (!refused) throw new Stop("failed", `no planner chose levels: ${errors.map(firstLine).join("; ")}`);
    // One scoped repair: the planner whose picks came back asked again, with what was wrong.
    move("repairing", "planning", `no planner chose levels the rules accept (${firstLine(refused)}); asking ${refused.who} to choose again`);
    const again = await timed("planner", (client) =>
      completeStructured(client, { stage: "planner", model: refused.who, messages: [...pickerMessages(pickInput), { role: "assistant", content: JSON.stringify(refused.picks) }, { role: "user", content: `These problems were found:\n${refused.problems.map((line) => `- ${line}`).join("\n")}\nChoose again.` }], temperature: 0, maxTokens: PICKER_MAX_TOKENS }, CandidatePicks, { name: "picks", structuredOutput: structured(refused.who), moreRoom: true }),
    );
    const problems = pickProblems(again.value);
    if (problems.length > 0) throw new Stop("failed", `the planner's picks still break the rules after a repair: ${problems.slice(0, 4).join("; ")}`);
    move("planning", "planning", "the planner's new picks meet the rules");
    chosen = { who: refused.who, picks: again.value };
  } finally {
    done.abort();
  }
  let plan: Plan = planFromPicks(chosen.picks, shown, reading, manifest.steps);
  sink.artifact("plan-choice", { planner: chosen.who, picks: chosen.picks.levels });
  say("planning", `${chosen.who} chose ${chosen.picks.levels.map((pick, index) => `level ${index + 1} ${pick.candidate} on finding ${pick.finding}`).join(", ")}`);

  // Words: every level's, and the world's name and limits, each within the explainer's time.
  const explainer = modelFor("explainer");
  const passages = promptSource(text, { maxCharacters: 60_000, sections: reading.sections }).block;
  const modelText = mechanismWords(manifest);
  const findings = [reading.result, ...reading.findings];
  const briefOf = (level: PlanLevel): string => judged.passing.find((candidate) => factsKey(candidate.level) === factsKey(level))?.brief ?? "";
  const withWords = (level: PlanLevel, written: WrittenLevel): { explained: ExplainedLevel; level: PlanLevel } => {
    const { title: levelTitle, goal, control, whatIf, effect, prediction, passageTitle, carryForward, ...explained } = written;
    return { explained, level: { ...level, title: levelTitle, goal, control: { ...level.control, ...control }, whatIf: { ...level.whatIf, prompt: whatIf }, effect, prediction, passage: level.passage ? { ...level.passage, title: passageTitle } : null, carryForward } };
  };
  const levelWords = (target: Plan, index: number, brief?: string) => {
    const level = target.levels[index] as PlanLevel;
    const finding = level.finding === null ? undefined : findings[level.finding];
    return timed("explainer", (client) => writeLevel(client, explainer, { title, plan: target, passages, model: modelText, facts: brief ?? briefOf(level), finding: finding ? `${finding.text} (the paper: "${finding.quote}")` : "none" }, index, { structuredOutput: structured(explainer) }));
  };
  say("words", `${explainer} writes every level's words at three depths, and the world's name`);
  const [written, world] = await Promise.all([Promise.all(plan.levels.map((_, index) => settle(levelWords(plan, index)))), settle(timed("explainer", (client) => writeWorld(client, explainer, { title, mechanism: reading?.mechanism ?? "", levels: plan.levels.map(briefOf) }, { structuredOutput: structured(explainer) })))]);
  const unwritten = written.flatMap((entry, index) => (entry.error === null ? [] : [index]));
  if (unwritten.includes(0)) throw new Stop("failed", `the hook's words did not come: ${firstLine(written[0]?.error)}`);
  for (const index of unwritten) say("words", `level ${index + 1}'s words did not come (${firstLine(written[index]?.error)}); it is left out`);
  const kept = written.flatMap((entry, index) => (entry.value ? [withWords(plan.levels[index] as PlanLevel, entry.value.value)] : []));
  if (kept.length < 3) throw new Stop("failed", `only ${kept.length} levels have their words, and a world needs three`);
  // A garbled name, one that repeats its instruction ("at most 5 words, naming…"), as one explainer's did, or runs on, is no name: the module's title stands in.
  const named = world.value?.value.title;
  const title_ = named && !garbledName(named) ? named : manifest.title.slice(0, 40);
  if (named && title_ !== named) say("words", `the world's name came back garbled ("${named}"); the module's title stands in`);
  plan = { ...plan, title: title_, limits: world.value?.value.limits ?? ["It shows a small model of the paper's mechanism, not the paper's own system."], levels: kept.map((entry) => entry.level) };
  let explanation = { levels: kept.map((entry) => entry.explained) };
  // The findings check on What-ifs: words that take a setting away where the value does not are written again, once.
  for (const [index, problem] of whatIfWordsProblems(plan.levels, manifest)) {
    say("words", `level ${index + 1}: ${problem}`);
    const words = (await timed("explainer", (client) => reword(client, explainer, { title, plan, passages, model: modelText }, index, problem, { structuredOutput: structured(explainer) }))).value;
    const { goal, whatIf, prediction, effect, ...level } = words;
    plan = { ...plan, levels: plan.levels.map((entry, at) => (at === index ? { ...entry, goal, effect, whatIf: { ...entry.whatIf, prompt: whatIf }, prediction: { ...entry.prediction, prompt: prediction } } : entry)) };
    explanation = { levels: explanation.levels.map((entry, at) => (at === index ? level : entry)) };
  }

  // Building, the level rule and release; then provenance and the reviewers.
  const assemble = () => assembleMechanismWorld({ source: text, register, reading, plan, explanation, routingReason: ctx.route.reason, module });
  /** Drops the named levels, never the hook, keeping three at least. */
  const drop = (indices: readonly number[], why: string): void => {
    if (indices.includes(0)) throw new Stop("failed", `the hook ${why}`);
    const levels = plan.levels.filter((_, index) => !indices.includes(index));
    if (levels.length < 3) throw new Stop("failed", `${indices.length} level(s) ${why}, leaving fewer than three`);
    plan = { ...plan, levels };
    explanation = { levels: explanation.levels.filter((_, index) => !indices.includes(index)) };
  };
  const misworded = whatIfWordsProblems(plan.levels, manifest);
  if (misworded.has(0)) throw new Stop("needs_information", `the hook's What-if still says it takes a setting away where it does not: ${misworded.get(0) ?? ""}. The owner decides.`);
  if (misworded.size > 0) drop([...misworded.keys()], "still says its What-if takes a setting away where it does not");
  let spec: Record<string, unknown>;
  for (;;) {
    move("building", "assembly", "assembling the world and building it against the module's manifest");
    const assembled = assemble();
    for (const note of assembled.notes) say("assembly", note);
    const built = buildWorld(assembled.spec, registry);
    if (built.ok) {
      spec = assembled.spec;
      break;
    }
    sink.artifact("build-problems", built.problems);
    const failing = [...new Set(built.problems.map((problem) => /^levels\.(\d+)/.exec(problem.path)?.[1]).filter((index): index is string => index !== undefined).map(Number))];
    if (failing.length === 0) throw new Stop("failed", `the world does not build: ${built.problems.slice(0, 3).map((problem) => `${problem.path}: ${problem.message}`).join("; ")}`);
    drop(failing, "does not build");
    move("repairing", "assembly", `dropping ${failing.length} level(s) that do not build`);
  }
  move("running", "level rule", "running each level's two worlds again on 20 seeds in the sandbox");
  const again = judgeMechanismCandidates(manifest, await sweepMechanism(source, manifest));
  const holdsAgain = plan.levels.map((level) => again.passing.find((candidate) => candidate.level.whatIf.parameter === level.whatIf.parameter && candidate.level.whatIf.value === level.whatIf.value && candidate.level.difference.compartment === level.difference.compartment && candidate.level.difference.summary === level.difference.summary)?.holds ?? null);
  sink.artifact("level-rule", plan.levels.map((level, index) => ({ level: index + 1, title: level.title, holds: holdsAgain[index] })));
  const found = checkFindings(plan, reading, text, 0);
  sink.artifact("findings", found);
  const failingRule = holdsAgain.flatMap((holds, index) => (holds === null || (found.levels[index]?.length ?? 0) > 0 ? [index] : []));
  if (failingRule.length > 0) {
    drop(failingRule, "no longer meets the level rule or tests the paper's findings");
    move("repairing", "level rule", `dropping ${failingRule.length} level(s) the rules refuse on a second run`);
    move("building", "assembly", "assembling the world again without them");
    spec = assemble().spec;
    move("running", "level rule", "the levels kept meet the rule");
  }
  if (checkFindings(plan, reading, text, 0).world.length > 0) throw new Stop("failed", `the levels do not test enough of the paper's findings: ${checkFindings(plan, reading, text, 0).world.join("; ")}`);
  say("level rule", `every level meets the rule and shows its difference: ${holdsAgain.filter((holds) => holds !== null).map((holds, index) => `level ${index + 1} ${holds ?? 0} of 20`).join(", ")}`);
  move("checking", "provenance", "checking every anchor quotes the source exactly");
  const provenance = checkProvenance(spec, text);
  sink.artifact("provenance", provenance);
  if (provenance.length > 0) throw new Stop("failed", `provenance fails: ${provenance.slice(0, 3).map((problem) => `${problem.path}: ${problem.message}`).join("; ")}`);
  // Playable now, checked but not yet reviewed (R13).
  sink.artifact("released", { levels: plan.levels.map((level, index) => ({ level: index + 1, title: level.title })), of: plan.levels.length, reviewed: false, world: spec });
  ctx.released(plan.levels.length);
  releasing();
  say("release", `${plan.levels.length} levels pass every check and are playable while the reviewers read them: ${plan.levels.map((level) => `"${level.title}"`).join(", ")}`);

  // The reviewers (ADR-0058's amendment), each level read by both. A block on a What-if, or on an
  // outcome the module restates, replaces the level with the next valid candidate, the hook with the
  // next hook-eligible one; a block on words writes them again. At most two rounds of repairs, each
  // begun only when the job has time for it and the review after it; a level still blocked is then
  // dropped, or, for the hook, the owner decides. No reviewer can turn a failed check into a pass,
  // and any other block is advice.
  const reviewer = modelFor("reviewer");
  const secondReviewer = input.config.stages["second-reviewer"] ?? null;
  const moduleText = `${modelText}\n\n${source.slice(0, 12_000)}`;
  interface Blocks {
    readonly replace: Map<number, string>;
    readonly reword: Map<number, string>;
    readonly answered: boolean;
  }
  const holdsOf = (level: PlanLevel): number | null => judged.passing.find((candidate) => factsKey(candidate.level) === factsKey(level))?.holds ?? null;
  const reviewOnce = async (indices: readonly number[], pass: number): Promise<Blocks> => {
    const replace = new Map<number, string>();
    const reword = new Map<number, string>();
    let answered = false;
    await Promise.all(
      indices.map(async (index) => {
        const level = plan.levels[index] as PlanLevel;
        const one = { title, world: `Level ${index + 1}, ${level.title}: ${level.goal} Control: ${level.control.label}. What if: ${level.whatIf.prompt} (${level.whatIf.parameter} set to ${level.whatIf.value}). It states: ${level.effect}`, checks: [`The module's checks: passed (it loads, declares what the paper means by each parameter, writes in none of the paper's results, repeats on a seed, runs across every range, stays finite, responds to its parameters, draws in its kit).`, `The level rule: level ${index + 1} holds on ${holdsOf(level) ?? "at least 16"} of 20 seeds.`, "The visibility rule: its difference shows on its chart.", "Provenance: every anchor quotes the source exactly."].join("\n"), passages, module: moduleText };
        const asks = [reviewer, ...(secondReviewer ? [secondReviewer] : [])].map((who, at) => settle(timed(at === 0 ? "reviewer" : "second-reviewer", (client) => reviewMechanism(client, who, one, { structuredOutput: structured(who), ...(at === 1 ? { stage: "second-reviewer" as const } : {}) }))));
        for (const [at, settled] of (await Promise.all(asks)).entries()) {
          if (settled.value === null) {
            if (!(settled.error instanceof ModelError)) throw settled.error instanceof Error ? settled.error : new Error("a reviewer's call failed");
            say("review", `${at === 0 ? reviewer : (secondReviewer ?? "")} gave no review of level ${index + 1} in time`);
            continue;
          }
          answered = true;
          const result: MechanismReview = settled.value.value;
          sink.artifact(`review-${pass}-level-${index + 1}-${at === 0 ? "first" : "second"}`, result);
          const blocking = result.findings.filter((finding) => finding.severity === "blocking");
          const why = (kinds: readonly string[]) => blocking.filter((finding) => kinds.includes(finding.kind)).map((finding) => `${finding.finding} ${finding.suggestion}`).join(" ");
          if (why(["what-if", "restated"])) replace.set(index, `${replace.get(index) ?? ""} ${why(["what-if", "restated"])}`.trim());
          else if (why(["wording"])) reword.set(index, `${reword.get(index) ?? ""} ${why(["wording"])}`.trim());
          for (const finding of blocking.filter((entry) => entry.kind === "other")) say("review", `level ${index + 1}: a block of kind other is advice: ${finding.finding}`);
        }
      }),
    );
    return { replace, reword, answered };
  };
  /** What-ifs a reviewer refused, never offered again. */
  const refused = new Set<string>();
  const whatIfOf = (level: PlanLevel): string => `${level.whatIf.parameter}=${level.whatIf.value}`;
  /** The next valid candidate: passing, not in the world, its What-if never refused; for the hook, one taking a parameter away as the paper means first. */
  const nextCandidate = (hook: boolean) => {
    const inWorld = new Set(plan.levels.map(factsKey));
    const order = [...shown, ...judged.passing.filter((candidate) => !shown.includes(candidate))];
    const pool = order.filter((candidate) => !inWorld.has(factsKey(candidate.level)) && !refused.has(whatIfOf(candidate.level)));
    return (hook ? pool.find((candidate) => judged.away.includes(candidate.id)) : undefined) ?? pool[0] ?? null;
  };
  /** A level in place of another, testing the same finding, its words written for it. */
  const replaceLevel = async (index: number): Promise<boolean> => {
    const old = plan.levels[index] as PlanLevel;
    refused.add(whatIfOf(old));
    const candidate = nextCandidate(index === 0);
    if (!candidate) return false;
    const placed: PlanLevel = { ...candidate.level, kind: index === 0 ? "hook" : "result", finding: old.finding, passage: old.passage };
    const target: Plan = { ...plan, levels: plan.levels.map((level, at) => (at === index ? placed : level)) };
    const written = withWords(placed, (await levelWords(target, index, candidate.brief)).value);
    plan = { ...target, levels: target.levels.map((level, at) => (at === index ? written.level : level)) };
    explanation = { levels: explanation.levels.map((level, at) => (at === index ? written.explained : level)) };
    say("review", `level ${index + 1} is now ${candidate.id}: ${candidate.brief.slice(0, 240)}`);
    return true;
  };
  say("review", `${secondReviewer ? `two reviewers, ${reviewer} and ${secondReviewer},` : `the reviewer, ${reviewer},`} read each level, the module and the checks' results`);
  let blocks = await reviewOnce(plan.levels.map((_, index) => index), 1);
  let unreviewed: string | null = blocks.answered ? null : "no reviewer answered within its time, so no reviewer read this world; every check passed";
  const ROUNDS = 2;
  for (let round = 1; round <= ROUNDS && (blocks.replace.size > 0 || blocks.reword.size > 0); round += 1) {
    if (ctx.left() < 5 * 60_000) {
      say("deadline", `no time for a round of repairs and a review after it: ${seconds(ctx.left())} of the job's time is left`);
      break;
    }
    const replacing = [...blocks.replace.keys()];
    const rewording = [...blocks.reword.keys()].filter((index) => !blocks.replace.has(index));
    move("repairing", "review", [replacing.length > 0 ? `replacing ${replacing.map((index) => `level ${index + 1}`).join(", ")}, whose What-if a reviewer finds cannot teach it` : "", rewording.length > 0 ? `writing again the words of ${rewording.map((index) => `level ${index + 1}`).join(", ")}` : ""].filter(Boolean).join("; "));
    const changed: number[] = [];
    for (const index of replacing) if (await replaceLevel(index)) changed.push(index);
    for (const index of rewording) {
      const words = (await timed("explainer", (client) => reword(client, explainer, { title, plan, passages, model: modelText }, index, `${blocks.reword.get(index) ?? ""}\n${moduleText}`, { structuredOutput: structured(explainer) }))).value;
      const { goal, whatIf, prediction, effect, ...level } = words;
      plan = { ...plan, levels: plan.levels.map((entry, at) => (at === index ? { ...entry, goal, effect, whatIf: { ...entry.whatIf, prompt: whatIf }, prediction: { ...entry.prediction, prompt: prediction } } : entry)) };
      explanation = { levels: explanation.levels.map((entry, at) => (at === index ? level : entry)) };
      changed.push(index);
    }
    const unplaced = replacing.filter((index) => !changed.includes(index));
    if (unplaced.includes(0)) throw new Stop("needs_information", `no candidate is left to replace the hook, whose What-if a reviewer finds cannot teach it: ${blocks.replace.get(0) ?? ""}. The owner decides.`);
    if (unplaced.length > 0) drop(unplaced, "has a What-if a reviewer refused, and no candidate is left to replace it");
    spec = assemble().spec;
    if (!buildWorld(spec, registry).ok || checkProvenance(spec, text).length > 0 || checkFindings(plan, reading, text, 0).world.length > 0) throw new Stop("failed", "the world with its repaired levels does not pass its checks");
    move("checking", "review", "the reviewers read the levels repaired");
    const again = await reviewOnce(changed.map((index) => index - unplaced.filter((dropped) => dropped < index).length), round + 1);
    if (!again.answered) unreviewed = "the reviewers did not answer on the levels repaired; every check passed";
    blocks = again;
  }
  const still = [...new Set([...blocks.replace.keys(), ...blocks.reword.keys()])];
  if (still.length > 0) {
    if (still.includes(0)) throw new Stop("needs_information", `the hook is still blocked after ${ROUNDS} rounds of repairs: ${blocks.replace.get(0) ?? blocks.reword.get(0) ?? ""}. The owner decides.`);
    drop(still, "is still blocked by a reviewer after its repairs");
    say("review", `dropped ${still.length} level(s) still blocked after their repairs`);
    spec = assemble().spec;
  }
  if (unreviewed) say("review", unreviewed);
  sink.artifact("world", spec);
  sink.artifact("timing", ctx.timing());
  move("ready", "ready", `the world is built and checked: ${plan.levels.length} levels on a ${GENERATED_MODEL_LABEL}, every one meeting the level rule, showing its difference and testing the paper's findings${unreviewed === null ? "" : `; not reviewed: ${unreviewed}`}`);
  return { state: "ready", message: "ready", world: spec };
}
