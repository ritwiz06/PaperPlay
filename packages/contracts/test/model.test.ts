import { describe, expect, it } from "vitest";
import { Expr, MODEL_LIMITS, ModelSpec, TimeUnit } from "../src/index.ts";
import { anchor, issuesOf, placeholder } from "./examples.ts";
import { c, decayChain, infection, n, neg, p, parameter, sirModel, type ModelInput } from "./model-examples.ts";

type Model = ModelInput;

const paths = (value: unknown): string[] => issuesOf(ModelSpec, value).map((issue) => issue.path);

/** The model with recovery's rate, dr/dt, replaced. */
function withRecovery(rate: unknown, model: Model = sirModel()): Model {
  model.equations[2] = { ...model.equations[2], of: "r", rate, anchors: [anchor()] };
  return model;
}

/** `count` nested negations around `inner`: an expression of depth count + 1 when inner is a leaf. */
function nested(count: number, inner: unknown = c("i")): unknown {
  let expr = inner;
  for (let level = 0; level < count; level++) expr = neg(expr);
  return expr;
}

describe("[R03] ModelSpec: a complete model", () => {
  it("accepts a valid SIR model", () => {
    expect(issuesOf(ModelSpec, sirModel())).toEqual([]);
  });

  it("accepts a draft model whose anchors are placeholders", () => {
    const model = sirModel();
    for (const equation of model.equations) equation.anchors = [placeholder()];
    model.parameters[0] = { ...model.parameters[0], anchors: [placeholder()] };
    expect(issuesOf(ModelSpec, model)).toEqual([]);
  });

  it("measures time in one of six units", () => {
    expect(TimeUnit.options).toEqual(["second", "minute", "hour", "day", "week", "year"]);
    expect(issuesOf(ModelSpec, { ...sirModel(), timeUnit: "fortnight" })).toEqual([{ code: "invalid_value", path: "timeUnit" }]);
  });

  it("rejects unknown keys at the top, in a compartment, in a parameter and in the solver", () => {
    expect(issuesOf(ModelSpec, { ...sirModel(), stiff: false })).toEqual([{ code: "unrecognized_keys", path: "" }]);
    const model = sirModel();
    model.compartments[0] = { ...model.compartments[0], colour: "teal" };
    expect(issuesOf(ModelSpec, model)).toEqual([{ code: "unrecognized_keys", path: "compartments.0" }]);
    const other = sirModel();
    other.parameters[1] = { ...other.parameters[1], verified: true };
    expect(issuesOf(ModelSpec, other)).toEqual([{ code: "unrecognized_keys", path: "parameters.1" }]);
    expect(issuesOf(ModelSpec, { ...sirModel(), solver: { dt: 0.1, tolerance: 1e-6, method: "euler" } })).toEqual([{ code: "unrecognized_keys", path: "solver" }]);
  });

  it("needs a positive step and a positive tolerance", () => {
    expect(paths({ ...sirModel(), solver: { dt: 0, tolerance: 1e-6 } })).toEqual(["solver.dt"]);
    expect(paths({ ...sirModel(), solver: { dt: 0.1, tolerance: -1 } })).toEqual(["solver.tolerance"]);
  });

  it("anchors every equation, invariant and steady state", () => {
    const model = sirModel();
    model.equations[0] = { ...model.equations[0], anchors: [] };
    model.invariants[0] = { ...model.invariants[0], anchors: [] };
    model.steadyStates[0] = { ...model.steadyStates[0], anchors: [] };
    expect(issuesOf(ModelSpec, model)).toEqual([
      { code: "too_small", path: "equations.0.anchors" },
      { code: "too_small", path: "invariants.0.anchors" },
      { code: "too_small", path: "steadyStates.0.anchors" },
    ]);
  });

  it("allows a model with no parameters, invariants or steady states, but not one with no observable", () => {
    expect(issuesOf(ModelSpec, decayChain(2))).toEqual([]);
    expect(paths({ ...decayChain(2), observables: [] })).toEqual(["observables"]);
  });
});

