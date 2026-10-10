import { describe, expect, it } from "vitest";
import { flockDefaultParams, flockHeadings, flockPlanarWeighted as flock, type FlockState } from "../src/agents/flock/index.ts";

// Hand-built from MODEL.md E12 and Q2: each bird's heading is atan2(vy, vx); the flock's mean
// heading is the direction of the summed unit headings, in list order; a bird at rest has none.
const bird = (vx: number, vy: number) => ({ x: 1, y: 1, vx, vy });
const state = (agents: ReturnType<typeof bird>[]): FlockState =>
  Object.freeze({ width: 10, height: 10, stepIndex: 0, agents: Object.freeze(agents.map((a) => Object.freeze(a))), beacons: Object.freeze([]), obstacles: Object.freeze([]) });

describe("[R01] flock heading query (Q2)", () => {
  it("gives each bird's heading in the field's coordinates, and none for a bird at rest", () => {
    const { angles } = flockHeadings(state([bird(2, 0), bird(0, 3), bird(-1, 0), bird(0, 0)]));
    expect(angles).toEqual([0, Math.PI / 2, Math.PI, null]);
  });

  it("points the mean along the summed unit headings, whatever the speeds", () => {
    // Unit headings (1, 0) and (0, 1) sum to (1, 1): 45°, though the second bird is three times faster.
    expect(flockHeadings(state([bird(1, 0), bird(0, 3)])).mean).toBe(Math.atan2(1, 1));
    // Headings that cancel exactly have no mean.
    expect(flockHeadings(state([bird(1, 0), bird(-2, 0)])).mean).toBeNull();
  });

  it("agrees with E12: the summed headings' length over n is the directional agreement", () => {
    const run = flock.init(flockDefaultParams, 4);
    let current = run;
    for (let i = 0; i < 300; i++) current = flock.step(current, flockDefaultParams, flock.fixedTimestep);
    const { angles, mean } = flockHeadings(current);
    let [x, y] = [0, 0];
    for (const angle of angles) {
      if (angle === null) continue;
      x += Math.cos(angle);
      y += Math.sin(angle);
    }
    expect(angles).toHaveLength(flockDefaultParams.agentCount);
    expect(mean).toBeCloseTo(Math.atan2(y, x), 12);
    expect(Math.hypot(x, y) / angles.length).toBeCloseTo(flock.measure(current).directionalAgreement, 12);
  });

  it("reads the state without changing it", () => {
    const frozen = state([bird(1, 2), bird(-3, 1)]);
    const before = JSON.stringify(frozen);
    flockHeadings(frozen);
    expect(JSON.stringify(frozen)).toBe(before);
  });
});
