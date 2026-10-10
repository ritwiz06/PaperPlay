import type { Expr, ModelSpec, Unit } from "@paperplay/contracts";
import { describe, expect, it } from "vitest";
import { checkUnits, compartmentModel, formatUnit, sameUnit, unitOf, type UnitEnv, type UnitResult } from "../src/compartments/index.ts";
import { add, c, compartment, div, exp, log, model, mul, n, neg, p, parameter, pow, sirPeople, sub } from "./compartments.examples.ts";

const PEOPLE: Unit = { people: 1 };
const env: UnitEnv = {
  compartments: new Map([["s", PEOPLE], ["i", PEOPLE], ["x", {}]]),
  parameters: new Map<string, Unit>([["beta", { time: -1 }], ["population", PEOPLE], ["k", {}]]),
  timeUnit: "day",
};
const unit = (expr: Expr): UnitResult => unitOf(expr, env);
const problemAt = (expr: Expr): (string | number)[] | undefined => {
  const result = unit(expr);
  return result.ok ? undefined : [...result.problem.path];
};

describe("[R01] compartments.ode units: in words", () => {
  it("names a unit as learners read it", () => {
    expect(formatUnit({}, "day")).toBe("dimensionless");
    expect(formatUnit({ people: 1 }, "day")).toBe("people");
    expect(formatUnit({ people: 1, time: -1 }, "day")).toBe("people per day");
    expect(formatUnit({ people: -1, time: -1 }, "day")).toBe("per person per day");
    expect(formatUnit({ time: -1 }, "hour")).toBe("per hour");
    expect(formatUnit({ time: -2 }, "second")).toBe("per second squared");
    expect(formatUnit({ time: 1 }, "week")).toBe("weeks");
    expect(formatUnit({ people: 2 }, "day")).toBe("people squared");
    expect(formatUnit({ molecules: 1, length: -3 }, "minute")).toBe("molecules per length unit cubed");
    expect(formatUnit({ cells: 1, molecules: 1, time: -1 }, "year")).toBe("cells × molecules per year");
    expect(formatUnit({ mass: 4, cells: -1 }, "day")).toBe("mass units to the fourth per cell");
  });

  it("compares units exponent by exponent", () => {
    expect(sameUnit({ people: 1, time: -1 }, { time: -1, people: 1 })).toBe(true);
    expect(sameUnit({}, {})).toBe(true);
    expect(sameUnit({ people: 1 }, { cells: 1 })).toBe(false);
  });
});

describe("[R01] compartments.ode units: each node (MODEL.md U1–U7)", () => {
  it("gives a number no unit, and a literal zero any unit", () => {
    expect(unit(n(2))).toEqual({ ok: true, unit: {} });
    expect(unit(n(0))).toEqual({ ok: true, unit: "any" });
    expect(unit(add(c("s"), n(0)))).toEqual({ ok: true, unit: PEOPLE });
    expect(unit(mul(n(0), c("s")))).toEqual({ ok: true, unit: "any" });
    expect(unit(neg(n(0)))).toEqual({ ok: true, unit: "any" });
  });

  it("works out products, quotients and the rate of new infections", () => {
    expect(unit(div(mul(p("beta"), c("s"), c("i")), p("population")))).toEqual({ ok: true, unit: { people: 1, time: -1 } });
    expect(unit(div(c("s"), c("i")))).toEqual({ ok: true, unit: {} });
    expect(unit(div(n(1), p("beta")))).toEqual({ ok: true, unit: { time: 1 } });
  });

  it("needs one unit across a sum, and points at the term that breaks it", () => {
    expect(problemAt(add(c("s"), c("i"), n(1)))).toEqual(["args", 2]);
    expect(problemAt(sub(c("s"), p("beta")))).toEqual(["b"]);
    expect(problemAt(add(c("s"), mul(p("beta"), c("i"))))).toEqual(["args", 1]);
    const result = unit(add(c("s"), n(1)));
    expect(result.ok ? "" : result.problem.message).toBe("this adds a dimensionless quantity to a quantity in people; a sum's terms need one unit");
  });

  it("gives exp and log dimensionless arguments only", () => {
    expect(unit(exp(div(c("s"), p("population"))))).toEqual({ ok: true, unit: {} });
    expect(unit(log(n(0)))).toEqual({ ok: true, unit: {} });
    expect(problemAt(exp(c("s")))).toEqual(["a"]);
    expect(problemAt(mul(p("beta"), add(c("x"), log(c("i")))))).toEqual(["args", 1, "args", 1, "a"]);
  });

  it("raises a quantity with a unit only to a whole-number literal, within ±4", () => {
    expect(unit(pow(c("s"), n(2)))).toEqual({ ok: true, unit: { people: 2 } });
    expect(unit(pow(c("s"), n(-1)))).toEqual({ ok: true, unit: { people: -1 } });
    expect(unit(pow(c("s"), n(0)))).toEqual({ ok: true, unit: {} });
    expect(unit(pow(c("x"), p("k")))).toEqual({ ok: true, unit: {} });
    expect(unit(pow(div(c("s"), p("population")), n(0.5)))).toEqual({ ok: true, unit: {} });
    expect(problemAt(pow(c("s"), n(0.5)))).toEqual(["b"]);
    expect(problemAt(pow(c("s"), p("k")))).toEqual(["b"]);
    expect(problemAt(pow(c("x"), p("beta")))).toEqual(["b"]);
    expect(problemAt(pow(c("s"), n(5)))).toEqual([]);
    expect(problemAt(mul(c("s"), c("s"), c("s"), c("s"), c("s")))).toEqual(["args", 4]);
  });

  it("refuses division by zero, and names it", () => {
    expect(problemAt(div(c("s"), n(0)))).toEqual(["b"]);
    expect(problemAt(div(c("s"), mul(n(0), c("i"))))).toEqual(["b"]);
  });

  it("refuses a name it has no unit for", () => {
    expect(problemAt(mul(p("gamma"), c("i")))).toEqual(["args", 0, "p"]);
    expect(problemAt(c("r"))).toEqual(["c"]);
  });
});

