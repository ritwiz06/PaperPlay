import { describe, expect, it } from "vitest";
import { registry } from "../src/index.ts";
import { sirShares } from "./compartments.examples.ts";

describe("[R01] compartments.ode in the registry", () => {
  it("is a solver, not a primitive: it binds a model, given as data, into the primitive that runs it", () => {
    const ref = { id: "compartments.ode", version: "1.0.0" };
    expect(registry.solvers()).toEqual([ref]);
    expect(registry.has(ref)).toBe(false);
    const solver = registry.solver(ref);
    if (!solver) throw new Error("no solver");
    const model = solver.bind(sirShares(), { perWatchSecond: 6 });
    expect([model.id, model.version, model.family]).toEqual(["compartments.ode", "1.0.0", "compartments"]);
    expect(model.time).toEqual({ unit: "day", perWatchSecond: 6 });
    expect(model.space).toEqual({ kind: "none" });
    expect(model.entities).toBeUndefined();
    expect("apply" in model).toBe(false);
  });

  it("refuses to show a model at no speed at all", () => {
    expect(() => registry.solver({ id: "compartments.ode", version: "1.0.0" })?.bind(sirShares(), { perWatchSecond: 0 })).toThrow(RangeError);
  });

  it("matches versions exactly, like every primitive", () => {
    expect(registry.solver({ id: "compartments.ode", version: "1.0.1" })).toBeUndefined();
  });
});
