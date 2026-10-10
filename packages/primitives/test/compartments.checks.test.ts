import type { ModelSpec } from "@paperplay/contracts";
import { describe, expect, it } from "vitest";
import { accuracy, compartmentModel, conservation, positivity, steadyStates } from "../src/compartments/index.ts";
import { add, c, compartment, decay, defaults, exp, log, model, mul, n, neg, p, parameter, pow, sirPeople, sirShares } from "./compartments.examples.ts";

/** dx/dt = −ω y, dy/dt = ω x from (1, 0), whose invariant x² + y² is not linear. */
const rotation = (dt: number): ModelSpec =>
  model({
    compartments: [compartment("x", {}, n(1), "x", false), compartment("y", {}, n(0), "y", false)],
    parameters: [parameter("omega", { time: -1 }, [0, 2], 1, "ω", "Turning rate")],
    rates: { x: neg(mul(p("omega"), c("y"))), y: mul(p("omega"), c("x")) },
    invariants: [add(pow(c("x"), n(2)), pow(c("y"), n(2)))],
    dt,
  });

/** A stated steady state in place of the model's own. */
const withSteadyState = (spec: ModelSpec, at: ModelSpec["steadyStates"][number]["at"]): ModelSpec => ({
  ...spec,
  steadyStates: [{ label: "A stated steady state", at, anchors: spec.equations[0]?.anchors ?? [] }],
});

describe("[R01] compartments.ode checks: accuracy (MODEL.md C1)", () => {
  it("passes SIR at its declared step", () => {
    const spec = sirPeople();
    expect(accuracy(compartmentModel(spec), defaults(spec), 1000)).toEqual([]);
  });

  it("refuses a stiff decay honestly, naming the compartment, the time and the size", () => {
    const spec = decay(1000, 0.01, "second");
    const problems = accuracy(compartmentModel(spec), defaults(spec), 10);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.check).toBe("accuracy");
    expect(problems[0]?.path).toEqual(["compartments", 0]);
    expect(problems[0]?.message).toMatch(/^Halving the solver's step from 0\.01 seconds to 0\.005 seconds moves Drug \(x\) by 4\.2995e27 molecules at 0\.1 seconds/);
    expect(problems[0]?.message).toMatch(/too coarse for this model, which is stiff or unstable at a step of 0\.01 seconds, so PaperPlay will not draw it\.$/);
  });

  it("holds a model to its own tolerance: what passes at 10⁻⁶ fails at 10⁻⁹", () => {
    const spec = decay(0.5, 0.1);
    expect(accuracy(compartmentModel(spec), defaults(spec), 20)).toEqual([]);
    const strict = { ...spec, solver: { dt: 0.1, tolerance: 1e-9 } };
    expect(accuracy(compartmentModel(strict), defaults(strict), 20).map((problem) => problem.path)).toEqual([["compartments", 0]]);
  });

  it("refuses a run that stops being finite, saying where it broke down", () => {
    const spec = model({ compartments: [compartment("x", {}, n(700))], parameters: [parameter("k", { time: -1 }, [0, 1], 1)], rates: { x: mul(p("k"), exp(c("x"))) } });
    const problems = accuracy(compartmentModel(spec), defaults(spec), 5);
    expect(problems.map((problem) => problem.check)).toEqual(["accuracy"]);
    expect(problems[0]?.message).toMatch(/the run broke down: x \(x\) would become Infinity at step 1/);
    expect(problems[0]?.message).toMatch(/so PaperPlay will not draw it/);

    const badStart = model({ compartments: [compartment("x", {}, log(p("a")))], parameters: [parameter("a", {}, [0, 1], 0.5)], rates: { x: n(0) } });
    const subject = compartmentModel(badStart);
    expect(accuracy(subject, { a: 0 }, 5)[0]?.message).toMatch(/the run broke down: the initial value of x \(x\) is -Infinity, not a finite number/);
    expect(positivity(subject, { a: 0 }, 5).map((problem) => problem.check)).toEqual(["positivity"]);
  });

  it("needs a whole number of steps and parameters within range", () => {
    const spec = sirPeople();
    const sir = compartmentModel(spec);
    for (const steps of [0, -1, 1.5]) expect(() => accuracy(sir, defaults(spec), steps), String(steps)).toThrow(RangeError);
    expect(() => accuracy(sir, { ...defaults(spec), beta: 5 }, 10)).toThrow();
  });
});

describe("[R01] compartments.ode checks: positivity (MODEL.md C2)", () => {
  /** dx/dt = −drain: a store that empties at a constant rate, and keeps going. */
  const drain = (nonNegative: boolean): ModelSpec =>
    model({
      timeUnit: "hour",
      compartments: [compartment("x", { molecules: 1 }, p("dose"), "Store", nonNegative)],
      parameters: [parameter("drain", { molecules: 1, time: -1 }, [0, 2], 1), parameter("dose", { molecules: 1 }, [0, 10], 1)],
      rates: { x: neg(p("drain")) },
    });

  it("passes SIR, whose compartments stay at or above zero", () => {
    const spec = sirPeople();
    expect(positivity(compartmentModel(spec), defaults(spec), 2000)).toEqual([]);
  });

  it("refuses a compartment the model says cannot go below zero when it does, at its lowest", () => {
    const problems = positivity(compartmentModel(drain(true)), { drain: 1, dose: 1 }, 20);
    expect(problems.map((problem) => problem.path)).toEqual([["compartments", 0]]);
    expect(problems[0]?.message).toMatch(/^Store \(x\) falls to -1 molecules at 2 hours/);
  });

  it("leaves alone a compartment the model lets go below zero", () => {
    expect(positivity(compartmentModel(drain(false)), { drain: 1, dose: 1 }, 20)).toEqual([]);
  });
});

