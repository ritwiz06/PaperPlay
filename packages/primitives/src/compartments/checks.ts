import type { Expr, ModelSpec, Unit } from "@paperplay/contracts";
import { compileExpr, compileMagnitude, formatExpr, type Compiled } from "./expr.ts";
import { addPolynomials, differentiate, expand, formatPolynomial, isZeroPolynomial, multiplyPolynomials, type Polynomial } from "./polynomial.ts";
import { compileModel, parameterVector, stateVector, type CompartmentModel, type CompartmentParams, type CompartmentState } from "./primitive.ts";
import { figure, formatUnit, timeWord, type Path } from "./units.ts";

// The family's checks, by MODEL.md C1–C4. Each runs the model through its public init and step
// and says what is wrong in plain English, which a learner reading over a reviewer's shoulder
// could follow. An empty list is a pass. A reviewer cannot overturn one of these.

export type CheckName = "accuracy" | "positivity" | "conservation" | "steady-state";

export interface CheckProblem {
  readonly check: CheckName;
  readonly message: string;
  /** Where in the ModelSpec the problem lies, when it lies somewhere in particular. */
  readonly path?: Path;
}

/** How an invariant was held to account: proved symbolically, or checked numerically only, and why. */
export interface InvariantReport {
  readonly path: Path;
  readonly method: "symbolic" | "numeric";
  readonly message: string;
}

export interface ConservationReport {
  readonly problems: readonly CheckProblem[];
  readonly invariants: readonly InvariantReport[];
}

/** Stands in for a scale of zero (C1–C3), in the compartment's own unit. */
const TINY = 1e-12;
/** C2: how far below zero, as a fraction of its scale, rounding may take a non-negative compartment. */
const BELOW_ZERO = 1e-9;
/** C3: how far a conserved quantity may drift, as a fraction of its starting size. */
const DRIFT = 1e-9;

interface Run {
  readonly states: readonly CompartmentState[];
  /** Why the run stopped early, if a step was refused (MODEL.md E4). */
  readonly failure?: string;
}

/** Runs from the initial state. A start or a step the model refuses (E4, E5) ends the run, with the reason, rather than the check. */
function run(model: CompartmentModel, params: CompartmentParams, steps: number, dt: number): Run {
  const states: CompartmentState[] = [];
  try {
    states.push(model.init(params, 0));
    for (let k = 0; k < steps; k++) states.push(model.step(states[k] as CompartmentState, params, dt));
  } catch (error) {
    if (error instanceof RangeError) return { states, failure: error.message };
    throw error;
  }
  return { states };
}

/** The parameters, checked against the model's ranges, and the number of steps, a whole number ≥ 1. */
function prepare(model: CompartmentModel, params: CompartmentParams, steps: number): CompartmentParams {
  if (!(Number.isInteger(steps) && steps >= 1)) throw new RangeError(`steps must be a whole number ≥ 1, got ${steps}`);
  return model.paramSchema.parse(params);
}

/** Words for one model's times, units and compartments. */
function wordsFor(spec: ModelSpec) {
  const duration = (time: number): string => `${figure(time)} ${timeWord(spec.timeUnit, figure(time) !== "1")}`;
  return {
    duration,
    at: (step: number, dt: number): string => (step === 0 ? "the start" : duration(step * dt)),
    unit: (unit: Unit): string => formatUnit(unit, spec.timeUnit),
    compartment: (index: number): string => {
      const compartment = spec.compartments[index];
      return compartment ? `${compartment.name} (${compartment.id})` : `compartment ${index}`;
    },
  };
}

/** The largest |value| each compartment takes over a run: its scale, which C1 and C2 measure against. */
function scales(model: CompartmentModel, states: readonly CompartmentState[]): number[] {
  return model.spec.compartments.map((compartment) => states.reduce((largest, state) => Math.max(largest, Math.abs(state.compartments[compartment.id] ?? 0)), 0));
}

/**
 * C1 as a measurement: runs `steps` steps at the model's step and twice as many at half of it,
 * from the same start, and finds the compartment that moves most when the step is halved, as a
 * share of what the check allows it: its tolerance of the compartment's largest value. A ratio
 * of at most 1 passes. A run that broke down instead says why.
 */
