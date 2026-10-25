/**
 * The compact planner (ADR-0055): from candidate levels that already pass every rule, it chooses a
 * world's five, the hook first, and maps each to one of the paper's anchored findings. It writes no
 * words: the explainer writes them afterwards, a level at a time. Its answer is a few ids and
 * numbers, so a model asked not to think answers in seconds.
 */
import type { ModelSpec, SourceText } from "@paperplay/contracts";
import { z } from "zod";
import { completeStructured, type ChatMessage, type ModelClient, type StructuredResult } from "../models/index.ts";
import { checkFindings } from "../rule/findings.ts";
import { hookSpreadProblem } from "../rule/spread.ts";
import type { OwnNumbersForPlanner, Plan, PlanLevel } from "../stages/planner.ts";
import type { Reading } from "../stages/reader.ts";
import { DATA_RULE } from "../stages/source.ts";
import type { LevelCandidate } from "./types.ts";

export const CandidatePicks = z.strictObject({
  levels: z.array(z.strictObject({ candidate: z.string().min(1).max(12), finding: z.int().min(0) })).min(3).max(5),
});
export type CandidatePicks = z.infer<typeof CandidatePicks>;

export const PICKER_INSTRUCTIONS = [
  "You choose the levels of a small learning game made from a scientific paper's model.",
  DATA_RULE,
  "Every candidate level below already passes the game's rules: its claim holds and its difference shows. Choose five that teach what the paper found, and say which of the paper's findings each one tests.",
  "Rules:",
  "- Five levels, each a different candidate; the first is the hook.",
  "- The hook tests finding 0, the paper's headline result: choose the candidate whose change shows it most directly. When the hook's candidates are listed apart, the hook must be one of those: only they measure what the headline speaks of.",
  "- Each level tests one finding, by its number; at least three levels test different findings.",
  "- Prefer different controls, so each level teaches something new.",
  'Answer with JSON alone, no words: {"levels":[{"candidate":"c3","finding":0},{"candidate":"c8","finding":2}, ...]}',
].join("\n");

/** At most this many candidates go to the planner: the most robust first, and no more than three on one control. */
export const CANDIDATES_SHOWN = 30;

/**
 * The candidates the planner reads: every one that can be the hook, then those holding on the most
 * starts, a few on each control, in the generator's order.
 */
export function shortList(candidates: readonly LevelCandidate[], hooks: readonly string[] = []): LevelCandidate[] {
  const perControl = new Map<string, number>();
  const ranked = [...candidates].sort((a, b) => Number(hooks.includes(b.id)) - Number(hooks.includes(a.id)) || (b.holds ?? 0) - (a.holds ?? 0));
  const kept = ranked.filter((candidate) => {
    const control = candidate.level.control.parameter;
    const count = perControl.get(control) ?? 0;
    perControl.set(control, count + 1);
    return count < 3;
  });
  const chosen = new Set(kept.slice(0, CANDIDATES_SHOWN).map((candidate) => candidate.id));
  return candidates.filter((candidate) => chosen.has(candidate.id));
}

export function pickerMessages(input: { readonly title: string; readonly reading: Reading; readonly candidates: readonly LevelCandidate[]; readonly ownNumbers?: OwnNumbersForPlanner; readonly hooks?: readonly string[] }): ChatMessage[] {
  const mismatch = input.ownNumbers?.verdict === "mismatch";
  return [
    { role: "system", content: PICKER_INSTRUCTIONS },
    {
      role: "user",
      content: [
        `PAPER START\nTitle: ${input.title}\nQuestion: ${input.reading.question}\nMechanism: ${input.reading.mechanism}`,
        `Findings, by number:\n0 (the headline result): ${input.reading.result.text}\n${input.reading.findings.map((finding, index) => `${index + 1} (${finding.kind}): ${finding.text}`).join("\n")}\nPAPER END`,
        ...(mismatch
          ? [
              (input.hooks ?? []).length > 0 || !input.hooks
                ? "Running the paper's own numbers found its headline's threshold does not appear at the values it lists: the hook still tests finding 0, by the direction its change shows, never the threshold itself."
                : "Running the paper's own numbers found its headline does not appear at the values it lists, and no candidate measures what it speaks of: the hook tests another finding instead, by its number.",
            ]
          : []),
        ...((input.hooks ?? []).length > 0
          ? [
              `Candidates for level 1, the hook, which must be one of these:\n${input.candidates.filter((candidate) => input.hooks?.includes(candidate.id)).map((candidate) => candidate.brief).join("\n")}`,
              `Candidates for levels 2 to 5 (a hook's candidate above may also be one of them):\n${input.candidates.filter((candidate) => !input.hooks?.includes(candidate.id)).map((candidate) => candidate.brief).join("\n")}`,
            ]
          : [`Candidate levels:\n${input.candidates.map((candidate) => candidate.brief).join("\n")}`]),
        "Choose the five levels.",
      ].join("\n\n"),
    },
  ];
}

