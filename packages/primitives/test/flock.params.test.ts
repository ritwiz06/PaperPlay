import { describe, expect, it } from "vitest";
import { flockDefaultParams, flockPlanarWeighted } from "../src/index.ts";

const schema = flockPlanarWeighted.paramSchema;
const description = flockPlanarWeighted.describe();
const accepts = (overrides: Record<string, number>): boolean =>
  schema.safeParse({ ...flockDefaultParams, ...overrides }).success;

describe("flock.planar.weighted parameters", () => {
  it("describes exactly the variables its schema accepts", () => {
    expect(Object.keys(description.variables).sort()).toEqual(Object.keys(flockDefaultParams).sort());
  });

  it("accepts its defaults, and each described default matches and lies inside its range", () => {
    expect(schema.safeParse(flockDefaultParams).success).toBe(true);
    for (const [name, variable] of Object.entries(description.variables)) {
      expect(variable.defaultValue, name).toBe(flockDefaultParams[name as keyof typeof flockDefaultParams]);
      expect(variable.defaultValue, name).toBeGreaterThanOrEqual(variable.range[0]);
      expect(variable.defaultValue, name).toBeLessThanOrEqual(variable.range[1]);
    }
  });

  it("accepts the ends of every described range and rejects values just outside them", () => {
    // Widen the speed limits so each end can be probed without tripping minSpeed < maxSpeed.
    const room = { minSpeed: 0.05, maxSpeed: 8 };
    for (const [name, { range, integer }] of Object.entries(description.variables)) {
      const step = integer ? 1 : 1e-9;
      expect(accepts({ ...room, [name]: range[0] }), `${name} at ${range[0]}`).toBe(true);
      expect(accepts({ ...room, [name]: range[1] }), `${name} at ${range[1]}`).toBe(true);
      expect(accepts({ ...room, [name]: range[0] - step }), `${name} below range`).toBe(false);
      expect(accepts({ ...room, [name]: range[1] + step }), `${name} above range`).toBe(false);
    }
  });

  it("requires a whole number of birds", () => {
    expect(accepts({ agentCount: 72.5 })).toBe(false);
  });

  it("requires minSpeed to be below maxSpeed", () => {
    expect(accepts({ minSpeed: 2, maxSpeed: 2 })).toBe(false);
    expect(accepts({ minSpeed: 3, maxSpeed: 2 })).toBe(false);
  });

  it("rejects unknown and missing parameters", () => {
    expect(accepts({ noise: 0.1 })).toBe(false);
    const { alignmentWeight: _alignment, ...missing } = flockDefaultParams;
    expect(schema.safeParse(missing).success).toBe(false);
  });

  it("marks bird count and world size as init-time and every rule as live", () => {
    const initTime = Object.entries(description.variables)
      .filter(([, variable]) => variable.phase === "init")
      .map(([name]) => name)
      .sort();
    expect(initTime).toEqual(["agentCount", "worldHeight", "worldWidth"]);
  });

  it("gives every variable and observable a unit and a meaning", () => {
    for (const [name, entry] of [...Object.entries(description.variables), ...Object.entries(description.observables)]) {
      expect(entry.unit.length, name).toBeGreaterThan(0);
      expect(entry.meaning.length, name).toBeGreaterThan(0);
    }
    expect(description.assumptions.length).toBeGreaterThan(0);
  });

  it("describes exactly the observables that measure returns", () => {
    const observed = flockPlanarWeighted.measure(flockPlanarWeighted.init(flockDefaultParams, 1));
    expect(Object.keys(description.observables).sort()).toEqual(Object.keys(observed).sort());
  });
});
