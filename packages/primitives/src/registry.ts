import type { ModelSpec, PrimitiveRef } from "@paperplay/contracts";
import { flockPlanarWeighted } from "./agents/flock/index.ts";
import { compartmentsOde } from "./compartments/index.ts";
import type { ModelShowing } from "./compartments/primitive.ts";
import type { Primitive } from "./types.ts";

/**
 * A solver: one trusted primitive that runs any model given as data, such as compartments.ode.
 * A model is never code; binding it checks it and gives the primitive that runs it.
 */
export interface Solver {
  readonly id: string;
  readonly version: string;
  /** The primitive for one model; a RangeError when the model cannot run, such as when its units disagree. */
  bind(model: ModelSpec, showing: ModelShowing): Primitive<unknown, unknown>;
}

export interface PrimitiveRegistry {
  has(ref: PrimitiveRef): boolean;
  get(ref: PrimitiveRef): Primitive<unknown, unknown> | undefined;
  list(): PrimitiveRef[];
  /** The solver at this exact id and version, for a world whose binding gives its model as data. */
  solver(ref: PrimitiveRef): Solver | undefined;
  solvers(): PrimitiveRef[];
}

/** Primitives and solvers are looked up by exact id and version; there is no "latest". */
export function createRegistry(primitives: readonly Primitive<unknown, unknown>[], solvers: readonly Solver[] = []): PrimitiveRegistry {
  const byKey = new Map<string, Primitive<unknown, unknown>>();
  const solverByKey = new Map<string, Solver>();
  const keyOf = (ref: PrimitiveRef): string => `${ref.id}@${ref.version}`;
  for (const primitive of primitives) {
    const key = keyOf(primitive);
    if (byKey.has(key)) throw new Error(`primitive ${key} is already registered`);
    byKey.set(key, primitive);
  }
  for (const solver of solvers) {
    const key = keyOf(solver);
    if (byKey.has(key) || solverByKey.has(key)) throw new Error(`solver ${key} is already registered`);
    solverByKey.set(key, solver);
  }
  return {
    has: (ref) => byKey.has(keyOf(ref)),
    get: (ref) => byKey.get(keyOf(ref)),
    list: () => [...byKey.values()].map(({ id, version }) => ({ id, version })),
    solver: (ref) => solverByKey.get(keyOf(ref)),
    solvers: () => [...solverByKey.values()].map(({ id, version }) => ({ id, version })),
  };
}

/** Adding a primitive or a solver here requires an ADR. */
export const registry: PrimitiveRegistry = createRegistry([flockPlanarWeighted], [compartmentsOde]);
