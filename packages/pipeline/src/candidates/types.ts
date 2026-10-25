import type { ModelSpec } from "@paperplay/contracts";
import type { PlanLevel } from "../stages/planner.ts";

/** One level a world could hold: its plan level with placeholder words, which the rules judge, and its line for the planner. */
export interface LevelCandidate<L = PlanLevel> {
  readonly id: string;
  readonly level: L;
  /** What the planner reads: the control, the What-if, what is measured and the claim, with the numbers. */
  readonly brief: string;
  /** How many of the level rule's 20 starts the claim holds on, once judged. */
  readonly holds?: number;
}

/**
 * A family's hook (ADR-0055): every candidate level for a verified model, before any judging. The
 * attention, formula and diffusion families each supply one when they exist.
 */
export type CandidateGenerator<M = ModelSpec, C = number, L = PlanLevel> = (model: M, context: C) => LevelCandidate<L>[];
