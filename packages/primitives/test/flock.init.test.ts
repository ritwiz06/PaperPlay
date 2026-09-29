import { describe, expect, it } from "vitest";
import { flockDefaultParams, flockPlanarWeighted } from "../src/index.ts";

const flock = flockPlanarWeighted;
const speedOf = (agent: { vx: number; vy: number }): number => Math.sqrt(agent.vx * agent.vx + agent.vy * agent.vy);

describe("flock.planar.weighted init", () => {
  it("places agentCount birds inside the torus, each at the target speed", () => {
    const params = { ...flockDefaultParams, agentCount: 400, worldWidth: 50, worldHeight: 20 };
    const state = flock.init(params, 7);

    expect(state.agents).toHaveLength(400);
    for (const agent of state.agents) {
      expect(agent.x).toBeGreaterThanOrEqual(0);
      expect(agent.x).toBeLessThan(50);
      expect(agent.y).toBeGreaterThanOrEqual(0);
      expect(agent.y).toBeLessThan(20);
      expect(Math.abs(speedOf(agent) - params.targetSpeed)).toBeLessThan(1e-12);
    }
  });

  it("starts at step 0 with no beacons or obstacles, sized by the world parameters", () => {
    const state = flock.init({ ...flockDefaultParams, worldWidth: 40, worldHeight: 24 }, 7);

    expect(state.stepIndex).toBe(0);
    expect(state.width).toBe(40);
    expect(state.height).toBe(24);
    expect(state.beacons).toEqual([]);
    expect(state.obstacles).toEqual([]);
  });

  it("clamps the starting speed into [minSpeed, maxSpeed]", () => {
    const fast = flock.init({ ...flockDefaultParams, targetSpeed: 6, maxSpeed: 3.6 }, 3);
    const slow = flock.init({ ...flockDefaultParams, targetSpeed: 0.1, minSpeed: 0.45 }, 3);

    for (const agent of fast.agents) expect(Math.abs(speedOf(agent) - 3.6)).toBeLessThan(1e-12);
    for (const agent of slow.agents) expect(Math.abs(speedOf(agent) - 0.45)).toBeLessThan(1e-12);
  });

  it("[R01] is a pure function of its parameters and seed", () => {
    expect(flock.init(flockDefaultParams, 1234)).toEqual(flock.init(flockDefaultParams, 1234));
    expect(flock.init(flockDefaultParams, 1234)).not.toEqual(flock.init(flockDefaultParams, 1235));
  });

  it("rejects seeds that are not unsigned 32-bit integers", () => {
    for (const seed of [-1, 0.5, 2 ** 32]) {
      expect(() => flock.init(flockDefaultParams, seed), String(seed)).toThrow(RangeError);
    }
  });

  it("produces plain JSON that survives a round trip unchanged", () => {
    const state = flock.init(flockDefaultParams, 99);
    expect(JSON.parse(JSON.stringify(state))).toStrictEqual(state);
  });
});
