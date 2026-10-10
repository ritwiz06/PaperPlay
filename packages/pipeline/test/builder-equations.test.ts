import type { Expr, ModelSpec } from "@paperplay/contracts";
import { registry } from "@paperplay/primitives";
import { describe, expect, it } from "vitest";
import { exploration, level, manifest, worldSpec } from "../../contracts/test/examples.ts";
import { buildWorld, type BuildResult } from "../src/index.ts";

// The builder on a model given as data (ADR-0028): the solver binds it, the family's checks run on
// both worlds of every fork, and what a check finds wrong is refused, never drawn. The world is
// synthetic, SIR in shares, not any paper's.

const c = (id: string): Expr => ({ c: id });
const p = (id: string): Expr => ({ p: id });
const infection: Expr = { op: "mul", args: [p("beta"), c("s"), c("i")] };
const placeholders = [{ placeholder: true as const, sourceId: "example2026", need: "None: a synthetic model for the builder's tests." }];

function sir(overrides: Partial<ModelSpec> = {}): ModelSpec {
  return {
    timeUnit: "day",
    compartments: [
      { id: "s", name: "Susceptible", unit: {}, initial: { op: "sub", a: { n: 1 }, b: p("seeded") }, nonNegative: true, anchors: [] },
      { id: "i", name: "Infectious", unit: {}, initial: p("seeded"), nonNegative: true, anchors: [] },
      { id: "r", name: "Removed", unit: {}, initial: { n: 0 }, nonNegative: true, anchors: [] },
    ],
    parameters: [
      { id: "beta", symbol: "β", name: "Infection rate", unit: { time: -1 }, range: [0, 2], defaultValue: 0.4, origin: "teaching-choice", anchors: [] },
      { id: "gamma", symbol: "γ", name: "Removal rate", unit: { time: -1 }, range: [0.01, 1], defaultValue: 0.2, origin: "teaching-choice", anchors: [] },
      { id: "seeded", symbol: "i₀", name: "Share infectious at the start", unit: {}, range: [0, 0.1], defaultValue: 0.01, origin: "teaching-choice", anchors: [] },
    ],
    equations: [
      { of: "s", rate: { op: "neg", a: infection }, anchors: placeholders },
      { of: "i", rate: { op: "sub", a: infection, b: { op: "mul", args: [p("gamma"), c("i")] } }, anchors: placeholders },
      { of: "r", rate: { op: "mul", args: [p("gamma"), c("i")] }, anchors: placeholders },
    ],
    invariants: [{ kind: "conserved", expr: { op: "add", args: [c("s"), c("i"), c("r")] }, anchors: placeholders }],
    steadyStates: [],
    observables: [{ id: "infectious", label: "Share infectious", expr: c("i"), unit: {} }],
    solver: { dt: 0.1, tolerance: 1e-6 },
    ...overrides,
  };
}

const binding = (model: ModelSpec = sir()) => ({ type: "equations", solver: { id: "compartments.ode", version: "1.0.0" }, model, params: {}, perWatchSecond: 6 });

/** One level of the synthetic world: its control the infection rate, its What-if a removal twice as fast. */
function sirLevel(id: string, order: number, kind: string, model?: ModelSpec) {
  const base = level(id, order, kind);
  return {
    ...base,
    binding: binding(model),
    manipulable: { ...base.manipulable, actionId: "infection-rate", targetVariable: "beta", range: [0, 2], unit: "per day", defaultValue: 0.4, origin: "teaching-choice", anchors: [] },
    observable: { ...base.observable, metricId: "infectious", unit: "dimensionless" },
    counterfactual: {
      ...base.counterfactual,
      altParams: { gamma: 0.4 },
      difference: { metricId: "infectious", label: "Share infectious at day 30", unit: "dimensionless", summary: { kind: "at", time: 30 }, time: 60, claim: { kind: "each", relation: "lower", by: 0.01 } },
    },
    guidedExploration: { ...exploration(), interveneActionId: "infection-rate", observeMetricId: "infectious" },
  };
}