export type AccuracyReport =
  | {
      readonly ratio: number;
      /** The compartment that moved most, by its place in the model's order, the step it did so at, and by how much. */
      readonly compartment: number;
      readonly step: number;
      readonly deviation: number;
      readonly allowance: number;
      readonly scale: number;
    }
  | { readonly failure: string; readonly dt: number };

export function accuracyReport(model: CompartmentModel, params: CompartmentParams, steps: number): AccuracyReport {
  const valid = prepare(model, params, steps);
  const { spec } = model;
  const dt = model.fixedTimestep;
  const coarse = run(model, valid, steps, dt);
  const fine = run(model, valid, 2 * steps, dt / 2);
  if (coarse.failure !== undefined) return { failure: coarse.failure, dt };
  if (fine.failure !== undefined) return { failure: fine.failure, dt: dt / 2 };

  const scale = scales(model, coarse.states);
  let worst = { ratio: 0, compartment: 0, step: 0, deviation: 0, allowance: spec.solver.tolerance * Math.max(scale[0] ?? 0, TINY), scale: scale[0] ?? 0 };
  for (let k = 1; k <= steps; k++) {
    const [a, b] = [coarse.states[k] as CompartmentState, fine.states[2 * k] as CompartmentState];
    spec.compartments.forEach((compartment, index) => {
      const deviation = Math.abs((a.compartments[compartment.id] ?? 0) - (b.compartments[compartment.id] ?? 0));
      const allowance = spec.solver.tolerance * Math.max(scale[index] ?? 0, TINY);
      const ratio = deviation / allowance;
      if (ratio > worst.ratio) worst = { ratio, compartment: index, step: k, deviation, allowance, scale: scale[index] ?? 0 };
    });
  }
  return worst;
}

/**
 * C1, the honest refusal: a compartment that moves by more than the model's tolerance of its
 * scale when the step is halved, or a value that stops being a finite number, means the step is
 * too coarse for this model: it is stiff or unstable there, and PaperPlay will not draw it.
 * Reports the worst offender.
 */
export function accuracy(model: CompartmentModel, params: CompartmentParams, steps: number): CheckProblem[] {
  const { spec } = model;
  const words = wordsFor(spec);
  const dt = model.fixedTimestep;
  const refusal = `The solver's step is too coarse for this model, which is stiff or unstable at a step of ${words.duration(dt)}, so PaperPlay will not draw it.`;
  const report = accuracyReport(model, params, steps);
  if ("failure" in report) return [{ check: "accuracy", message: `At a step of ${words.duration(report.dt)} the run broke down: ${report.failure}. ${refusal}` }];
  if (!(report.ratio > 1)) return [];
  const compartment = spec.compartments[report.compartment];
  return [
    {
      check: "accuracy",
      message:
        `Halving the solver's step from ${words.duration(dt)} to ${words.duration(dt / 2)} moves ${words.compartment(report.compartment)} by ${figure(report.deviation)} ` +
        `${compartment ? words.unit(compartment.unit) : ""} at ${words.at(report.step, dt)}, while the accuracy check allows ${figure(report.allowance)}: ` +
        `${figure(spec.solver.tolerance)} of its largest value, ${figure(report.scale)}. ${refusal}`,
      path: ["compartments", report.compartment],
    },
  ];
}

/** C2: every compartment the model says cannot go below zero stays at or above −10⁻⁹ of its scale, over `steps` steps. */
export function positivity(model: CompartmentModel, params: CompartmentParams, steps: number): CheckProblem[] {
  const valid = prepare(model, params, steps);
  const { spec } = model;
  const words = wordsFor(spec);
  const dt = model.fixedTimestep;
  const { states, failure } = run(model, valid, steps, dt);
  const problems: CheckProblem[] = [];
  if (failure !== undefined) problems.push({ check: "positivity", message: `The run broke down before it could be checked: ${failure}.` });

  const scale = scales(model, states);
  spec.compartments.forEach((compartment, index) => {
    if (!compartment.nonNegative) return;
    const floor = -BELOW_ZERO * Math.max(scale[index] ?? 0, TINY);
    let lowest = { value: 0, step: 0 };
    states.forEach((state, step) => {
      const value = state.compartments[compartment.id] ?? 0;
      if (value < lowest.value) lowest = { value, step };
    });
    if (lowest.value < floor) {
      problems.push({
        check: "positivity",
        message:
          `${words.compartment(index)} falls to ${figure(lowest.value)} ${words.unit(compartment.unit)} at ${words.at(lowest.step, dt)}, further below zero than rounding ` +
          `explains (the positivity check allows ${figure(floor)}, 10⁻⁹ of its largest value). The model says it never goes below zero, so this run is refused.`,
        path: ["compartments", index],
      });
    }
  });
  return problems;
}

