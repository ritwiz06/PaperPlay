import { DescentSpec, RULE_READS, type SurfaceSpec } from "@paperplay/contracts";
import { z } from "zod";
import { compileExpr, type Compiled } from "../compartments/expr.ts";
import { formatUnit } from "../compartments/units.ts";
import { assertSeed } from "../prng.ts";
import type { PrimitiveDescription, Primitive, VariableDescription } from "../types.ts";
import { deepFreeze, shapeOf } from "../variables.ts";

/**
 * learning.landscape@1.0.0 (ADR-0047): one trusted primitive that runs any optimizer's update rule,
 * given as data, on a loss surface over the plane. Each step takes the gradient where the rule
 * says, then applies the rule's lines in order to each coordinate alike; nothing is evaluated from
 * text, sums run left to right, and there is no chance in it, so the same parameters give the same
 * run bit for bit on one runtime.
 */

export type LandscapeParams = Readonly<Record<string, number>>;

/** A run after some steps: each coordinate's state by name, and how far the last step moved. */
export interface LandscapeState {
  readonly stepIndex: number;
  readonly x: Readonly<Record<string, number>>;
  readonly y: Readonly<Record<string, number>>;
  readonly moved: number;
}

export type LandscapeObservables = Readonly<{ loss: number; distance: number; x: number; y: number; moved: number }>;

/** How a world shows the run: how many steps a second of watching shows at 1x, a teaching choice. */
export interface LandscapeShowing {
  readonly perWatchSecond: number;
}

/** The surface's height at a point. */
export function lossAt(surface: SurfaceSpec, x: number, y: number): number {
  const dx = x - surface.cx;
  const dy = y - surface.cy;
  return 0.5 * surface.hx * dx * dx + 0.5 * surface.hy * dy * dy + surface.gx * x + surface.gy * y;
}

/** The surface's exact gradient at a point. */
export function gradientAt(surface: SurfaceSpec, x: number, y: number): readonly [number, number] {
  return [surface.hx * (x - surface.cx) + surface.gx, surface.hy * (y - surface.cy) + surface.gy];
}

/** Where the surface is lowest: its centre, moved by its slope where it curves; its centre where it does not. */
export function lowestOf(surface: SurfaceSpec): readonly [number, number] {
  return [surface.hx > 0 ? surface.cx - surface.gx / surface.hx : surface.cx, surface.hy > 0 ? surface.cy - surface.gy / surface.hy : surface.cy];
}

export type LandscapeModel = Primitive<LandscapeParams, LandscapeState, LandscapeObservables> & { readonly spec: DescentSpec; readonly chance: false };

function describeLandscape(spec: DescentSpec): PrimitiveDescription {
  const { optimizer, surface } = spec;
  const variable = (entry: DescentSpec["optimizer"]["hyperparameters"][number], phase: "init" | "live"): VariableDescription => ({
    unit: formatUnit(entry.unit, "step"),
    meaning: entry.name,
    range: [entry.range[0], entry.range[1]],
    defaultValue: entry.defaultValue,
    phase,
    integer: false,
  });
  const variables: Record<string, VariableDescription> = {};
  for (const entry of optimizer.hyperparameters) variables[entry.id] = variable(entry, "live");
  for (const entry of surface.start) variables[entry.id] = variable(entry, "init");
  return {
    variables,
    observables: {
      loss: { unit: "dimensionless", meaning: "The loss where the optimizer stands: the surface's height there" },
      distance: { unit: "dimensionless", meaning: "How far the optimizer stands from the surface's lowest point" },
      x: { unit: "dimensionless", meaning: "The optimizer's first coordinate" },
      y: { unit: "dimensionless", meaning: "The optimizer's second coordinate" },
      moved: { unit: "dimensionless", meaning: "How far the last step moved the optimizer" },
    },
    assumptions: [
      `The update rule, ${optimizer.name}, is data, checked before it runs: every name resolves, and each line is the paper's own equation.`,
      "The rule acts on each coordinate alike, as the paper's algorithm acts on each parameter of a network.",
      `The loss surface is ${surface.name}, of two dimensions, its gradient exact: a stand-in for a network's loss, at toy scale.`,
      "Time is counted in steps: one step is one update. Nothing is noisy and nothing is sampled, so the seed changes nothing and the same settings always give the same run, bit for bit on one runtime.",
      "Hyperparameters change only between steps, when a learner moves a control; the starting point shapes only the start of a run.",
    ],
  };
}

/**
 * learning.landscape@1.0.0 bound to one rule on one surface. The spec is validated and frozen
 * first; a rule whose step makes any value other than a finite number is refused at that step
 * with a RangeError, never drawn.
 */
