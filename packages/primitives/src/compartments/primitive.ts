import { ModelSpec, type Expr } from "@paperplay/contracts";
import { z } from "zod";
import { assertSeed } from "../prng.ts";
import type { Primitive, PrimitiveDescription, VariableDescription } from "../types.ts";
import { deepFreeze, shapeOf } from "../variables.ts";
import { compileExpr, type Compiled, type Indices } from "./expr.ts";
import { rk4Step, type Rates } from "./rk4.ts";
import { checkUnits, figure, formatUnit, timeWord } from "./units.ts";

export type CompartmentParams = Readonly<Record<string, number>>;

/** MODEL.md's state contract: plain JSON, compartments keyed in the spec's order. */
export interface CompartmentState {
  /** Steps taken since init. */
  readonly stepIndex: number;
  readonly compartments: Readonly<Record<string, number>>;
}

export type CompartmentObservables = Record<string, number>;

/** compartments.ode@1.0.0 bound to one model. Its spec is the validated, frozen copy it runs, which the family's checks read. */
export type CompartmentModel = Primitive<CompartmentParams, CompartmentState, CompartmentObservables> & { readonly spec: ModelSpec };

/** The model compiled once: every expression a closure over vectors laid out by `indices`. */
export interface CompiledModel {
  readonly compartmentIds: readonly string[];
  readonly parameterIds: readonly string[];
  readonly indices: Indices;
  readonly initials: readonly Compiled[];
  readonly rates: Rates;
  readonly observables: readonly { readonly id: string; readonly value: Compiled }[];
}

export function compileModel(spec: ModelSpec): CompiledModel {
  const compartmentIds = spec.compartments.map((compartment) => compartment.id);
  const parameterIds = spec.parameters.map((parameter) => parameter.id);
  const indices: Indices = {
    compartments: new Map(compartmentIds.map((id, index) => [id, index])),
    parameters: new Map(parameterIds.map((id, index) => [id, index])),
  };
  const rateOf = (id: string): Expr => {
    const equation = spec.equations.find((candidate) => candidate.of === id);
    if (!equation) throw new RangeError(`compartment ${id} has no equation`);
    return equation.rate;
  };
  return {
    compartmentIds,
    parameterIds,
    indices,
    initials: spec.compartments.map((compartment) => compileExpr(compartment.initial, indices)),
    rates: compartmentIds.map((id) => compileExpr(rateOf(id), indices)),
    observables: spec.observables.map((observable) => ({ id: observable.id, value: compileExpr(observable.expr, indices) })),
  };
}

/** θ: the parameters' values in spec order. Each must be given, as a finite number. */
export function parameterVector(compiled: CompiledModel, params: CompartmentParams): Float64Array {
  return Float64Array.from(compiled.parameterIds, (id) => {
    const value = Object.hasOwn(params, id) ? params[id] : undefined;
    if (typeof value !== "number" || !Number.isFinite(value)) throw new RangeError(`parameter ${id} must be a finite number, got ${String(value)}`);
    return value;
  });
}

/** x: the compartments' values in spec order. */
export function stateVector(compiled: CompiledModel, state: CompartmentState): Float64Array {
  return Float64Array.from(compiled.compartmentIds, (id) => {
    const value = Object.hasOwn(state.compartments, id) ? state.compartments[id] : undefined;
    if (typeof value !== "number" || !Number.isFinite(value)) throw new RangeError(`compartment ${id} must hold a finite number, got ${String(value)}`);
    return value;
  });
}

/** The ids of every parameter an expression reads. */
function parametersIn(expr: Expr, found: Set<string> = new Set()): Set<string> {
  if ("p" in expr) found.add(expr.p);
  else if ("args" in expr) for (const arg of expr.args) parametersIn(arg, found);
  else if ("op" in expr) {
    parametersIn(expr.a, found);
    if ("b" in expr) parametersIn(expr.b, found);
  }
  return found;
}

