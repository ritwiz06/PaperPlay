import { describe, expect, it } from "vitest";
import { createRegistry, registry } from "../src/index.ts";
import { flockPlanarWeighted } from "../src/agents/flock/index.ts";

describe("primitive registry", () => {
  it("holds flock.planar.weighted at version 3.1.0", () => {
    const ref = { id: "flock.planar.weighted", version: "3.1.0" };

    expect(registry.has(ref)).toBe(true);
    expect(registry.get(ref)).toBe(flockPlanarWeighted);
    expect(registry.list()).toEqual([ref]);
  });

  it("matches ids and versions exactly", () => {
    expect(registry.has({ id: "flock.planar.weighted", version: "2.0.0" })).toBe(false);
    expect(registry.has({ id: "flock.planar", version: "3.1.0" })).toBe(false);
    expect(registry.get({ id: "flock.planar.weighted", version: "2.1.1" })).toBeUndefined();
  });

  it("refuses to register the same id and version twice", () => {
    expect(() => createRegistry([flockPlanarWeighted, flockPlanarWeighted])).toThrow(/already registered/);
  });
});
