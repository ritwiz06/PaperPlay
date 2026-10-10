import { describe, expect, it } from "vitest";
import { flockPlanarWeighted as flock, flockSpread, type FlockState } from "../src/agents/flock/index.ts";

const state = (agents: [number, number, number, number][]): FlockState => ({
  width: 32,
  height: 32,
  stepIndex: 0,
  agents: agents.map(([x, y, vx, vy]) => ({ x, y, vx, vy })),
  beacons: [],
  obstacles: [],
});

describe("[R01] Q3, the spread query", () => {
  it("returns E19's group, its centre and its radius, the radius equal to groupSpread", () => {
    const square = state([
      [10, 10, 1, 0],
      [12, 10, 1, 0],
      [10, 12, 1, 0],
      [12, 12, 1, 0],
      [25, 25, 0, 1],
    ]);
    const spread = flockSpread(square);
    expect(spread.members).toEqual([0, 1, 2, 3]);
    expect(spread.centre?.x).toBeCloseTo(11, 12);
    expect(spread.centre?.y).toBeCloseTo(11, 12);
    expect(spread.radius).toBeCloseTo(Math.SQRT2, 12);
    expect(spread.radius).toBe(flock.measure(square).groupSpread);
  });

  it("finds the centre across the seam", () => {
    const seam = flockSpread(state([
      [31, 5, 1, 0],
      [1, 5, 1, 0],
      [31, 7, 1, 0],
      [1, 7, 1, 0],
    ]));
    const x = seam.centre?.x ?? Number.NaN;
    expect(Math.min(x, 32 - x)).toBeLessThan(1e-12);
    expect(seam.radius).toBeCloseTo(Math.SQRT2, 12);
  });

  it("has no centre and no radius without a group", () => {
    expect(flockSpread(state([[1, 1, 1, 0], [2, 1, 1, 0], [3, 1, 1, 0]]))).toEqual({ members: [], centre: null, radius: 0 });
  });

  it("reads the state and changes nothing", () => {
    const frozen = Object.freeze(state([[1, 1, 1, 0], [2, 1, 1, 0], [3, 1, 1, 0], [4, 1, 1, 0]]));
    expect(() => flockSpread(frozen)).not.toThrow();
  });
});
