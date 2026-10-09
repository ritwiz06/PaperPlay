import { describe, expect, it } from "vitest";
import { advance, MAX_STEPS_PER_FRAME, readoutDue, START_CLOCK, type StepClock } from "../src/stage-core/index.ts";

const dt = 1 / 60;

function play(frames: readonly number[]): { steps: number[]; clock: StepClock } {
  let clock = START_CLOCK;
  const steps: number[] = [];
  for (const seconds of frames) {
    const next = advance(clock, seconds, dt);
    steps.push(next.steps);
    clock = next.clock;
  }
  return { steps, clock };
}

describe("fixed-step driver", () => {
  it("takes a step for every 1/60 s of frame time and carries the remainder", () => {
    expect(play([1 / 120, 1 / 120, 1 / 120, 1 / 120]).steps).toEqual([0, 1, 0, 1]);
    expect(play([1 / 30, 1 / 30]).steps).toEqual([2, 2]);
  });

  it("takes whole steps at any frame rate, so steps track elapsed time", () => {
    const frames = Array.from({ length: 2000 }, (_, i) => 0.005 + ((i * 7919) % 35) / 1000);
    const elapsed = frames.reduce((sum, seconds) => sum + seconds, 0);
    const total = play(frames).steps.reduce((sum, n) => sum + n, 0);

    expect(Math.abs(total - Math.floor(elapsed / dt))).toBeLessThanOrEqual(1);
  });

  it("caps the steps one frame may take and drops the backlog instead of spiralling", () => {
    const stalled = advance(START_CLOCK, 1, dt);

    expect(stalled.steps).toBe(MAX_STEPS_PER_FRAME);
    expect(stalled.dropped).toBeGreaterThan(0);
    expect(stalled.alpha).toBeGreaterThanOrEqual(0);
    expect(stalled.alpha).toBeLessThan(1);
  });

  it("gives an interpolation fraction in [0, 1)", () => {
    for (const seconds of [0, 0.004, 1 / 60, 0.02, 0.05]) {
      const { alpha } = advance(START_CLOCK, seconds, dt);
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  it("treats a negative frame time, from a clock jumping back, as no time", () => {
    expect(advance(START_CLOCK, -0.5, dt).steps).toBe(0);
  });

  it("asks for readouts at most ten times a second", () => {
    let last: number | null = null;
    let due = 0;
    for (let frame = 0; frame < 120; frame++) {
      const now = frame / 120;
      if (readoutDue(last, now)) {
        due++;
        last = now;
      }
    }
    expect(due).toBe(10);
  });
});

describe("the speed control's clock", () => {
  const dt = 1 / 60;

  it("takes speed times as many fixed steps for the same frame", () => {
    for (const speed of [1, 2, 4] as const) {
      let clock: StepClock = START_CLOCK;
      let steps = 0;
      for (let frame = 0; frame < 60; frame++) {
        const next = advance(clock, dt, dt, undefined, speed);
        clock = next.clock;
        steps += next.steps;
      }
      expect(steps, `${speed}x`).toBe(60 * speed);
    }
  });

  it("scales the caps with the speed, so a slow frame at 4x is not cut to 1x's", () => {
    expect(advance(START_CLOCK, 0.2, dt, undefined, 4).steps).toBe(MAX_STEPS_PER_FRAME * 4);
    expect(advance(START_CLOCK, 0.2, dt).steps).toBe(MAX_STEPS_PER_FRAME);
  });
});
