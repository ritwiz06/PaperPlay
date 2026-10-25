/**
 * Candidate levels (R13, ADR-0055): a family's levels generated in code, before any planner call,
 * and judged by the same rules that judge a world, so the planner only chooses among levels that
 * already pass. Each family supplies its own generator; the compartment family's is the first.
 */
export { compartmentCandidates } from "./compartments.ts";
export { judgeCandidates, judgeInParallel, type JudgeInput } from "./judge.ts";
export { CandidatePicks, CANDIDATES_SHOWN, hookCandidates, pickerMessages, pickLevels, PICKER_INSTRUCTIONS, planFromPicks, shortList, validatePicks, type PickProblem } from "./picker.ts";
export type { CandidateGenerator, LevelCandidate } from "./types.ts";

import { compartmentCandidates } from "./compartments.ts";
import type { CandidateGenerator } from "./types.ts";

/** Each family's generator, by the router's family name: a family without one is planned as before. */
export const CANDIDATE_GENERATORS: Readonly<Record<string, CandidateGenerator>> = { compartments: compartmentCandidates };
