/**
 * The measured difference between a fork's two worlds (ADR-0018), as the fork view shows it
 * and the levels sweep checks it. Both worlds are sampled every SAMPLE_STEPS steps, step 0
 * included, up to the level's time; a summary turns one world's samples into one number, and
 * a claim compares the other world's summary with this world's.
 */
import type { DifferenceClaim, MeasuredDifference } from "@paperplay/contracts";

/** Samples every 6 steps: 0.1 s at 60 steps a second, as often as a readout updates. */
export const SAMPLE_STEPS = 6;

/** How many samples a level's time holds, step 0 and its last step included. */
export function sampleCount(seconds: number, timestep: number): number {
  return Math.floor(Math.round(seconds / timestep) / SAMPLE_STEPS) + 1;
}

/**
 * One world's samples as one number:
 * - `at`: the sample at that time;
 * - `first-reach`: the time of the first sample at or above the threshold, or Infinity if none;
 * - `lowest`: the lowest sample from `from` on;
 * - `total`: the samples before the level's time ends, each times the sampling interval.
 */
export function summarise(difference: MeasuredDifference, samples: readonly number[], timestep: number): number {
  const interval = SAMPLE_STEPS * timestep;
  const { summary } = difference;
  switch (summary.kind) {
    case "at":
      return samples[Math.round(summary.seconds / interval)] ?? Number.NaN;
    case "first-reach": {
      const index = samples.findIndex((value) => value >= summary.threshold);
      return index < 0 ? Number.POSITIVE_INFINITY : index * interval;
    }
    case "lowest": {
      const from = Math.ceil(summary.from / interval - 1e-9);
      return Math.min(...samples.slice(from));
    }
    case "total":
      return samples.slice(0, -1).reduce((sum, value) => sum + value, 0) * interval;
  }
}

/**
 * Whether the other world's summary stands where the claim says: higher (or lower) than this
 * world's by more than `by`, and, with `times`, more than `times` as much (or less than a
 * `times`-th). Never reaching a threshold (Infinity) is later than any time.
 */
export function claimHolds(claim: DifferenceClaim, here: number, there: number): boolean {
  if (claim.relation === "higher") return there > here + claim.by && (!("times" in claim) || claim.times === undefined || there > claim.times * here);
  return there < here - claim.by && (!("times" in claim) || claim.times === undefined || there * claim.times < here);
}
