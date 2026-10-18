import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { landscapeModel, type LandscapeState } from "../src/learning/index.ts";
import { descent, paramsOf } from "./learning.examples.ts";

// learning.landscape@1.0.0 against fixtures/oracles/learning.landscape/, each derived by hand from
// the rules' own equations (ADR-0047): plain descent's closed form and its stability limit,
// momentum's and Nesterov's first steps, momentum's terminal velocity and its stability limit, and
// bit-for-bit replay.

const folder = join(import.meta.dirname, "..", "..", "..", "fixtures", "oracles", "learning.landscape");
const REQUIRED = ["learning.gd.quadratic-closed-form", "learning.gd.stability-limit", "learning.momentum.first-steps", "learning.nesterov.first-steps", "learning.momentum.terminal-velocity", "learning.momentum.stability-limit", "learning.landscape.replay-bitwise"];

const Rule = z.enum(["gd", "momentum", "nesterov"]);
const Surface = z.strictObject({ hx: z.number(), hy: z.number(), cx: z.number(), cy: z.number(), gx: z.number(), gy: z.number() });
const Point = z.tuple([z.number(), z.number()]);
const Head = { oracle: z.literal("oracle/1"), id: z.string(), primitive: z.strictObject({ id: z.literal("learning.landscape"), version: z.literal("1.0.0") }), basis: z.literal("derived"), claim: z.string(), derivation: z.array(z.string()).min(1), rule: Rule, surface: Surface };
const Fixture = z.discriminatedUnion("kind", [
  z.strictObject({ ...Head, kind: z.literal("trajectory"), hyper: z.record(z.string(), z.number()).optional(), start: Point.optional(), expect: z.array(z.strictObject({ step: z.int(), x: z.number().optional(), y: z.number().optional(), v: z.number().optional() })).optional(), cases: z.array(z.strictObject({ hyper: z.record(z.string(), z.number()), start: Point, step: z.int(), y: z.number() })).optional(), relativeTolerance: z.number().positive() }),
  z.strictObject({ ...Head, kind: z.literal("bound"), cases: z.array(z.strictObject({ hyper: z.record(z.string(), z.number()), start: Point, step: z.int(), below: z.number().optional(), above: z.number().optional() })) }),
  z.strictObject({ ...Head, kind: z.literal("replay"), hyper: z.record(z.string(), z.number()), start: Point, steps: z.int(), seeds: z.array(z.int()) }),
]);
type Fixture = z.infer<typeof Fixture>;

const fixtures: Fixture[] = readdirSync(folder)
  .filter((name) => name.endsWith(".json"))
  .map((name) => Fixture.parse(JSON.parse(readFileSync(join(folder, name), "utf8"))));

function runTo(fixture: Fixture, hyper: Readonly<Record<string, number>>, start: readonly [number, number], steps: number, seed = 0): LandscapeState[] {
  const model = landscapeModel(descent(fixture.rule, fixture.surface, start));
  const params = paramsOf(fixture.rule, hyper, start);
  const states = [model.init(params, seed)];
  for (let k = 0; k < steps; k++) states.push(model.step(states[k] as LandscapeState, params, 1));
  return states;
}

const close = (actual: number, expected: number, tolerance: number): boolean => Math.abs(actual - expected) <= tolerance * Math.max(Math.abs(expected), 1e-300);
const bitwiseEqual = (a: unknown, b: unknown): boolean => JSON.stringify(a, (_key, value: unknown) => (typeof value === "number" && Object.is(value, -0) ? "-0" : value)) === JSON.stringify(b, (_key, value: unknown) => (typeof value === "number" && Object.is(value, -0) ? "-0" : value));

describe("[R01] learning.landscape@1.0.0 against its hand-derived oracles", () => {
  it("has every required fixture", () => {
    expect(fixtures.map((fixture) => fixture.id).sort()).toEqual([...REQUIRED].sort());
  });

  for (const fixture of fixtures) {
    it(`${fixture.id}: ${fixture.claim}`, () => {
      if (fixture.kind === "trajectory") {
        for (const point of fixture.expect ?? []) {
          const state = runTo(fixture, fixture.hyper ?? {}, fixture.start ?? [0, 0], point.step).at(-1) as LandscapeState;
          if (point.x !== undefined) expect(close(state.x.theta as number, point.x, fixture.relativeTolerance), `x at step ${point.step}: ${state.x.theta} against ${point.x}`).toBe(true);
          if (point.y !== undefined) expect(close(state.y.theta as number, point.y, fixture.relativeTolerance), `y at step ${point.step}: ${state.y.theta} against ${point.y}`).toBe(true);
          if (point.v !== undefined) expect(close(state.x.v as number, point.v, fixture.relativeTolerance), `v at step ${point.step}: ${state.x.v} against ${point.v}`).toBe(true);
        }
        for (const entry of fixture.cases ?? []) {
          const state = runTo(fixture, entry.hyper, entry.start, entry.step).at(-1) as LandscapeState;
          expect(close(state.y.theta as number, entry.y, fixture.relativeTolerance), `y at step ${entry.step}: ${state.y.theta} against ${entry.y}`).toBe(true);
        }
      } else if (fixture.kind === "bound") {
        for (const entry of fixture.cases) {
          const size = Math.abs((runTo(fixture, entry.hyper, entry.start, entry.step).at(-1) as LandscapeState).x.theta as number);
          if (entry.below !== undefined) expect(size).toBeLessThan(entry.below);
          if (entry.above !== undefined) expect(size).toBeGreaterThan(entry.above);
        }
      } else {
        const runs = fixture.seeds.map((seed) => runTo(fixture, fixture.hyper, fixture.start, fixture.steps, seed));
        for (const run of runs.slice(1)) expect(bitwiseEqual(run, runs[0])).toBe(true);
        // A state read back from JSON runs on exactly as the original does.
        const model = landscapeModel(descent(fixture.rule, fixture.surface, fixture.start));
        const params = paramsOf(fixture.rule, fixture.hyper, fixture.start);
        const middle = runs[0]?.[150] as LandscapeState;
        const reread = model.stateSchema.parse(JSON.parse(JSON.stringify(middle)));
        let a = middle;
        let b = reread;
        for (let k = 0; k < 150; k++) {
          a = model.step(a, params, 1);
          b = model.step(b, params, 1);
        }
        expect(bitwiseEqual(a, b)).toBe(true);
        expect(bitwiseEqual(a, runs[0]?.[300])).toBe(true);
      }
    });
  }
});