/** Room for a reply of a few ids, and for a model that thinks anyway before it. */
export const PICKER_MAX_TOKENS = 16_000;

export function pickLevels(client: ModelClient, model: string, input: Parameters<typeof pickerMessages>[0], options: { readonly stage?: "planner" | "second-planner"; readonly structuredOutput: boolean }): Promise<StructuredResult<CandidatePicks>> {
  return completeStructured(client, { stage: options.stage ?? "planner", model, messages: pickerMessages(input), temperature: 0, maxTokens: PICKER_MAX_TOKENS }, CandidatePicks, { name: "picks", structuredOutput: options.structuredOutput, moreRoom: true });
}

/** The candidates that can be the hook: on a compartment the headline speaks of, when it speaks of spread (ADR-0044's spread rule). */
export const hookCandidates = (candidates: readonly LevelCandidate[], model: ModelSpec, headline: Reading["result"]): string[] => candidates.filter((candidate) => hookSpreadProblem(model, headline, candidate.level.difference.compartment) === null).map((candidate) => candidate.id);

/** The plan the picks make, words still to write: each level its candidate's, testing its finding, the finding's quote its passage. */
export function planFromPicks(picks: CandidatePicks, candidates: readonly LevelCandidate[], reading: Reading, horizon: number): Plan {
  const findings = [reading.result, ...reading.findings];
  const levels = picks.levels.map((pick, index): PlanLevel => {
    const candidate = candidates.find((entry) => entry.id === pick.candidate);
    const level = candidate?.level as PlanLevel;
    const finding = findings[pick.finding];
    return { ...level, kind: index === 0 ? "hook" : "result", finding: pick.finding, passage: finding ? { title: "To be written.", quote: finding.quote } : null };
  });
  return { title: "To be written", perWatchSecond: Math.max(horizon / 40, 1e-6), levels, limits: ["To be written."] };
}

export interface PickProblem {
  readonly problems: readonly string[];
  /** The finding level 1 tests: 0 unless the headline's mismatch is confirmed (ADR-0040). */
  readonly hookFinding: number;
}

/** Whether the picks make a world the rules accept: real, distinct candidates, a hook on the headline, three findings. */
export function validatePicks(picks: CandidatePicks, candidates: readonly LevelCandidate[], input: { readonly reading: Reading; readonly model: ModelSpec; readonly source: SourceText; readonly horizon: number; readonly ownNumbers?: OwnNumbersForPlanner; readonly hooks?: readonly string[] }): PickProblem {
  const problems: string[] = [];
  const ids = picks.levels.map((pick) => pick.candidate);
  const unknown = ids.filter((id) => !candidates.some((candidate) => candidate.id === id));
  if (unknown.length > 0) problems.push(`no candidate ${unknown.join(", ")}`);
  if (new Set(ids).size !== ids.length) problems.push("a candidate is chosen twice");
  const findings = [input.reading.result, ...input.reading.findings];
  const unread = picks.levels.filter((pick) => pick.finding >= findings.length).map((pick) => pick.finding);
  if (unread.length > 0) problems.push(`no finding ${unread.join(", ")}`);
  if (problems.length > 0) return { problems, hookFinding: 0 };
  // The hook tests the headline (ADR-0040); it takes another finding only when the paper's own numbers
  // confirmed the headline's mismatch and no candidate measures what the headline speaks of.
  const fallback = input.ownNumbers?.verdict === "mismatch" && input.hooks !== undefined && input.hooks.length === 0;
  const hookFinding = fallback ? (picks.levels[0]?.finding ?? 0) : 0;
  const hook = candidates.find((candidate) => candidate.id === ids[0]);
  const spread = hook && !fallback ? hookSpreadProblem(input.model, input.reading.result, hook.level.difference.compartment) : null;
  if (spread) problems.push(spread);
  const found = checkFindings(planFromPicks(picks, candidates, input.reading, input.horizon), input.reading, input.source, hookFinding);
  problems.push(...found.levels.flatMap((level, index) => level.map((problem) => `level ${index + 1}: ${problem}`)), ...found.world);
  return { problems, hookFinding };
}
