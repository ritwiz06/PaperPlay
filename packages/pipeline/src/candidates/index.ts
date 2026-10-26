/**
 * Candidate levels (R13, ADR-0055): a family's levels generated in code, before any planner call,
 * and judged by the same rules that judge a world, so the planner only chooses among levels that
 * already pass. Each family supplies its own generator; the compartment family's is the first.
 */
export { compartmentCandidates } from "./compartments.ts";
export { judgeCandidates, judgeInParallel, type JudgeInput } from "./judge.ts";
export { CandidatePicks, CANDIDATES_SHOWN, hookCandidates, pickerMessages, pickLevels, PICKER_INSTRUCTIONS, planFromPicks, shortList, validatePicks, type PickProblem } from "./picker.ts";
export type { CandidateGenerator, LevelCandidate } from "./types.ts";

export { ATTENTION_HOLDS, ATTENTION_SEEDS, attentionCandidates, type AttentionContext, type AttentionLevel, type AttentionSetting } from "./attention.ts";

import { attentionCandidates } from "./attention.ts";
import { compartmentCandidates } from "./compartments.ts";

/**
 * Each family's generator, by its family's name (ADR-0055): a family without one is planned as
 * before. The compartment family's plans a job today; attention's waits for its worlds.
 */
export const CANDIDATE_GENERATORS = Object.freeze({ compartments: compartmentCandidates, attention: attentionCandidates });