export function landscapeModel(input: DescentSpec, showing: LandscapeShowing = { perWatchSecond: 1 }): LandscapeModel {
  if (!(Number.isFinite(showing.perWatchSecond) && showing.perWatchSecond > 0)) {
    throw new RangeError(`a second of watching must show a positive number of steps, got ${showing.perWatchSecond}`);
  }
  const spec = deepFreeze(DescentSpec.parse(input));
  const { optimizer, surface } = spec;
  const stateIds = optimizer.state.map((entry) => entry.id);
  const hyperIds = optimizer.hyperparameters.map((entry) => entry.id);
  // Each coordinate's vector: its states, then the gradient, then the step's number.
  const indices = {
    compartments: new Map<string, number>([...stateIds.map((id, index) => [id, index] as const), [RULE_READS.gradient, stateIds.length], [RULE_READS.step, stateIds.length + 1]]),
    parameters: new Map<string, number>(hyperIds.map((id, index) => [id, index])),
  };
  const initials: Compiled[] = optimizer.state.map((entry) => compileExpr(entry.initial, indices));
  const lookAt = compileExpr(optimizer.gradientAt, indices);
  const lines = optimizer.update.map((line) => ({ at: stateIds.indexOf(line.of), next: compileExpr(line.next, indices) }));
  const positionAt = stateIds.indexOf(optimizer.position);
  const [lowX, lowY] = lowestOf(surface);
  const description = deepFreeze(describeLandscape(spec));
  const [startX, startY] = surface.start;

  const hyperOf = (params: LandscapeParams): Float64Array => Float64Array.from(hyperIds, (id) => params[id] as number);
  const vectorOf = (values: Readonly<Record<string, number>>, step: number): Float64Array => {
    const vector = new Float64Array(stateIds.length + 2);
    stateIds.forEach((id, index) => (vector[index] = values[id] as number));
    vector[stateIds.length + 1] = step;
    return vector;
  };
  const valuesOf = (vector: Float64Array): Readonly<Record<string, number>> => Object.freeze(Object.fromEntries(stateIds.map((id, index) => [id, vector[index] as number])));
  const finite = (values: Readonly<Record<string, number>>, coordinate: string, step: number): void => {
    for (const [id, value] of Object.entries(values)) {
      if (!Number.isFinite(value)) throw new RangeError(`${id} in the ${coordinate} coordinate would become ${value} at step ${step}, not a finite number, so the step is refused`);
    }
  };

  const paramSchema: z.ZodType<LandscapeParams> = z.strictObject(shapeOf(description.variables));
  const coordinateSchema = z.strictObject(Object.fromEntries(stateIds.map((id) => [id, z.number()])));
  const stateSchema: z.ZodType<LandscapeState> = z.strictObject({ stepIndex: z.int().nonnegative(), x: coordinateSchema, y: coordinateSchema, moved: z.number().nonnegative() });

  return Object.freeze({
    id: "learning.landscape",
    version: "1.0.0",
    family: "learning",
    chance: false,
    fixedTimestep: 1,
    time: Object.freeze({ unit: "step", perWatchSecond: showing.perWatchSecond }),
    space: Object.freeze({ kind: "surface2d" }),
    paramSchema,
    stateSchema,
    spec,
    init(params: LandscapeParams, seed: number): LandscapeState {
      // Nothing in the toy is random, so the seed changes nothing; it is still checked, so a run
      // record's seed means the same for every primitive.
      assertSeed(seed);
      const hyper = hyperOf(params);
      const none = new Float64Array(stateIds.length + 2);
      const start = (value: number): Readonly<Record<string, number>> => {
        const vector = Float64Array.from(initials, (initial) => initial(none, hyper));
        vector[positionAt] = value;
        return valuesOf(vector);
      };
      const x = start(params[startX.id] as number);
      const y = start(params[startY.id] as number);
      finite(x, "first", 0);
      finite(y, "second", 0);
      return Object.freeze({ stepIndex: 0, x, y, moved: 0 });
    },
    step(state: LandscapeState, params: LandscapeParams, dt: number): LandscapeState {
      if (dt !== 1) throw new RangeError(`an update rule moves in whole steps, one at a time, got a step of ${dt}`);
      const hyper = hyperOf(params);
      const step = state.stepIndex + 1;
      const vx = vectorOf(state.x, step);
      const vy = vectorOf(state.y, step);
      // The gradient where the rule says, for both coordinates at once, before any line runs.
      const [gx, gy] = gradientAt(surface, lookAt(vx, hyper), lookAt(vy, hyper));
      vx[stateIds.length] = gx;
      vy[stateIds.length] = gy;
      const beforeX = vx[positionAt] as number;
      const beforeY = vy[positionAt] as number;
      for (const vector of [vx, vy]) {
        for (const line of lines) vector[line.at] = line.next(vector, hyper);
      }
      const x = valuesOf(vx);
      const y = valuesOf(vy);
      finite(x, "first", step);
      finite(y, "second", step);
      return Object.freeze({ stepIndex: step, x, y, moved: Math.hypot((vx[positionAt] as number) - beforeX, (vy[positionAt] as number) - beforeY) });
    },
    measure(state: LandscapeState): LandscapeObservables {
      const x = state.x[optimizer.position] as number;
      const y = state.y[optimizer.position] as number;
      return Object.freeze({ loss: lossAt(surface, x, y), distance: Math.hypot(x - lowX, y - lowY), x, y, moved: state.moved });
    },
    describe: (): PrimitiveDescription => description,
  });
}
