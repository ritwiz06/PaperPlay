import { describe, expect, it } from "vitest";
import { flockDefaultParams, flockNeighbours, type FlockState } from "../src/index.ts";

// Hand-built from MODEL.md E1–E2 on a 10 × 10 torus with R = 3 and R_s = 1:
// N_i = { j ≠ i : |δ_ij| < R } and S_i = { j ≠ i : 0 < |δ_ij| < R_s }, the short way round.
const params = { ...flockDefaultParams, perceptionRadius: 3, separationRadius: 1 };
const bird = (x: number, y: number) => ({ x, y, vx: 1, vy: 0 });
const state: FlockState = Object.freeze({
  width: 10,
  height: 10,
  stepIndex: 0,
  agents: Object.freeze([
    bird(9.5, 5), // 0: the bird asked about
    bird(0.5, 5), // 1: across the seam, |δ| = 1: seen, but not closer than R_s
    bird(9.5, 5.5), // 2: |δ| = 0.5: seen and crowding
    bird(9.5, 8.5), // 3: |δ| = 3 exactly: not seen
    bird(9.5, 5), // 4: coincident, |δ| = 0: seen, never crowding
    bird(2, 5), // 5: δx = m(−7.5, 10) = 2.5: seen
    bird(5, 5), // 6: δx = m(−4.5, 10) = −4.5: not seen
  ]),
  beacons: Object.freeze([]),
  obstacles: Object.freeze([]),
});

describe("[R01] flock neighbourhood query (E2)", () => {
  it("names the birds a bird sees and the ones crowding it, the short way round", () => {
    expect(flockNeighbours(state, params, 0)).toEqual({ seen: [1, 2, 4, 5], crowding: [2] });
  });

  it("measures from the bird asked about, so another bird has another neighbourhood", () => {
    // From bird 2: δ to 0 is 0.5, to 1 is √1.25 ≈ 1.118, to 4 is 0.5, to 5 is √6.5 ≈ 2.55, to 3 is 3.
    expect(flockNeighbours(state, params, 2)).toEqual({ seen: [0, 1, 4, 5], crowding: [0, 4] });
  });

  it("refuses a bird that does not exist", () => {
    expect(() => flockNeighbours(state, params, 7)).toThrow(RangeError);
    expect(() => flockNeighbours(state, params, -1)).toThrow(RangeError);
    expect(() => flockNeighbours(state, params, 0.5)).toThrow(RangeError);
  });
});
