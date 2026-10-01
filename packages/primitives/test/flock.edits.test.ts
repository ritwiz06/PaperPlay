import { describe, expect, it } from "vitest";
import { flockDefaultParams, flockPlanarWeighted, type FlockState } from "../src/index.ts";

const flock = flockPlanarWeighted;

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const start = (): FlockState => ({
  ...flock.init(flockDefaultParams, 5),
  beacons: [{ id: "beacon-a", x: 4, y: 4 }],
  obstacles: [{ id: "rock-a", x: 20, y: 20 }],
});

describe("flock.planar.weighted world edits", () => {
  it("places a named beacon or obstacle at the end of its list, leaving birds and step alone", () => {
    const state = start();
    const withBeacon = flock.apply(state, { kind: "place", entityId: "beacon-b", entity: "beacon", x: 10, y: 12 });
    const withRock = flock.apply(withBeacon, { kind: "place", entityId: "rock-b", entity: "obstacle", x: 1, y: 2 });

    expect(withRock.beacons).toEqual([
      { id: "beacon-a", x: 4, y: 4 },
      { id: "beacon-b", x: 10, y: 12 },
    ]);
    expect(withRock.obstacles).toEqual([
      { id: "rock-a", x: 20, y: 20 },
      { id: "rock-b", x: 1, y: 2 },
    ]);
    expect(withRock.agents).toBe(state.agents);
    expect(withRock.stepIndex).toBe(state.stepIndex);
  });

  it("wraps a placement onto the torus", () => {
    const placed = flock.apply(start(), { kind: "place", entityId: "beacon-b", entity: "beacon", x: 33, y: -2 });
    expect(placed.beacons[1]).toEqual({ id: "beacon-b", x: 1, y: 30 });
  });

  it("removes a named entity from whichever list holds it", () => {
    const withoutRock = flock.apply(start(), { kind: "remove", entityId: "rock-a" });
    expect(withoutRock.obstacles).toEqual([]);
    expect(withoutRock.beacons).toEqual([{ id: "beacon-a", x: 4, y: 4 }]);

    const withoutBeacon = flock.apply(start(), { kind: "remove", entityId: "beacon-a" });
    expect(withoutBeacon.beacons).toEqual([]);
    expect(withoutBeacon.obstacles).toEqual([{ id: "rock-a", x: 20, y: 20 }]);
  });

  it("does not mutate the state it is given", () => {
    const state = deepFreeze(start());
    const before = JSON.stringify(state);

    flock.apply(state, { kind: "place", entityId: "beacon-b", entity: "beacon", x: 1, y: 1 });
    flock.apply(state, { kind: "remove", entityId: "beacon-a" });

    expect(JSON.stringify(state)).toBe(before);
  });

  it("refuses to place an id that already names an entity, or to remove one that does not exist", () => {
    expect(() => flock.apply(start(), { kind: "place", entityId: "rock-a", entity: "beacon", x: 1, y: 1 })).toThrow(
      /already/,
    );
    expect(() => flock.apply(start(), { kind: "remove", entityId: "ghost" })).toThrow(/no entity/);
  });

  it("refuses coordinates that are not finite", () => {
    for (const x of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => flock.apply(start(), { kind: "place", entityId: "beacon-b", entity: "beacon", x, y: 1 })).toThrow(
        RangeError,
      );
    }
  });
});

describe("flock.planar.weighted state schema", () => {
  it("accepts the states that init, step and apply produce", () => {
    let state = start();
    expect(flock.stateSchema.safeParse(state).success).toBe(true);
    for (let t = 0; t < 30; t++) state = flock.step(state, flockDefaultParams, flock.fixedTimestep);
    expect(flock.stateSchema.safeParse(state).success).toBe(true);
    expect(flock.stateSchema.safeParse(JSON.parse(JSON.stringify(state))).success).toBe(true);
  });

  it("rejects points outside the torus, entity ids used twice, and unknown keys", () => {
    const outside = { ...start(), beacons: [{ id: "beacon-a", x: 32, y: 4 }] };
    const reused = { ...start(), beacons: [{ id: "shared", x: 1, y: 1 }], obstacles: [{ id: "shared", x: 2, y: 2 }] };
    const unnamed = { ...start(), beacons: [{ x: 1, y: 1 }] };
    const extra = { ...start(), wind: 0.4 };

    for (const bad of [outside, reused, unnamed, extra]) expect(flock.stateSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a flock of fewer than two birds", () => {
    const [first] = start().agents;
    expect(flock.stateSchema.safeParse({ ...start(), agents: [first] }).success).toBe(false);
  });
});