type Proof = { readonly kind: "proved" } | { readonly kind: "disproved"; readonly derivative: Polynomial } | { readonly kind: "not-applicable"; readonly reason: string };

/**
 * C3's symbolic half: when the invariant is Σ a_c·x_c + b with a_c and b free of compartments,
 * and the rates it needs are polynomials, dI/dt = Σ a_c·f_c, expanded exactly (P1).
 */
function prove(spec: ModelSpec, invariant: Expr): Proof {
  const expanded = expand(invariant);
  if (!expanded.polynomial) return { kind: "not-applicable", reason: `the invariant is not a polynomial: ${expanded.reason}` };
  for (const term of expanded.value.terms) {
    const held = term.factors.filter((factor) => factor.symbol.kind === "c");
    if (held.length > 1 || held.some((factor) => factor.power > 1)) {
      return { kind: "not-applicable", reason: `the invariant is not a sum of compartments with constant coefficients: it has the term ${formatPolynomial({ terms: [term] })}` };
    }
  }
  let derivative: Polynomial = { terms: [] };
  for (const compartment of spec.compartments) {
    const coefficient = differentiate(expanded.value, { kind: "c", id: compartment.id });
    if (!coefficient.polynomial) return { kind: "not-applicable", reason: coefficient.reason };
    if (isZeroPolynomial(coefficient.value)) continue;
    const equation = spec.equations.find((candidate) => candidate.of === compartment.id);
    if (!equation) return { kind: "not-applicable", reason: `${compartment.id} has no equation` };
    const rate = expand(equation.rate);
    if (!rate.polynomial) return { kind: "not-applicable", reason: `the rate of ${compartment.id} is not a polynomial: ${rate.reason}` };
    const term = multiplyPolynomials(coefficient.value, rate.value);
    if (!term.polynomial) return { kind: "not-applicable", reason: term.reason };
    const total = addPolynomials(derivative, term.value);
    if (!total.polynomial) return { kind: "not-applicable", reason: total.reason };
    derivative = total.value;
  }
  return isZeroPolynomial(derivative) ? { kind: "proved" } : { kind: "disproved", derivative };
}

/**
 * C3: each invariant the paper states holds, numerically, within 10⁻⁹ of its starting size
 * over `steps` steps, and, where it can be, is proved symbolically. Reports, for each
 * invariant, which of the two held it to account.
 */
