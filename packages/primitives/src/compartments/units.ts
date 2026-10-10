import type { Dimension, Expr, ModelSpec, TimeUnit, Unit } from "@paperplay/contracts";

// Dimensional analysis, by MODEL.md U1–U8. A unit is worked on as a vector of six exponents in
// the contract's dimension order; "any" is the unit of a literal zero, which fits every unit.

const DIMENSIONS: readonly Dimension[] = ["people", "cells", "molecules", "length", "mass", "time"];
const TIME = DIMENSIONS.indexOf("time");
/** U7: a computed exponent stays within what a declared unit could say. */
const LIMIT = 4;

type Vector = readonly number[];
const ANY = "any";
type Dimensioned = Vector | typeof ANY;

export type Path = readonly (string | number)[];

export interface UnitProblem {
  readonly path: Path;
  readonly message: string;
}

/** A node's unit, or "any" for a literal zero (U1), or the first problem found below it, at that node's path from the root. */
export type UnitResult = { readonly ok: true; readonly unit: Unit | "any" } | { readonly ok: false; readonly problem: UnitProblem };

/** The declared units an expression's names resolve to, and the model's time unit for naming them. */
export interface UnitEnv {
  readonly compartments: ReadonlyMap<string, Unit>;
  readonly parameters: ReadonlyMap<string, Unit>;
  readonly timeUnit: TimeUnit;
}

const vectorOf = (unit: Unit): Vector => DIMENSIONS.map((dimension) => unit[dimension] ?? 0);

function unitOfVector(vector: Vector): Unit {
  const unit: Unit = {};
  DIMENSIONS.forEach((dimension, index) => {
    const exponent = vector[index] ?? 0;
    if (exponent !== 0) unit[dimension] = exponent;
  });
  return unit;
}

const same = (a: Vector, b: Vector): boolean => a.every((exponent, index) => exponent === b[index]);
const dimensionless = (vector: Vector): boolean => vector.every((exponent) => exponent === 0);
const fits = (vector: Vector): boolean => vector.every((exponent) => Math.abs(exponent) <= LIMIT);
const DIMENSIONLESS: Vector = DIMENSIONS.map(() => 0);

/** Whether two units are the same. */
export const sameUnit = (a: Unit, b: Unit): boolean => same(vectorOf(a), vectorOf(b));

const NOUNS: Readonly<Record<Exclude<Dimension, "time">, readonly [string, string]>> = {
  people: ["person", "people"],
  cells: ["cell", "cells"],
  molecules: ["molecule", "molecules"],
  length: ["length unit", "length units"],
  mass: ["mass unit", "mass units"],
};
const POWERS = ["", "", " squared", " cubed", " to the fourth"];

/** A number for a sentence: six significant figures without trailing zeros, very large and very small ones as 4.35442e24. */
export function figure(value: number): string {
  const rounded = Number(value.toPrecision(6));
  const size = Math.abs(rounded);
  return size !== 0 && (size >= 1e6 || size < 1e-4) ? rounded.toExponential().replace("e+", "e") : String(rounded);
}

/** A time unit's name, singular or plural: "day", "days". */
export function timeWord(timeUnit: TimeUnit, plural: boolean): string {
  return plural ? `${timeUnit}s` : timeUnit;
}

/**
 * A unit in words, for learners: positive exponents as plural nouns joined by "×", then each
 * negative one as "per" and a singular noun, powers as "squared", "cubed" and "to the fourth".
 * {} is "dimensionless"; { people: 1, time: −1 } in days is "people per day".
 */
export function formatUnit(unit: Unit, timeUnit: TimeUnit): string {
  const noun = (dimension: Dimension, plural: boolean): string =>
    dimension === "time" ? timeWord(timeUnit, plural) : NOUNS[dimension][plural ? 1 : 0];
  const above: string[] = [];
  const below: string[] = [];
  for (const dimension of DIMENSIONS) {
    const exponent = unit[dimension] ?? 0;
    if (exponent > 0) above.push(`${noun(dimension, true)}${POWERS[exponent] ?? ""}`);
    if (exponent < 0) below.push(`per ${noun(dimension, false)}${POWERS[-exponent] ?? ""}`);
  }
  const words = [above.join(" × "), ...below].filter((part) => part.length > 0).join(" ");
  return words.length > 0 ? words : "dimensionless";
}