function world(model?: ModelSpec, kit = "valley") {
  const example = worldSpec();
  return {
    ...example,
    schemaVersion: "worldspec/3",
    // A draft, since its model's anchors are placeholders.
    status: "draft",
    source: manifest(),
    routing: { tier: "A", family: "compartments", reason: "A synthetic SIR model, which the compartment family solves as equations.", primitive: { status: "released" } },
    design: { ...example.design, world: kit },
    timeUnit: "day",
    openingSeed: 0,
    levels: [sirLevel("hook", 1, "hook", model), sirLevel("idea", 2, "idea", model), sirLevel("result", 3, "result", model)],
    primitivesUsed: [{ id: "compartments.ode", version: "1.0.0" }],
    limits: [{ text: "A synthetic world.", origin: "teaching-choice", anchors: [] }],
    limitations: undefined,
  };
}

const pathsOf = (result: BuildResult): string[] => (result.ok ? [] : result.problems.map((problem) => problem.path));
const messagesOf = (result: BuildResult): string[] => (result.ok ? [] : result.problems.map((problem) => problem.message));
const { limitations: _limitations, ...noLimitations } = world();

describe("[R08] the builder on a model given as data", () => {
  it("binds the model with its solver and runs the family's checks; the valley, which draws only agents, is the one problem", () => {
    const result = buildWorld(noLimitations, registry);
    expect(pathsOf(result)).toEqual(["design.world"]);
    expect(messagesOf(result)[0]).toMatch(/draws agents on torus2d, not compartments on none/);
  });

  it("builds on the town kit, every fork telling the run from its start though its What-if changes only a live rate", () => {
    const { limitations: _drop, ...spec } = world(undefined, "town");
    const result = buildWorld(spec, registry);
    if (!result.ok) throw new Error(JSON.stringify(result.problems));
    for (const level of result.world.levels) {
      expect(level.fork.overrides.map((override) => override.phase)).toEqual(["live"]);
      expect(level.fork.restarts).toBe(true);
    }
  });

  it("refuses a model whose units disagree, naming the solver's reason", () => {
    const wrong = sir({ equations: [...sir().equations.slice(0, 2), { of: "r", rate: c("i"), anchors: placeholders }] });
    const { limitations: _drop, ...spec } = world(wrong);
    const result = buildWorld(spec, registry);
    expect(pathsOf(result)).toEqual(["levels.0.binding.model", "levels.1.binding.model", "levels.2.binding.model"]);
    expect(messagesOf(result)[0]).toMatch(/units disagree/);
  });

  it("refuses a stiff model, whose run changes when the step is halved, rather than drawing it wrong", () => {
    // Removal at 40 a day with a step of a tenth of a day: RK4 is unstable there.
    const stiff = sir({ parameters: sir().parameters.map((parameter) => (parameter.id === "gamma" ? { ...parameter, range: [0.01, 80] as [number, number], defaultValue: 40 } : parameter)) });
    const { limitations: _drop, ...spec } = world(stiff);
    const result = buildWorld(spec, registry);
    expect(pathsOf(result)).toContain("levels.0.binding.model");
    expect(messagesOf(result).find((message) => message.includes("too coarse"))).toMatch(/^In this world: /);
  });

  it("refuses a solver the registry does not hold", () => {
    const { limitations: _drop, ...spec } = world();
    const unknown = { ...spec, levels: spec.levels.map((entry) => ({ ...entry, binding: { ...entry.binding, solver: { id: "compartments.ode", version: "9.0.0" } } })) };
    expect(pathsOf(buildWorld({ ...unknown, primitivesUsed: [{ id: "compartments.ode", version: "9.0.0" }] }, registry))).toEqual(["levels.0.binding.solver", "levels.1.binding.solver", "levels.2.binding.solver"]);
  });
});
