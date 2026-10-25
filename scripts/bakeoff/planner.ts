/**
 * The timed planner bake-off (ADR-0055): models asked the compact planner's prompt, choosing among
 * candidate levels that already pass every rule, each call timed. A call scores by its levels that
 * pass every rule (its picks validated as the controller validates them) and by its wall clock.
 * The prompts are built from recorded jobs; the calls are live, so `pipeline:live` alone runs it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ModelSpec, SourceRegisterEntry, SourceText } from "@paperplay/contracts";
import { horizonOf } from "@paperplay/pipeline/assemble";
import { compartmentCandidates, hookCandidates, judgeInParallel, pickLevels, shortList, validatePicks, type LevelCandidate } from "@paperplay/pipeline/candidates";
import type { ModelClient } from "@paperplay/pipeline/models";
import type { OwnNumbersForPlanner, Reading } from "@paperplay/pipeline/stages";

const root = join(import.meta.dirname, "..", "..");

/** A paper the bake-off plans: a recorded job's verified model and reading, and the kept source. */
export interface PlannerCase {
  readonly paper: string;
  readonly title: string;
  readonly model: ModelSpec;
  readonly reading: Reading;
  readonly source: SourceText;
  readonly ownNumbers: OwnNumbersForPlanner;
  readonly horizon: number;
  readonly candidates: readonly LevelCandidate[];
  /** The candidates that can be the hook. */
  readonly hooks: readonly string[];
}

/** The two papers, from the jobs of 2026-10-20, whose models and readings are kept on this machine. */
export const PLANNER_PAPERS = [
  { paper: "arxiv-2506.19869v1", job: "13ca95d0-e8f9-450a" },
  { paper: "pmc-PMC12334037", job: "f298895c-000c-4d44" },
] as const;

export async function plannerCase(paper: string, job: string): Promise<PlannerCase> {
  const read = (name: string): unknown => JSON.parse(readFileSync(join(root, "apps", "api", "data", "jobs", job, `${name}.json`), "utf8"));
  const model = read("model") as ModelSpec;
  const reading = read("reading") as Reading;
  const register = read("register") as SourceRegisterEntry;
  const own = read("own-numbers") as { verdict: OwnNumbersForPlanner["verdict"]; summary: string; observation: string | null };
  const source = JSON.parse(readFileSync(join(root, "fixtures", "sources", `${paper}.json`), "utf8")) as SourceText;
  const horizon = horizonOf(model);
  const judged = await judgeInParallel({ source, register, reading, model, routingReason: "", horizon }, compartmentCandidates(model, horizon));
  const hooks = hookCandidates(judged.passing, model, reading.result);
  return { paper, title: register.title, model, reading, source, ownNumbers: { verdict: own.verdict, summary: own.summary, observation: own.observation }, horizon, candidates: shortList(judged.passing, hooks), hooks };
}

export interface PlannerCall {
  readonly model: string;
  readonly paper: string;
  readonly milliseconds: number;
  readonly ok: boolean;
  readonly error: string | null;
  readonly levels: number;
  /** The levels whose picks pass every rule: all of them when the picks are valid, else those without a problem of their own. */
  readonly passing: number;
  readonly problems: readonly string[];
  readonly completionTokens: number | null;
  readonly answerCharacters: number | null;
}

/** One timed call: the compact planner's picks, validated as the controller validates them. */
export async function plannerCall(client: ModelClient, model: string, planner: PlannerCase, structuredOutput: boolean, clock: () => number = () => performance.now()): Promise<PlannerCall> {
  let usage: { completionTokens: number; text: string } | null = null;
  const watched: ModelClient = {
    async complete(request) {
      const response = await client.complete(request);
      usage = { completionTokens: response.usage.completionTokens, text: response.text };
      return response;
    },
  };
  const started = clock();
  try {
    const picked = await pickLevels(watched, model, { title: planner.title, reading: planner.reading, candidates: planner.candidates, ownNumbers: planner.ownNumbers, hooks: planner.hooks }, { structuredOutput });
    const milliseconds = clock() - started;
    const checked = validatePicks(picked.value, planner.candidates, { reading: planner.reading, model: planner.model, source: planner.source, horizon: planner.horizon, ownNumbers: planner.ownNumbers });
    const own = new Set(checked.problems.flatMap((problem) => /^level (\d+):/.exec(problem)?.[1] ?? []).map(Number));
    const worldWide = checked.problems.some((problem) => !/^level \d+:/.test(problem));
    const levels = picked.value.levels.length;
    const seen = usage as { completionTokens: number; text: string } | null;
    return { model, paper: planner.paper, milliseconds, ok: true, error: null, levels, passing: worldWide && own.size === 0 ? 0 : levels - own.size, problems: checked.problems, completionTokens: seen?.completionTokens ?? null, answerCharacters: seen?.text.length ?? null };
  } catch (error) {
    const seen = usage as { completionTokens: number; text: string } | null;
    return { model, paper: planner.paper, milliseconds: clock() - started, ok: false, error: error instanceof Error ? error.message.split("\n")[0] ?? "" : String(error), levels: 0, passing: 0, problems: [], completionTokens: seen?.completionTokens ?? null, answerCharacters: seen?.text.length ?? null };
  }
}

const percentile = (values: readonly number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? Number.NaN : (sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? Number.NaN);
};

export interface PlannerRow {
  readonly model: string;
  readonly calls: number;
  readonly valid: number;
  readonly passingMean: number;
  readonly p50: number;
  readonly p90: number;
  readonly completionMean: number | null;
}

/** Each model's row: calls whose picks pass every rule, levels passing, and wall clock, ranked by levels passing, then p90. */
export function plannerTable(calls: readonly PlannerCall[]): PlannerRow[] {
  const models = [...new Set(calls.map((call) => call.model))];
  return models
    .map((model) => {
      const mine = calls.filter((call) => call.model === model);
      const tokens = mine.flatMap((call) => (call.completionTokens === null ? [] : [call.completionTokens]));
      return {
        model,
        calls: mine.length,
        valid: mine.filter((call) => call.ok && call.problems.length === 0).length,
        passingMean: mine.reduce((sum, call) => sum + call.passing, 0) / mine.length,
        p50: percentile(mine.map((call) => call.milliseconds), 50),
        p90: percentile(mine.map((call) => call.milliseconds), 90),
        completionMean: tokens.length === 0 ? null : tokens.reduce((sum, value) => sum + value, 0) / tokens.length,
      };
    })
    .sort((a, b) => b.valid - a.valid || b.passingMean - a.passingMean || a.p90 - b.p90);
}

/** The two planners: the best row, then the best of another vendor, a vendor named by the model's first word. */
export function pickPlanners(rows: readonly PlannerRow[], vendorOf: (model: string) => string = (model) => model.split("-")[0] ?? model): readonly [string | null, string | null] {
  const usable = rows.filter((row) => row.valid > 0);
  const first = usable[0]?.model ?? null;
  const second = usable.find((row) => first !== null && vendorOf(row.model) !== vendorOf(first))?.model ?? null;
  return [first, second];
}
