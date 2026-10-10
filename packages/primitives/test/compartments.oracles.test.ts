// Runs the hand-derived oracle fixtures in fixtures/oracles/compartments.ode/.
// The expected behaviour lives in the fixtures (derived from MODEL.md); this harness
// only drives the public API and compares. It shares no helpers with src/.
import { readdirSync, readFileSync } from "node:fs";
import { ModelSpec } from "@paperplay/contracts";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { accuracy, compartmentModel, conservation, steadyStates, type CompartmentModel, type CompartmentParams, type CompartmentState } from "../src/compartments/index.ts";

const FIXTURES = new URL("../../../fixtures/oracles/compartments.ode/", import.meta.url);
const REQUIRED = [
  "compartments.decay.rk4-steps",
  "compartments.growth.rk4-steps",
  "compartments.logistic.exact-solution",
  "compartments.sir.conserves-total",
  "compartments.sir.final-size",
  "compartments.stiff-decay.refused",
  "compartments.replay.bitwise",
];

const Num = z.number();
const Path = z.array(z.union([z.string(), z.int()]));
const common = {
  oracle: z.literal("oracle/1"),
  id: z.string().min(1),
  primitive: z.strictObject({ id: z.literal("compartments.ode"), version: z.literal("1.0.0") }),
  basis: z.enum(["derived", "expected-qualitative"]),
  claim: z.string().min(1),
  derivation: z.array(z.string().min(1)).min(1),
  /** Each fixture embeds its own small model, as the contract defines one. */
  model: ModelSpec,
  params: z.record(z.string(), Num),
};
const Fixture = z.discriminatedUnion("kind", [
  z.strictObject({
    ...common,
    kind: z.literal("trajectory"),
    checkpoints: z
      .array(z.strictObject({ step: z.int().nonnegative(), compartment: z.string().min(1), against: z.enum(["rk4", "exact"]), value: Num, tolerance: Num.nonnegative() }))
      .min(1),
  }),
  z.strictObject({
    ...common,
    kind: z.literal("conserved-invariant"),
    steps: z.int().positive(),
    weights: z.record(z.string(), Num),
    value: Num,
    tolerance: Num.nonnegative(),
    method: z.enum(["symbolic", "numeric"]),
  }),
  z.strictObject({ ...common, kind: z.literal("accuracy-verdict"), steps: z.int().positive(), verdict: z.enum(["accepted", "refused"]), path: Path.optional() }),
  z.strictObject({ ...common, kind: z.literal("steady-states"), problems: z.array(z.strictObject({ path: Path })) }),
  z.strictObject({
    ...common,
    kind: z.literal("replay"),
    steps: z.int().positive(),
    events: z.array(z.strictObject({ step: z.int().nonnegative(), variable: z.string().min(1), value: Num })).min(1),
  }),
]);
type Fixture = z.infer<typeof Fixture>;
type Of<K extends Fixture["kind"]> = Extract<Fixture, { kind: K }>;

const fixtures: Fixture[] = readdirSync(FIXTURES)
  .filter((file) => file.endsWith(".json"))
  .sort()
  .map((file) => Fixture.parse(JSON.parse(readFileSync(new URL(file, FIXTURES), "utf8"))));

/** The model and its parameters, every parameter given and inside its range. */
function setUp(f: Fixture): { model: CompartmentModel; params: CompartmentParams } {
  const model = compartmentModel(f.model);
  return { model, params: model.paramSchema.parse(f.params) };
}

function runTrajectory(f: Of<"trajectory">): void {
  const { model, params } = setUp(f);
  const last = Math.max(...f.checkpoints.map((checkpoint) => checkpoint.step));
  const misses: string[] = [];
  let state: CompartmentState = model.init(params, 0);
  for (let step = 0; step <= last; step++) {
    for (const checkpoint of f.checkpoints.filter((candidate) => candidate.step === step)) {
      const value = state.compartments[checkpoint.compartment] ?? Number.NaN;
      if (!(Math.abs(value - checkpoint.value) <= checkpoint.tolerance)) {
        misses.push(`step ${step} ${checkpoint.compartment} (${checkpoint.against}): ${value} vs ${checkpoint.value}, off by ${Math.abs(value - checkpoint.value)} > ${checkpoint.tolerance}`);
      }
    }
    if (step < last) state = model.step(state, params, model.fixedTimestep);
  }
  expect(misses).toEqual([]);
}