export function conservation(spec: ModelSpec, model: CompartmentModel, params: CompartmentParams, steps: number): ConservationReport {
  const valid = prepare(model, params, steps);
  const words = wordsFor(spec);
  const dt = model.fixedTimestep;
  const compiled = compileModel(spec);
  const theta = parameterVector(compiled, valid);
  const { states, failure } = run(model, valid, steps, dt);
  const problems: CheckProblem[] = [];
  const invariants: InvariantReport[] = [];

  spec.invariants.forEach((invariant, index) => {
    const path: Path = ["invariants", index];
    const name = formatExpr(invariant.expr);
    const value = compileExpr(invariant.expr, compiled.indices);
    const values = states.map((state) => value(stateVector(compiled, state), theta));
    const start = values[0] ?? 0;
    const allowance = DRIFT * Math.max(Math.abs(start), TINY);
    let worst = { drift: 0, step: 0 };
    values.forEach((now, step) => {
      const drift = Math.abs(now - start);
      if (!(drift <= worst.drift)) worst = { drift, step };
    });

    const proof = prove(spec, invariant.expr);
    if (proof.kind === "disproved") {
      problems.push({
        check: "conservation",
        message: `The paper states that ${name} is conserved, but by these equations its rate of change expands to ${formatPolynomial(proof.derivative)}, not 0: the equations as written do not conserve it.`,
        path,
      });
    }
    if (failure !== undefined) problems.push({ check: "conservation", message: `The run broke down before ${name} could be checked: ${failure}.`, path });
    if (worst.drift > allowance) {
      problems.push({
        check: "conservation",
        message:
          `${name} drifts from ${figure(start)} to ${figure(values[worst.step] ?? Number.NaN)} by ${words.at(worst.step, dt)}, more than the conservation check allows ` +
          `(${figure(allowance)}, 10⁻⁹ of its starting size). The paper states it is conserved, so this run is refused.`,
        path,
      });
    }
    const numerically = `checked numerically over ${states.length - 1} steps`;
    invariants.push(
      proof.kind === "proved"
        ? { path, method: "symbolic", message: `${name} is proved conserved symbolically: its rate of change expands to exactly 0. It was also ${numerically}.` }
        : proof.kind === "disproved"
          ? { path, method: "symbolic", message: `${name} is disproved symbolically: its rate of change expands to ${formatPolynomial(proof.derivative)}, not 0.` }
          : { path, method: "numeric", message: `${name} is ${numerically} only, because ${proof.reason}.` },
    );
  });
  return { problems, invariants };
}

/** A compartment's unit per unit of time: its rate's unit. */
function perTime(unit: Unit): Unit {
  const time = (unit.time ?? 0) - 1;
  const { time: _time, ...rest } = unit;
  return time === 0 ? rest : { ...rest, time };
}

/**
 * C4: at each steady state the paper gives, every rate is within the model's tolerance of
 * zero. The scale is M (MODEL.md C4), the rate's size if none of its sums cancelled: at a true
 * steady state the flows in and out cancel and only rounding is left, a tiny fraction of them,
 * while at a misprinted one the net rate is comparable to the flows themselves. Measuring
 * against the flows, not against the compartment or the step, holds on any time scale.
 */
export function steadyStates(spec: ModelSpec, model: CompartmentModel, params: CompartmentParams): CheckProblem[] {
  const valid = model.paramSchema.parse(params);
  const words = wordsFor(spec);
  const compiled = compileModel(spec);
  const theta = parameterVector(compiled, valid);
  const none = new Float64Array(compiled.compartmentIds.length);
  const sizes = compiled.compartmentIds.map((id) => {
    const equation = spec.equations.find((candidate) => candidate.of === id);
    if (!equation) throw new RangeError(`compartment ${id} has no equation`);
    return compileMagnitude(equation.rate, compiled.indices);
  });
  const { tolerance } = spec.solver;
  const problems: CheckProblem[] = [];

  spec.steadyStates.forEach((steady, index) => {
    const values = compiled.compartmentIds.map((id) => {
      const expr = steady.at[id];
      return expr ? compileExpr(expr, compiled.indices)(none, theta) : Number.NaN;
    });
    const unfinished = values.findIndex((value) => !Number.isFinite(value));
    if (unfinished !== -1) {
      const id = compiled.compartmentIds[unfinished] ?? "";
      problems.push({ check: "steady-state", message: `The steady state “${steady.label}” puts ${words.compartment(unfinished)} at ${values[unfinished]}, not a finite number.`, path: ["steadyStates", index, "at", id] });
      return;
    }
    const x = Float64Array.from(values);
    spec.compartments.forEach((compartment, j) => {
      const rate = (compiled.rates[j] as Compiled)(x, theta);
      const size = (sizes[j] as Compiled)(x, theta);
      if (Number.isFinite(rate) && Math.abs(rate) <= tolerance * size) return;
      const unit = words.unit(perTime(compartment.unit));
      problems.push({
        check: "steady-state",
        message:
          `At the steady state “${steady.label}”, ${words.compartment(j)} still changes at ${figure(rate)} ${unit}, more than the steady-state check allows ` +
          `(${figure(tolerance * size)}: ${figure(tolerance)} of the ${figure(size)} ${unit} of flows that should cancel there). The paper gives this as a steady state, but by these equations it is not one.`,
        path: ["steadyStates", index, "at", compartment.id],
      });
    });
  });
  return problems;
}
