import { FAMILIES } from "@paperplay/contracts";
import { describe, expect, it } from "vitest";
import { flockAtRocks, flockDefaultParams, flockHeadings, flockNeighbours, flockPlanarWeighted as flock, flockSpread } from "../src/agents/flock/index.ts";
import { registry } from "../src/index.ts";

describe("[R01] every registered primitive describes its family, time and space", () => {
  for (const ref of registry.list()) {
    const primitive = registry.get(ref);
    it(`${ref.id}@${ref.version} belongs to a catalogued family, counts its steps in a time unit, and sizes its space by its own start-up variables`, () => {
      if (!primitive) throw new Error(`the registry lists ${ref.id} but holds nothing under it`);
      expect(FAMILIES[primitive.family]).toBeDefined();
      expect(primitive.fixedTimestep).toBeGreaterThan(0);
      expect(primitive.time.perWatchSecond).toBeGreaterThan(0);
      const { variables } = primitive.describe();
      if (primitive.space.kind === "torus2d") {
        for (const name of [primitive.space.width, primitive.space.height]) expect(variables[name]?.phase, name).toBe("init");
      }
      // A primitive that lets a learner place things says what each kind is, and can apply it.
      expect(primitive.entities === undefined).toBe(primitive.apply === undefined);
    });
  }
});

describe("[R01] the flock as a member of the agents family", () => {
  it("is an agents model in seconds, watched at the wall clock's pace, on a torus of worldWidth by worldHeight", () => {
    expect(flock.family).toBe("agents");
    expect(flock.time).toEqual({ unit: "second", perWatchSecond: 1 });
    expect(flock.space).toEqual({ kind: "torus2d", width: "worldWidth", height: "worldHeight" });
    expect(Object.keys(flock.entities)).toEqual(["beacon", "obstacle"]);
  });

  it("names its read-only queries Q1 to Q4, which answer exactly as the module's own functions do", () => {
    const state = flock.apply(flock.init(flockDefaultParams, 5), { kind: "place", entityId: "rock-1", entity: "obstacle", x: 16, y: 16 });
    expect(Object.keys(flock.queries)).toEqual(["neighbours", "headings", "spread", "atRocks"]);
    expect(flock.queries.neighbours).toBe(flockNeighbours);
    expect(flock.queries.headings).toBe(flockHeadings);
    expect(flock.queries.atRocks).toBe(flockAtRocks);
    expect(flock.queries.spread(state)).toEqual(flockSpread(state));
  });

  it("is frozen, its new descriptions included", () => {
    for (const part of [flock, flock.time, flock.space, flock.entities, flock.queries]) expect(Object.isFrozen(part)).toBe(true);
  });
});