function runConservedInvariant(f: Of<"conserved-invariant">): void {
  const { model, params } = setUp(f);
  const total = (state: CompartmentState): number => Object.entries(f.weights).reduce((sum, [id, weight]) => sum + weight * (state.compartments[id] ?? Number.NaN), 0);
  let state = model.init(params, 0);
  let worst = Math.abs(total(state) - f.value);
  for (let step = 1; step <= f.steps; step++) {
    state = model.step(state, params, model.fixedTimestep);
    worst = Math.max(worst, Math.abs(total(state) - f.value));
  }
  expect(worst).toBeLessThanOrEqual(f.tolerance);

  const report = conservation(f.model, model, params, f.steps);
  expect(report.problems).toEqual([]);
  expect(report.invariants.map((invariant) => invariant.method)).toEqual([f.method]);
}

function runAccuracyVerdict(f: Of<"accuracy-verdict">): void {
  const { model, params } = setUp(f);
  const problems = accuracy(model, params, f.steps);
  if (f.verdict === "accepted") return void expect(problems).toEqual([]);
  expect(problems.map((problem) => ({ check: problem.check, path: problem.path }))).toEqual([{ check: "accuracy", path: f.path }]);
  // The honest refusal says why, and that the model will not be drawn.
  expect(problems[0]?.message).toMatch(/too coarse/);
  expect(problems[0]?.message).toMatch(/stiff or unstable/);
  expect(problems[0]?.message).toMatch(/will not draw it/);
}

function runSteadyStates(f: Of<"steady-states">): void {
  const { model, params } = setUp(f);
  const problems = steadyStates(f.model, model, params);
  expect(problems.map((problem) => ({ check: problem.check, path: problem.path }))).toEqual(f.problems.map((problem) => ({ check: "steady-state", path: problem.path })));
}

function runReplay(f: Of<"replay">): void {
  const { model, params: start } = setUp(f);
  const trace = (events: Of<"replay">["events"]): number[][] => {
    let params = start;
    let state = model.init(params, 0);
    const rows: number[][] = [Object.values(model.measure(state))];
    for (let step = 0; step < f.steps; step++) {
      for (const event of events.filter((candidate) => candidate.step === step)) params = model.paramSchema.parse({ ...params, [event.variable]: event.value });
      state = model.step(state, params, model.fixedTimestep);
      rows.push(Object.values(model.measure(state)));
    }
    return rows;
  };

  const first = trace(f.events);
  const second = trace(f.events);
  const differing = first.flatMap((row, t) => row.filter((value, k) => !Object.is(value, second[t]?.[k])).map(() => t));
  expect(first).toHaveLength(f.steps + 1);
  expect(differing).toEqual([]);
  // The events must actually change the run, or the replay check would prove nothing.
  expect(trace([])).not.toEqual(first);
}

describe("[R01] compartments.ode oracle fixtures", () => {
  it("includes every required oracle, each id once", () => {
    const ids = fixtures.map((f) => f.id);
    for (const id of REQUIRED) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names the primitive each fixture's model runs as", () => {
    for (const f of fixtures) {
      const { model } = setUp(f);
      expect({ id: model.id, version: model.version }, f.id).toEqual(f.primitive);
    }
  });

  for (const f of fixtures) {
    const label = `${f.id}: ${f.claim}${f.basis === "expected-qualitative" ? " (expected, not derived)" : ""}`;
    it(label, () => {
      switch (f.kind) {
        case "trajectory":
          return runTrajectory(f);
        case "conserved-invariant":
          return runConservedInvariant(f);
        case "accuracy-verdict":
          return runAccuracyVerdict(f);
        case "steady-states":
          return runSteadyStates(f);
        case "replay":
          return runReplay(f);
      }
    });
  }
});
