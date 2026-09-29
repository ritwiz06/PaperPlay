import type { z } from "zod";

/** One parameter a primitive accepts, described for learners, the Planner and the builder. */
export interface VariableDescription {
  readonly unit: string;
  readonly meaning: string;
  readonly range: readonly [number, number];
  readonly defaultValue: number;
  /** "init" variables shape the initial state; "live" ones may change between steps. */
  readonly phase: "init" | "live";
  readonly integer: boolean;
}

export interface ObservableDescription {
  readonly unit: string;
  readonly meaning: string;
}

export interface PrimitiveDescription {
  readonly variables: Readonly<Record<string, VariableDescription>>;
  readonly observables: Readonly<Record<string, ObservableDescription>>;
  readonly assumptions: readonly string[];
}

/**
 * A deterministic, fixed-step scientific model. `init` and `step` are pure: the same
 * inputs give the same outputs bit for bit, with no clock, no unseeded randomness and
 * no mutation of their arguments. Renderers only read the states these return.
 */
export interface Primitive<P, S, O extends Record<string, number> = Record<string, number>> {
  readonly id: string;
  readonly version: string;
  /** Seconds per step; a render loop takes this many steps whatever its frame rate. */
  readonly fixedTimestep: number;
  /** Allowed parameters and their ranges. An Action may only target a key of this schema. */
  readonly paramSchema: z.ZodType<P>;
  init(params: P, seed: number): S;
  step(state: S, params: P, dt: number): S;
  measure(state: S): O;
  describe(): PrimitiveDescription;
}
