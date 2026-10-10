import { describe, expect, it } from "vitest";
import { flockDefaultParams, flockPlanarWeighted, type FlockState } from "../src/agents/flock/index.ts";

const flock = flockPlanarWeighted;
const dt = 1 / 60;

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

describe("[R01] flock.planar.weighted step", () => {
  it("does not mutate the state it is given", () => {
    const state = deepFreeze(
      { ...flock.init(flockDefaultParams, 3), beacons: [{ id: "beacon-a", x: 5, y: 5 }], obstacles: [{ id: "rock-a", x: 20, y: 20 }] },
    );
    const before = JSON.stringify(state);

    const next = flock.step(state, flockDefaultParams, dt);

    expect(JSON.stringify(state)).toBe(before);
    expect(next).not.toBe(state);
    expect(next.agents).not.toBe(state.agents);
  });

  it("advances stepIndex by one and carries the world and its beacons and obstacles forward", () => {
    const state: FlockState = {
      ...flock.init(flockDefaultParams, 3),
      beacons: [{ id: "beacon-a", x: 5, y: 5 }],
      obstacles: [{ id: "rock-a", x: 20, y: 20 }],
    };

    const next = flock.step(state, flockDefaultParams, dt);

    expect(next.stepIndex).toBe(1);
    expect(next.width).toBe(state.width);
    expect(next.height).toBe(state.height);
    expect(next.beacons).toEqual([{ id: "beacon-a", x: 5, y: 5 }]);
    expect(next.obstacles).toEqual([{ id: "rock-a", x: 20, y: 20 }]);
    expect(next.agents).toHaveLength(state.agents.length);
  });

  it("rejects a timestep outside (0, 0.05] seconds", () => {
    const state = flock.init(flockDefaultParams, 3);
    for (const bad of [0, -dt, Number.NaN, 0.051, Number.POSITIVE_INFINITY]) {
      expect(() => flock.step(state, flockDefaultParams, bad), String(bad)).toThrow(RangeError);
    }
    expect(() => flock.step(state, flockDefaultParams, 0.05)).not.toThrow();
  });

  it("keeps a bird's heading at minSpeed when its velocity update cancels exactly", () => {
    // Beacon pull (−16, 0) over Δt = 1/32 removes exactly the bird's velocity (0.5, 0) (E6, E9).
    const params = {
      ...flockDefaultParams,
      separationWeight: 0,
      alignmentWeight: 0,
      cohesionWeight: 0,
      beaconWeight: 4,
      targetSpeed: 3.5,
      maxAcceleration: 50,
    };
    const state: FlockState = {
      width: 32,
      height: 32,
      stepIndex: 0,
      agents: [
        { x: 10, y: 10, vx: 0.5, vy: 0 },
        { x: 25, y: 25, vx: 0, vy: 1 },
      ],
      beacons: [{ id: "beacon-a", x: 0, y: 10 }],
      obstacles: [],
    };

    const [bird] = flock.step(state, params, 1 / 32).agents;

    expect(bird).toEqual({ x: 10 + 0.45 / 32, y: 10, vx: 0.45, vy: 0 });
  });

  it("keeps every bird inside the torus, finite and within the speed limits over a long run", () => {
    const params = flockDefaultParams;
    let state: FlockState = { ...flock.init(params, 21), beacons: [{ id: "beacon-a", x: 16, y: 16 }], obstacles: [{ id: "rock-a", x: 8, y: 24 }] };
    for (let t = 0; t < 1200; t++) {
      state = flock.step(state, params, dt);
      for (const agent of state.agents) {
        const speed = Math.sqrt(agent.vx * agent.vx + agent.vy * agent.vy);
        expect(agent.x >= 0 && agent.x < state.width && agent.y >= 0 && agent.y < state.height).toBe(true);
        expect(speed).toBeGreaterThanOrEqual(params.minSpeed - 1e-12);
        expect(speed).toBeLessThanOrEqual(params.maxSpeed + 1e-12);
      }
    }
  });
});