describe("[R01] compartments.ode units: the model's units agree (MODEL.md U8)", () => {
  /** SIR in people with one part replaced. */
  function sirWith(change: (spec: ModelSpec) => void): ModelSpec {
    const spec = sirPeople();
    change(spec);
    return spec;
  }

  it("accepts SIR in people", () => {
    expect(checkUnits(sirPeople())).toEqual([]);
  });

  it("gives each rate its compartment's unit per unit of time", () => {
    const spec = sirWith((s) => {
      s.equations[0] = { ...s.equations[0], of: "s", rate: neg(mul(p("beta"), c("s"), c("i"))) } as ModelSpec["equations"][number];
    });
    expect(checkUnits(spec)).toEqual([{ path: ["equations", 0, "rate"], message: "the rate of s is in people squared per day, but it must be in people per day" }]);
  });

  it("gives each initial and steady-state value its compartment's unit, and each observable its declared one", () => {
    const spec = sirWith((s) => {
      s.compartments[1] = { ...s.compartments[1], initial: p("beta") } as ModelSpec["compartments"][number];
      s.steadyStates[0] = { ...s.steadyStates[0], at: { s: div(p("population"), p("beta")), i: n(0), r: n(0) } } as ModelSpec["steadyStates"][number];
      s.observables[1] = { ...s.observables[1], unit: PEOPLE } as ModelSpec["observables"][number];
    });
    expect(checkUnits(spec).map((problem) => problem.path)).toEqual([
      ["compartments", 1, "initial"],
      ["steadyStates", 0, "at", "s"],
      ["observables", 1, "expr"],
    ]);
  });

  it("needs every invariant to have a unit, and points into it", () => {
    const spec = sirWith((s) => {
      s.invariants[0] = { ...s.invariants[0], expr: add(c("s"), c("i"), p("beta")) } as ModelSpec["invariants"][number];
    });
    expect(checkUnits(spec).map((problem) => problem.path)).toEqual([["invariants", 0, "expr", "args", 2]]);
  });

  it("refuses a compartment whose rate's unit would leave ±4", () => {
    const spec = model({ compartments: [compartment("x", { time: -4 }, n(0))], rates: { x: n(0) } });
    expect(checkUnits(spec).map((problem) => problem.path)).toEqual([["equations", 0, "of"]]);
  });

  it("is checked before a model is built, which refuses one whose units disagree", () => {
    const spec = model({
      compartments: [compartment("x", { molecules: 1 }, n(1000))],
      parameters: [parameter("k", { time: -1 }, [0, 1], 0.5)],
      rates: { x: neg(mul(p("k"), c("x"))) },
    });
    expect(() => compartmentModel(spec)).toThrow(/compartments\.0\.initial: the initial value of x is dimensionless, but it must be in molecules/);
    expect(() => compartmentModel({ ...spec, compartments: [compartment("x", { molecules: 1 }, n(0))] })).not.toThrow();
    expect(() => compartmentModel({ ...spec, compartments: [compartment("x", { molecules: 1 }, sub(n(1), n(1)))] })).toThrow(RangeError);
  });
});
