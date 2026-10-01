/**
 * The G1 local world: flock.planar.weighted at its defaults, opened on the hook seed.
 * Every value here is a teaching choice, not a claim from the paper (ADR-0003).
 */

/**
 * The opening seed: of the defaults sweep's seeds that qualified, the one whose flock
 * becomes a single group soonest and stays one (eval/sweeps/hook-seed.md, `npm run
 * choose:hook-seed`). A test re-runs that rule and fails if this drifts from it.
 */
export const HOOK_SEED = 4;