describe("[R01] compartments.ode checks: conservation (MODEL.md C3)", () => {
  it("proves SIR's s + i + r symbolically, and checks it numerically", () => {
    const spec = sirShares();
    const report = conservation(spec, compartmentModel(spec), defaults(spec), 1000);
    expect(report.problems).toEqual([]);
    expect(report.invariants).toEqual([
      { path: ["invariants", 0], method: "symbolic", message: "s + i + r is proved conserved symbolically: its rate of change expands to exactly 0. It was also checked numerically over 1000 steps." },
    ]);
  });

  it("checks SIR in people numerically only, and says why: its rates divide by a parameter", () => {
    const spec = sirPeople();
    const report = conservation(spec, compartmentModel(spec), defaults(spec), 1000);
    expect(report.problems).toEqual([]);
    expect(report.invariants.map((invariant) => invariant.method)).toEqual(["numeric"]);
    expect(report.invariants[0]?.message).toBe(
      "s + i + r is checked numerically over 1000 steps only, because the rate of s is not a polynomial: it divides by an expression that is not a number.",
    );
  });

  it("proves an invariant whose coefficients are parameters", () => {
    const spec = sirShares({}, [add(mul(p("beta"), c("s")), mul(p("beta"), c("i")), mul(p("beta"), c("r")), p("gamma"))]);
    const report = conservation(spec, compartmentModel(spec), defaults(spec), 200);
    expect(report.problems).toEqual([]);
    expect(report.invariants.map((invariant) => invariant.method)).toEqual(["symbolic"]);
  });

  it("refuses equations that do not conserve what the paper states, both symbolically and numerically", () => {
    // A misprint: recovery counted twice, so d(s + i + r)/dt = γi.
    const spec = sirShares({ r: mul(n(2), p("gamma"), c("i")) });
    const report = conservation(spec, compartmentModel(spec), defaults(spec), 1000);
    expect(report.problems.map((problem) => problem.path)).toEqual([["invariants", 0], ["invariants", 0]]);
    expect(report.problems[0]?.message).toBe(
      "The paper states that s + i + r is conserved, but by these equations its rate of change expands to i × gamma, not 0: the equations as written do not conserve it.",
    );
    expect(report.problems[1]?.message).toMatch(/^s \+ i \+ r drifts from 1 to 1\.\d+ by 100 days, more than the conservation check allows/);
    expect(report.invariants[0]).toEqual({ path: ["invariants", 0], method: "symbolic", message: "s + i + r is disproved symbolically: its rate of change expands to i × gamma, not 0." });
  });

  it("checks an invariant that is not linear numerically only, which still catches a step too coarse to keep it", () => {
    const fine = rotation(0.01);
    const report = conservation(fine, compartmentModel(fine), { omega: 1 }, 1000);
    expect(report.problems).toEqual([]);
    expect(report.invariants[0]?.method).toBe("numeric");
    expect(report.invariants[0]?.message).toMatch(/because the invariant is not a sum of compartments with constant coefficients: it has the term x\^2\.$/);
    // At ωΔt = 0.5, each RK4 step shrinks x² + y² by a factor 1 − (0.5)⁶/72 + (0.5)⁸/576.
    const coarse = rotation(0.5);
    expect(conservation(coarse, compartmentModel(coarse), { omega: 1 }, 100).problems.map((problem) => problem.check)).toEqual(["conservation"]);
  });
});

describe("[R01] compartments.ode checks: steady states (MODEL.md C4)", () => {
  it("accepts SIR's state with no infection", () => {
    const spec = sirPeople();
    expect(steadyStates(spec, compartmentModel(spec), defaults(spec))).toEqual([]);
  });

  it("refuses a misprinted steady state at every compartment that would still change", () => {
    // With one person infectious: ds/dt = −β = −0.4, di/dt = β − γ = 0.2, dr/dt = γ = 0.2 people per day.
    const spec = withSteadyState(sirPeople(), { s: p("population"), i: p("seeded"), r: n(0) });
    const problems = steadyStates(spec, compartmentModel(spec), defaults(spec));
    expect(problems.map((problem) => [problem.check, ...(problem.path ?? [])])).toEqual([
      ["steady-state", "steadyStates", 0, "at", "s"],
      ["steady-state", "steadyStates", 0, "at", "i"],
      ["steady-state", "steadyStates", 0, "at", "r"],
    ]);
    expect(problems[1]?.message).toMatch(/^At the steady state “A stated steady state”, Infectious \(i\) still changes at 0\.2 people per day/);
  });

  it("refuses a steady state whose value is not a finite number", () => {
    const spec = withSteadyState(sirShares(), { s: log(p("seeded")), i: n(0), r: n(0) });
    const problems = steadyStates(spec, compartmentModel(spec), { ...defaults(spec), seeded: 0 });
    expect(problems.map((problem) => problem.path)).toEqual([["steadyStates", 0, "at", "s"]]);
    expect(problems[0]?.message).toMatch(/-Infinity, not a finite number/);
  });
});
