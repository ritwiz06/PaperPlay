/**
 * Findings, not definitions (the owner, 2026-10-16; ADR-0037): a world's levels test what the paper
 * found, by rule. Level 1, the hook, tests the paper's headline result; at least three levels test
 * a finding whose quote the source holds; and a level sums its quantity over time only when its
 * finding is itself about a total. Whether a level's effect follows from the model's definitions
 * alone is the reviewer's to judge, and the planner repairs what it flags.
 */
import type { SourceText } from "@paperplay/contracts";
import { findQuote } from "../transcribe/convert.ts";

/**
 * What the check reads of a plan and a reading, named here rather than imported from the stages,
 * which reach the model client: the web app imports this module, and must never reach Node's own.
 */
interface Plan {
  readonly levels: readonly { readonly finding: number | null; readonly difference: { readonly summary: string } }[];
}
interface Reading {
  readonly result: { readonly text: string; readonly quote: string };
  readonly findings: readonly { readonly text: string; readonly quote: string }[];
}

/** At least this many levels test one of the paper's anchored findings. */
export const LEVELS_ON_FINDINGS = 3;
/** Words that say a finding is about a total over time, so a level may sum. */
const TOTAL = /\b(cumulative|cumulatively|total|totals|sum|summed|overall number)\b/i;

export interface FindingsCheck {
  /** Each level's problems, by its place in the plan. */
  readonly levels: readonly (readonly string[])[];
  /** Problems of the world as a whole. */
  readonly world: readonly string[];
  /** How many levels test an anchored finding. */
  readonly onFindings: number;
}

export function checkFindings(plan: Plan, reading: Reading, source: SourceText): FindingsCheck {
  const findings = [reading.result, ...reading.findings];
  const anchored = findings.map((finding) => findQuote(source.text, finding.quote) !== null);
  let onFindings = 0;
  const levels = plan.levels.map((level, index) => {
    const problems: string[] = [];
    const finding = level.finding === null ? null : (findings[level.finding] ?? undefined);
    if (finding === undefined) problems.push(`it tests finding ${String(level.finding)}, which the reading does not have`);
    if (index === 0 && level.finding !== 0) problems.push("level 1, the hook, must test the paper's headline result, finding 0");
    if (finding && level.finding !== null && anchored[level.finding]) onFindings++;
    if (level.difference.summary === "total" && !(finding && TOTAL.test(`${finding.text} ${finding.quote}`))) problems.push("it sums over time, which the paper's finding does not; use the peak, a value at a time, a time to a threshold or the mean");
    return problems;
  });
  const world = onFindings >= LEVELS_ON_FINDINGS ? [] : [`only ${onFindings} level(s) test one of the paper's findings whose quote the source holds; at least ${LEVELS_ON_FINDINGS} must`];
  return { levels, world, onFindings };
}