/** "dimensionless" or "in people per day", for a sentence about something's unit. */
function stated(unit: Unit, timeUnit: TimeUnit): string {
  const words = formatUnit(unit, timeUnit);
  return words === "dimensionless" ? words : `in ${words}`;
}

/** U1–U7 for one expression: its unit, or the first problem, with the offending node's path from the expression's root. */
export function unitOf(expr: Expr, env: UnitEnv): UnitResult {
  const quantity = (unit: Vector): string => (dimensionless(unit) ? "a dimensionless quantity" : `a quantity ${stated(unitOfVector(unit), env.timeUnit)}`);
  const outcome = walk(expr, []);
  return "problem" in outcome ? { ok: false, problem: outcome.problem } : { ok: true, unit: outcome.unit === ANY ? ANY : unitOfVector(outcome.unit) };

  function fail(path: Path, message: string): { problem: UnitProblem } {
    return { problem: { path, message } };
  }

  function combine(a: Vector, b: Vector, sign: 1 | -1, path: Path, what: string): { unit: Vector } | { problem: UnitProblem } {
    const unit = a.map((exponent, index) => exponent + sign * (b[index] ?? 0));
    return fits(unit) ? { unit } : fail(path, `${what} would have a unit with an exponent beyond ±${LIMIT}`);
  }

  function walk(node: Expr, path: Path): { unit: Dimensioned } | { problem: UnitProblem } {
    if ("n" in node) return { unit: node.n === 0 ? ANY : DIMENSIONLESS };
    if ("p" in node) {
      const unit = env.parameters.get(node.p);
      return unit ? { unit: vectorOf(unit) } : fail([...path, "p"], `there is no parameter ${node.p}`);
    }
    if ("c" in node) {
      const unit = env.compartments.get(node.c);
      return unit ? { unit: vectorOf(unit) } : fail([...path, "c"], `there is no compartment ${node.c}`);
    }
    switch (node.op) {
      case "add":
      case "sub": {
        const operands: [Expr, Path][] =
          "args" in node ? node.args.map((arg, index): [Expr, Path] => [arg, [...path, "args", index]]) : [[node.a, [...path, "a"]], [node.b, [...path, "b"]]];
        let unit: Dimensioned = ANY;
        for (const [operand, at] of operands) {
          const result = walk(operand, at);
          if ("problem" in result) return result;
          if (result.unit === ANY) continue;
          if (unit === ANY) unit = result.unit;
          else if (!same(unit, result.unit)) {
            const verb = node.op === "add" ? `adds ${quantity(result.unit)} to ${quantity(unit)}` : `subtracts ${quantity(result.unit)} from ${quantity(unit)}`;
            return fail(at, `this ${verb}; a sum's terms need one unit`);
          }
        }
        return { unit };
      }
      case "mul": {
        const factors: Dimensioned[] = [];
        for (const [index, arg] of node.args.entries()) {
          const result = walk(arg, [...path, "args", index]);
          if ("problem" in result) return result;
          factors.push(result.unit);
        }
        if (factors.includes(ANY)) return { unit: ANY };
        let unit: Vector = DIMENSIONLESS;
        for (const [index, factor] of factors.entries()) {
          const result = combine(unit, factor as Vector, 1, [...path, "args", index], "this product");
          if ("problem" in result) return result;
          unit = result.unit;
        }
        return { unit };
      }
      case "div": {
        const [a, b] = [walk(node.a, [...path, "a"]), walk(node.b, [...path, "b"])];
        if ("problem" in a) return a;
        if ("problem" in b) return b;
        if (b.unit === ANY) return fail([...path, "b"], "this divides by zero");
        if (a.unit === ANY) return { unit: ANY };
        return combine(a.unit, b.unit, -1, path, "this quotient");
      }
      case "neg":
        return walk(node.a, [...path, "a"]);
      case "exp":
      case "log": {
        const a = walk(node.a, [...path, "a"]);
        if ("problem" in a) return a;
        if (a.unit !== ANY && !dimensionless(a.unit)) return fail([...path, "a"], `${node.op} needs a dimensionless argument, not ${quantity(a.unit)}`);
        return { unit: DIMENSIONLESS };
      }
      case "pow": {
        const [base, exponent] = [walk(node.a, [...path, "a"]), walk(node.b, [...path, "b"])];
        if ("problem" in base) return base;
        if ("problem" in exponent) return exponent;
        if (exponent.unit !== ANY && !dimensionless(exponent.unit)) return fail([...path, "b"], `a power needs a dimensionless exponent, not ${quantity(exponent.unit)}`);
        const literal = "n" in node.b ? node.b.n : undefined;
        if (base.unit === ANY) return { unit: literal === 0 ? DIMENSIONLESS : ANY };
        if (dimensionless(base.unit)) return { unit: DIMENSIONLESS };
        if (literal === undefined || !Number.isInteger(literal)) {
          return fail([...path, "b"], `${quantity(base.unit)} can be raised only to a whole number written as a number; only a dimensionless quantity takes any exponent`);
        }
        const unit = base.unit.map((power) => power * literal);
        return fits(unit) ? { unit } : fail(path, `this power would have a unit with an exponent beyond ±${LIMIT}`);
      }
    }
  }
}