describe("[R03] ModelSpec: the expression grammar is closed", () => {
  it("accepts every node shape", () => {
    const leaves = [n(2), p("gamma"), c("i")];
    const shapes = [
      ...leaves,
      { op: "add", args: leaves },
      { op: "mul", args: [n(2), c("i")] },
      ...["sub", "div", "pow"].map((op) => ({ op, a: c("i"), b: n(2) })),
      ...["neg", "exp", "log"].map((op) => ({ op, a: c("i") })),
    ];
    for (const shape of shapes) expect(issuesOf(Expr, shape), JSON.stringify(shape)).toEqual([]);
  });

  it("rejects an unknown operation, wherever it sits", () => {
    for (const op of ["sin", "hill", "eval", "max", "if"]) {
      expect(issuesOf(ModelSpec, withRecovery({ op, a: c("i") })), op).toEqual([{ code: "invalid_union", path: "equations.2.rate" }]);
      expect(issuesOf(ModelSpec, withRecovery({ op: "mul", args: [p("gamma"), { op, a: c("i") }] })), op).toEqual([{ code: "invalid_union", path: "equations.2.rate" }]);
    }
  });

  it("rejects strings to evaluate, time inputs and other values as nodes", () => {
    for (const node of ["gamma * i", { t: true }, { time: 1 }, { n: "1" }, [n(1)], null, 3]) {
      expect(issuesOf(ModelSpec, withRecovery(node)), JSON.stringify(node)).toEqual([{ code: "invalid_union", path: "equations.2.rate" }]);
    }
  });

  it("rejects unknown keys on a node", () => {
    expect(issuesOf(ModelSpec, withRecovery({ op: "mul", args: [p("gamma"), c("i")], unit: "per day" }))).toEqual([{ code: "unrecognized_keys", path: "equations.2.rate" }]);
    expect(issuesOf(ModelSpec, withRecovery({ op: "neg", a: c("i"), b: c("s") }))).toEqual([{ code: "unrecognized_keys", path: "equations.2.rate" }]);
    expect(issuesOf(ModelSpec, withRecovery({ c: "i", p: "gamma" }))).toEqual([{ code: "invalid_union", path: "equations.2.rate" }]);
  });

  it("takes finite numbers only", () => {
    for (const value of [Infinity, -Infinity, Number.NaN]) {
      expect(issuesOf(ModelSpec, withRecovery({ op: "mul", args: [n(value), c("i")] })), String(value)).toEqual([{ code: "invalid_union", path: "equations.2.rate" }]);
    }
  });

  it("gives add and mul at least two arguments", () => {
    expect(issuesOf(ModelSpec, withRecovery({ op: "add", args: [c("i")] }))).toEqual([{ code: "too_small", path: "equations.2.rate.args" }]);
    expect(issuesOf(ModelSpec, withRecovery({ op: "mul", args: [] }))).toEqual([{ code: "too_small", path: "equations.2.rate.args" }]);
  });

  it("names parameters and compartments in camelCase", () => {
    // A badly formed name is also no parameter's name: both issues point at it.
    expect(issuesOf(ModelSpec, withRecovery({ op: "mul", args: [p("Gamma"), c("i")] }))).toEqual([
      { code: "invalid_format", path: "equations.2.rate.args.0.p" },
      { code: "custom", path: "equations.2.rate.args.0.p" },
    ]);
    expect(issuesOf(Expr, p("Gamma"))).toEqual([{ code: "invalid_format", path: "p" }]);
    expect(issuesOf(Expr, c("in-flow"))).toEqual([{ code: "invalid_format", path: "c" }]);
  });
});

describe("[R03] ModelSpec: units", () => {
  it("declares a unit as whole-number exponents from −4 to 4 over six dimensions", () => {
    const withUnit = (unit: unknown): Model => {
      const model = sirModel();
      model.compartments[0] = { ...model.compartments[0], unit };
      return model;
    };
    expect(issuesOf(ModelSpec, withUnit({ people: 1, cells: -1, molecules: 2, length: -3, mass: 4, time: -4 }))).toEqual([]);
    expect(issuesOf(ModelSpec, withUnit({}))).toEqual([]);
    expect(issuesOf(ModelSpec, withUnit({ people: 0 }))).toEqual([{ code: "custom", path: "compartments.0.unit.people" }]);
    expect(issuesOf(ModelSpec, withUnit({ people: 5 }))).toEqual([{ code: "too_big", path: "compartments.0.unit.people" }]);
    expect(issuesOf(ModelSpec, withUnit({ time: -5 }))).toEqual([{ code: "too_small", path: "compartments.0.unit.time" }]);
    expect(issuesOf(ModelSpec, withUnit({ people: 0.5 }))).toEqual([{ code: "invalid_type", path: "compartments.0.unit.people" }]);
    expect(issuesOf(ModelSpec, withUnit({ furlongs: 1 }))).toEqual([{ code: "unrecognized_keys", path: "compartments.0.unit" }]);
    expect(issuesOf(ModelSpec, withUnit("people"))).toEqual([{ code: "invalid_type", path: "compartments.0.unit" }]);
  });
});

