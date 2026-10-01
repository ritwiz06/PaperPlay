import { describe, expect, it } from "vitest";
import { flockDefaultParams, flockPlanarWeighted, type FlockState } from "../src/index.ts";

const flock = flockPlanarWeighted;
const dt = flock.fixedTimestep;

/** Every number in both states is the same IEEE-754 value (Object.is), not merely close. */
function bitwiseEqual(a: FlockState, b: FlockState): boolean {
  const numbers = (s: FlockState) => [
    s.width,
    s.height,
    s.stepIndex,
    ...s.agents.flatMap((agent) => [agent.x, agent.y, agent.vx, agent.vy]),
    ...s.beacons.flatMap((p) => [p.x, p.y]),
    ...s.obstacles.flatMap((p) => [p.x, p.y]),
  ];
  const [left, right] = [numbers(a), numbers(b)];
  return left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
}

function run(start: FlockState, steps: number): FlockState {
  let state = start;
  for (let t = 0; t < steps; t++) state = flock.step(state, flockDefaultParams, dt);
  return state;
}

describe("[R01] flock.planar.weighted determinism", () => {
  it("runs at a fixed 1/60 s timestep", () => {
    expect(dt).toBe(1 / 60);
  });

  it("replays bit for bit from a JSON round trip of its initial state", () => {
    const start: FlockState = { ...flock.init(flockDefaultParams, 99), beacons: [{ id: "beacon-a", x: 3, y: 29 }], obstacles: [{ id: "rock-a", x: 16, y: 16 }] };
    const restored = JSON.parse(JSON.stringify(start)) as FlockState;

    expect(bitwiseEqual(run(start, 600), run(restored, 600))).toBe(true);
  });

  it("gives different flocks for different seeds", () => {
    const [a, b] = [flock.init(flockDefaultParams, 1), flock.init(flockDefaultParams, 2)];
    expect(bitwiseEqual(a, b)).toBe(false);
    expect(bitwiseEqual(run(a, 60), run(b, 60))).toBe(false);
  });
});
