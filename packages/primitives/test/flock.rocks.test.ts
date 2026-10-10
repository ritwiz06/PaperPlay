import { describe, expect, it } from "vitest";
import { flockAtRocks, flockDefaultParams, flockPlanarWeighted as flock, type FlockState } from "../src/index.ts";
import { deepFreeze } from "../src/variables.ts";

const state = (agents: [number, number][], obstacles: [string, number, number][]): FlockState => ({
  width: 32,
  height: 32,
  stepIndex: 0,
  agents: agents.map(([x, y]) => ({ x, y, vx: 1, vy: 0 })),
  beacons: [],
  obstacles: obstacles.map(([id, x, y]) => ({ id, x, y })),
});

describe("[R01] Q4, birds at rocks", () => {
  it("lists each rock's birds by E20's test, and counts a bird near two rocks once", () => {
    const rocks = state(
      [
        [8.2, 8], // at both rocks
        [31.6, 20], // at rock-3, across the seam
        [9, 8], // exactly 1 from rock-1: not at it
        [20, 20], // at none
        [8.6, 8.4], // at both rocks
      ],
      [
        ["rock-1", 8, 8],
        ["rock-2", 8.5, 8],
        ["rock-3", 0.3, 20],
      ],
    );
    expect(flockAtRocks(rocks)).toEqual({
      rocks: [
        { id: "rock-1", birds: [0, 4] },
        { id: "rock-2", birds: [0, 2, 4] },
        { id: "rock-3", birds: [1] },
      ],
      birds: 4,
    });
    expect(flockAtRocks(rocks).birds).toBe(flock.measure(rocks).birdsAtObstacles);
  });

  it("has nothing to list without rocks", () => {
    expect(flockAtRocks(state([[1, 1]], []))).toEqual({ rocks: [], birds: 0 });
  });

  it("agrees with E20 on every sky's run past four rocks, and changes nothing", () => {
    const params = { ...flockDefaultParams, obstacleWeight: 0 };
    for (let seed = 1; seed <= 5; seed++) {
      let current = flock.init(params, seed);
      for (const [id, x, y] of [["rock-1", 8, 8], ["rock-2", 24, 8], ["rock-3", 8, 24], ["rock-4", 24, 24]] as const) {
        current = flock.apply(current, { kind: "place", entityId: id, entity: "obstacle", x, y });
      }
      let touched = 0;
      for (let step = 0; step < 600; step++) {
        current = flock.step(current, params, flock.fixedTimestep);
        if (step % 30 !== 0) continue;
        const frozen = deepFreeze(structuredClone(current));
        const at = flockAtRocks(frozen);
        expect(at.birds).toBe(flock.measure(frozen).birdsAtObstacles);
        touched += at.birds;
      }
      // Without the rule for rocks, birds do fly through them, so the comparison is not empty.
      expect(touched, `sky ${seed}`).toBeGreaterThan(0);
    }
  });
});