function describeModel(spec: ModelSpec): PrimitiveDescription {
  const shaping = new Set(spec.compartments.flatMap((compartment) => [...parametersIn(compartment.initial)]));
  const variables: Record<string, VariableDescription> = {};
  for (const parameter of spec.parameters) {
    variables[parameter.id] = {
      unit: formatUnit(parameter.unit, spec.timeUnit),
      meaning: `${parameter.name} (${parameter.symbol})`,
      range: parameter.range,
      defaultValue: parameter.defaultValue,
      phase: shaping.has(parameter.id) ? "init" : "live",
      integer: false,
    };
  }
  const observables = Object.fromEntries(spec.observables.map((observable) => [observable.id, { unit: formatUnit(observable.unit, spec.timeUnit), meaning: observable.label }]));
  const { dt, tolerance } = spec.solver;
  const step = `${figure(dt)} ${timeWord(spec.timeUnit, figure(dt) !== "1")}`;
  return {
    variables,
    observables,
    assumptions: [
      "Each compartment is one number for the whole of it, well mixed: no individuals and no space.",
      `Time is measured in ${timeWord(spec.timeUnit, true)}, and every rate is a change per ${timeWord(spec.timeUnit, false)}. Nothing depends on the time itself: there is no outside forcing.`,
      "The equations are data, checked before they run: every name resolves and the units agree.",
      "Deterministic: the same parameters always give the same run, bit for bit on one runtime. The seed changes nothing, because the model has no randomness.",
      `Solved by the classical fourth-order Runge–Kutta method (RK4) at a fixed step of ${step}.`,
      `The accuracy check runs the model again at half the step. If any compartment moves by more than ${figure(tolerance)} of its largest value, the step is too coarse for the model, which is stiff or unstable at it, and PaperPlay refuses to draw it rather than draw it wrong.`,
      "A compartment the model says cannot go below zero is checked to stay at or above it; the conservation laws and steady states the paper states are checked too.",
      "Parameters change only between steps, when a learner moves a control.",
    ],
  };
}

/**
 * compartments.ode@1.0.0, specified in MODEL.md, bound to one model. The spec is validated and
 * copied first, so a caller's later edit cannot reach the model, and a model whose units
 * disagree (U8) is refused with a RangeError. Everything returned is frozen; nothing it is
 * given is written to.
 */
export function compartmentModel(input: ModelSpec): CompartmentModel {
  const spec = deepFreeze(ModelSpec.parse(input));
  const problems = checkUnits(spec);
  if (problems.length > 0) {
    throw new RangeError(`the model's units disagree: ${problems.map((problem) => `${problem.path.join(".")}: ${problem.message}`).join("; ")}`);
  }
  const compiled = compileModel(spec);
  const { compartmentIds } = compiled;
  const description = deepFreeze(describeModel(spec));
  const named = (index: number): string => {
    const compartment = spec.compartments[index];
    return compartment ? `${compartment.name} (${compartment.id})` : `compartment ${index}`;
  };

  const stateOf = (stepIndex: number, x: Float64Array): CompartmentState =>
    Object.freeze({ stepIndex, compartments: Object.freeze(Object.fromEntries(compartmentIds.map((id, index) => [id, x[index] as number]))) });

  const paramSchema: z.ZodType<CompartmentParams> = z.strictObject(shapeOf(description.variables));
  const stateSchema: z.ZodType<CompartmentState> = z.strictObject({
    stepIndex: z.int().nonnegative(),
    compartments: z.strictObject(Object.fromEntries(compartmentIds.map((id) => [id, z.number()]))),
  });

  return Object.freeze({
    id: "compartments.ode",
    version: "1.0.0",
    fixedTimestep: spec.solver.dt,
    paramSchema,
    stateSchema,
    spec,
    init(params: CompartmentParams, seed: number): CompartmentState {
      // The model has no randomness, so the seed changes nothing (E5); it is still checked, so a
      // run record's seed means the same for every primitive.
      assertSeed(seed);
      const theta = parameterVector(compiled, params);
      const none = new Float64Array(compartmentIds.length);
      const x = Float64Array.from(compiled.initials, (initial, index) => {
        const value = initial(none, theta);
        if (!Number.isFinite(value)) throw new RangeError(`the initial value of ${named(index)} is ${value}, not a finite number`);
        return value;
      });
      return stateOf(0, x);
    },
    step(state: CompartmentState, params: CompartmentParams, dt: number): CompartmentState {
      if (!(dt > 0 && dt <= spec.solver.dt)) {
        throw new RangeError(`timestep must be in (0, ${spec.solver.dt}] ${timeWord(spec.timeUnit, true)}, the model's declared step, got ${dt}`);
      }
      const next = rk4Step(compiled.rates, stateVector(compiled, state), parameterVector(compiled, params), dt);
      next.forEach((value, index) => {
        if (!Number.isFinite(value)) throw new RangeError(`${named(index)} would become ${value} at step ${state.stepIndex + 1}, not a finite number, so the step is refused`);
      });
      return stateOf(state.stepIndex + 1, next);
    },
    measure(state: CompartmentState): CompartmentObservables {
      const x = stateVector(compiled, state);
      const none = new Float64Array(compiled.parameterIds.length);
      return Object.freeze(Object.fromEntries(compiled.observables.map((observable) => [observable.id, observable.value(x, none)])));
    },
    describe: (): PrimitiveDescription => description,
  });
}