/**
 * U8: every rate has its compartment's unit per unit of time, every initial and steady-state
 * value its compartment's unit, every invariant a unit, and every observable its declared
 * unit. Returns each problem with its path in the spec.
 */
export function checkUnits(spec: ModelSpec): UnitProblem[] {
  const env: UnitEnv = {
    compartments: new Map(spec.compartments.map((compartment) => [compartment.id, compartment.unit])),
    parameters: new Map(spec.parameters.map((parameter) => [parameter.id, parameter.unit])),
    timeUnit: spec.timeUnit,
  };
  const problems: UnitProblem[] = [];
  const expect = (expr: Expr, path: Path, unit: Unit | undefined, what: string): void => {
    const result = unitOf(expr, env);
    if (!result.ok) problems.push({ path: [...path, ...result.problem.path], message: result.problem.message });
    else if (unit !== undefined && result.unit !== ANY && !sameUnit(result.unit, unit)) {
      problems.push({ path, message: `${what} is ${stated(result.unit, spec.timeUnit)}, but it must be ${stated(unit, spec.timeUnit)}` });
    }
  };

  spec.compartments.forEach((compartment, index) => expect(compartment.initial, ["compartments", index, "initial"], compartment.unit, `the initial value of ${compartment.id}`));
  spec.equations.forEach((equation, index) => {
    const compartment = spec.compartments.find((candidate) => candidate.id === equation.of);
    if (!compartment) return;
    const perTime = vectorOf(compartment.unit).map((exponent, dimension) => (dimension === TIME ? exponent - 1 : exponent));
    if (!fits(perTime)) {
      problems.push({ path: ["equations", index, "of"], message: `${equation.of}'s rate would be in its unit per ${timeWord(spec.timeUnit, false)}, an exponent beyond ±${LIMIT}` });
      return;
    }
    expect(equation.rate, ["equations", index, "rate"], unitOfVector(perTime), `the rate of ${equation.of}`);
  });
  spec.invariants.forEach((invariant, index) => expect(invariant.expr, ["invariants", index, "expr"], undefined, "the invariant"));
  spec.steadyStates.forEach((steady, index) => {
    for (const [id, value] of Object.entries(steady.at)) {
      const compartment = spec.compartments.find((candidate) => candidate.id === id);
      expect(value, ["steadyStates", index, "at", id], compartment?.unit, `the steady-state value of ${id}`);
    }
  });
  spec.observables.forEach((observable, index) => expect(observable.expr, ["observables", index, "expr"], observable.unit, `the observable ${observable.id}`));
  return problems;
}
