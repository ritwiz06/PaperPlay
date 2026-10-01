/** Time not yet simulated, carried from frame to frame. */
export interface StepClock {
  readonly accumulator: number;
}

export interface Advance {
  /** Whole fixed steps to take this frame. */
  readonly steps: number;
  /** How far between the last two states to draw, in [0, 1). */
  readonly alpha: number;
  /** Seconds that will never be simulated because the frame stalled. */
  readonly dropped: number;
  readonly clock: StepClock;
}

export const START_CLOCK: StepClock = Object.freeze({ accumulator: 0 });
export const MAX_STEPS_PER_FRAME = 12;
export const MAX_FRAME_SECONDS = 0.25;

/**
 * Turns a frame's wall time into whole simulation steps. The simulation only ever takes
 * fixed steps, so its states depend on the step count, never on the frame rate.
 */
export function advance(clock: StepClock, frameSeconds: number, timestep: number, maxSteps = MAX_STEPS_PER_FRAME): Advance {
  const offered = Number.isFinite(frameSeconds) ? Math.max(frameSeconds, 0) : 0;
  const elapsed = Math.min(offered, MAX_FRAME_SECONDS);
  let accumulator = clock.accumulator + elapsed;
  let steps = Math.floor(accumulator / timestep);
  let dropped = offered - elapsed;
  if (steps > maxSteps) {
    dropped += (steps - maxSteps) * timestep;
    accumulator -= (steps - maxSteps) * timestep;
    steps = maxSteps;
  }
  accumulator = Math.max(accumulator - steps * timestep, 0);
  return { steps, alpha: Math.min(accumulator / timestep, 1 - Number.EPSILON), dropped, clock: { accumulator } };
}

/** Readouts update at most `hz` times a second, never once per frame. */
export function readoutDue(lastAt: number | null, now: number, hz = 10): boolean {
  return lastAt === null || now - lastAt >= 1 / hz - 1e-9;
}