describe("[R03] ModelSpec: parameters", () => {
  it("accepts a teaching-choice parameter without anchors", () => {
    const model = sirModel();
    model.parameters[0] = parameter("beta", { unit: { time: -1 }, range: [0, 2], defaultValue: 0.4 });
    expect(issuesOf(ModelSpec, model)).toEqual([]);
  });

  it("rejects a paper-derived parameter without anchors", () => {
    const model = sirModel();
    model.parameters[0] = { ...model.parameters[0], anchors: [] };
    expect(issuesOf(ModelSpec, model)).toEqual([{ code: "custom", path: "parameters.0.anchors" }]);
  });

  it("rejects a range whose minimum is not below its maximum, and a default outside it", () => {
    const model = sirModel();
    model.parameters[1] = { ...model.parameters[1], range: [1, 1], defaultValue: 1 };
    expect(issuesOf(ModelSpec, model)).toEqual([{ code: "custom", path: "parameters.1.range" }]);
    const other = sirModel();
    other.parameters[1] = { ...other.parameters[1], defaultValue: 1.5 };
    expect(issuesOf(ModelSpec, other)).toEqual([{ code: "custom", path: "parameters.1.defaultValue" }]);
  });
});

describe("[R03] ModelSpec: the paper's other value sets", () => {
  it("keeps another set of values by name, setting only the model's parameters", () => {
    const model = { ...sirModel(), alternatives: [{ id: "fitted", label: "values fitted to data", values: { beta: 0.5, seeded: 3 }, anchors: [anchor()] }] };
    expect(issuesOf(ModelSpec, model)).toEqual([]);
    const stray = { ...sirModel(), alternatives: [{ id: "fitted", label: "values fitted to data", values: { nowhere: 1 }, anchors: [] }] };
    expect(issuesOf(ModelSpec, stray)).toEqual([{ code: "custom", path: "alternatives.0.values.nowhere" }]);
    expect(issuesOf(ModelSpec, { ...sirModel(), alternatives: [{ id: "fitted", label: "x", values: {}, anchors: [], extra: 1 }] })).toEqual([{ code: "unrecognized_keys", path: "alternatives.0" }]);
  });
});

describe("[R03] ModelSpec: names", () => {
  it("uses each id once across compartments, parameters and observables", () => {
    const model = sirModel();
    model.parameters.push(parameter("s"));
    model.observables.push({ id: "gamma", label: "Recovery", expr: c("r"), unit: { people: 1 } });
    model.observables.push({ id: "infectious", label: "Again", expr: c("i"), unit: { people: 1 } });
    expect(issuesOf(ModelSpec, model)).toEqual([
      { code: "custom", path: "parameters.4.id" },
      { code: "custom", path: "observables.2.id" },
      { code: "custom", path: "observables.3.id" },
    ]);
  });

  it("gives every compartment exactly one equation, and nothing else one", () => {
    const missing = sirModel();
    missing.equations.pop();
    expect(issuesOf(ModelSpec, missing)).toEqual([{ code: "custom", path: "compartments.2.id" }]);

    const twice = sirModel();
    twice.equations.push({ of: "s", rate: n(0), anchors: [anchor()] });
    expect(issuesOf(ModelSpec, twice)).toEqual([{ code: "custom", path: "equations.3.of" }]);

    const stray = sirModel();
    stray.equations.push({ of: "exposed", rate: n(0), anchors: [anchor()] });
    expect(issuesOf(ModelSpec, stray)).toEqual([{ code: "custom", path: "equations.3.of" }]);
  });

  it("resolves every parameter and compartment an expression names", () => {
    expect(issuesOf(ModelSpec, withRecovery({ op: "mul", args: [p("delta"), c("i")] }))).toEqual([{ code: "custom", path: "equations.2.rate.args.0.p" }]);
    expect(issuesOf(ModelSpec, withRecovery({ op: "mul", args: [p("gamma"), c("exposed")] }))).toEqual([{ code: "custom", path: "equations.2.rate.args.1.c" }]);
    const model = sirModel();
    model.invariants[0] = { ...model.invariants[0], expr: { op: "add", args: [c("s"), c("i"), c("dead")] } };
    expect(issuesOf(ModelSpec, model)).toEqual([{ code: "custom", path: "invariants.0.expr.args.2.c" }]);
  });
});

describe("[R03] ModelSpec: what each expression may read", () => {
  it("makes an initial value of parameters and numbers only", () => {
    const model = sirModel();
    model.compartments[2] = { ...model.compartments[2], initial: { op: "sub", a: p("population"), b: c("s") } };
    expect(issuesOf(ModelSpec, model)).toEqual([{ code: "custom", path: "compartments.2.initial.b.c" }]);
  });

  it("gives a steady state's value for every compartment, from parameters and numbers only", () => {
    const at = (values: Record<string, unknown>): Model => {
      const model = sirModel();
      model.steadyStates[0] = { ...model.steadyStates[0], at: values };
      return model;
    };
    expect(issuesOf(ModelSpec, at({ s: p("population"), i: n(0) }))).toEqual([{ code: "custom", path: "steadyStates.0.at" }]);
    expect(issuesOf(ModelSpec, at({ s: p("population"), i: n(0), r: n(0), exposed: n(0) }))).toEqual([{ code: "custom", path: "steadyStates.0.at.exposed" }]);
    expect(issuesOf(ModelSpec, at({ s: p("population"), i: n(0), r: c("s") }))).toEqual([{ code: "custom", path: "steadyStates.0.at.r.c" }]);
    expect(issuesOf(ModelSpec, at({ s: p("size"), i: n(0), r: n(0) }))).toEqual([{ code: "custom", path: "steadyStates.0.at.s.p" }]);
  });

  it("makes an observable of compartments and numbers only, since measuring sees no parameters", () => {
    const model = sirModel();
    model.observables[1] = { ...model.observables[1], expr: { op: "div", a: c("i"), b: p("population") } };
    expect(issuesOf(ModelSpec, model)).toEqual([{ code: "custom", path: "observables.1.expr.b.p" }]);
  });

  it("lets rates and invariants read both", () => {
    const model = sirModel();
    model.invariants[0] = { ...model.invariants[0], expr: { op: "sub", a: { op: "add", args: [c("s"), c("i"), c("r")] }, b: p("population") } };
    expect(issuesOf(ModelSpec, model)).toEqual([]);
    expect(issuesOf(ModelSpec, withRecovery({ op: "sub", a: infection(), b: c("s") }))).toEqual([]);
  });
});

describe("[R03] ModelSpec: limits", () => {
  it("holds 1 to 24 compartments and at most 32 parameters", () => {
    expect(MODEL_LIMITS).toEqual({ compartments: 24, parameters: 32, nodes: 400, depth: 24 });
    expect(issuesOf(ModelSpec, decayChain(24))).toEqual([]);
    expect(issuesOf(ModelSpec, decayChain(25))).toEqual([{ code: "too_big", path: "compartments" }]);
    expect(paths({ ...decayChain(1), compartments: [], equations: [] })).toEqual(["compartments", "observables.0.expr.c"]);

    const many = (count: number) => ({ ...decayChain(1), parameters: Array.from({ length: count }, (_, index) => parameter(`k${index}`)) });
    expect(issuesOf(ModelSpec, many(32))).toEqual([]);
    expect(issuesOf(ModelSpec, many(33))).toEqual([{ code: "too_big", path: "parameters" }]);
  });

  it("allows 400 nodes in an expression, not 401", () => {
    const sum = (terms: number) => ({ op: "mul", args: [p("gamma"), { op: "add", args: Array.from({ length: terms }, () => c("i")) }] });
    // mul, gamma, add and its terms: terms + 3 nodes.
    expect(issuesOf(ModelSpec, withRecovery(sum(397)))).toEqual([]);
    expect(issuesOf(ModelSpec, withRecovery(sum(398)))).toEqual([{ code: "custom", path: "equations.2.rate" }]);
  });

  it("allows a depth of 24, not 25", () => {
    expect(issuesOf(ModelSpec, withRecovery(nested(23)))).toEqual([]);
    expect(issuesOf(ModelSpec, withRecovery(nested(24)))).toEqual([{ code: "custom", path: "equations.2.rate" }]);
    const deepAdd = (levels: number): unknown => (levels === 1 ? c("i") : { op: "add", args: [c("i"), deepAdd(levels - 1)] });
    expect(issuesOf(ModelSpec, withRecovery(deepAdd(24)))).toEqual([]);
    expect(issuesOf(ModelSpec, withRecovery(deepAdd(25)))).toEqual([{ code: "custom", path: "equations.2.rate" }]);
  });

  it("refuses a hostile tree thousands deep with an issue, never a stack overflow", () => {
    for (const depth of [49, 1000, 100_000]) {
      expect(issuesOf(ModelSpec, withRecovery(nested(depth))), String(depth)).toEqual([{ code: "custom", path: "equations.2.rate" }]);
    }
    expect(issuesOf(Expr, nested(100_000))).toEqual([{ code: "custom", path: "" }]);
  });
});

describe("[R03] ModelSpec: the accuracy check's tolerance", () => {
  it("is at most a thousandth, so no spec can loosen the check until a stiff model passes it", () => {
    expect(paths({ ...sirModel(), solver: { dt: 0.1, tolerance: 1e-3 } })).toEqual([]);
    expect(paths({ ...sirModel(), solver: { dt: 0.1, tolerance: 0.01 } })).toEqual(["solver.tolerance"]);
  });
});
