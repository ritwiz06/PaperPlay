import type { EntityEdit, EntityKind, FamilyId, SpaceKind, TimeUnit } from "@paperplay/contracts";
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

/** How a primitive's time runs: the unit its steps are counted in, and how fast a learner watches it. */
export interface PrimitiveTime {
  readonly unit: TimeUnit;
  /**
   * How much model time one second of watching shows at 1x: 1 for the flock, whose seconds play
   * at the wall clock's pace, and so many days a second for an epidemic.
   */
  readonly perWatchSecond: number;
}

/** The space a primitive's world lies in, naming the variables that size it. */
export type PrimitiveSpace =
  | { readonly kind: Extract<SpaceKind, "torus2d">; readonly width: string; readonly height: string }
  | { readonly kind: Extract<SpaceKind, "surface2d"> }
  | { readonly kind: Extract<SpaceKind, "none"> };

/** Something a learner can place in a primitive's world. */
export interface EntityDescription {
  readonly meaning: string;
}

/**
 * A deterministic, fixed-step scientific model. `init` and `step` are pure: the same
 * inputs give the same outputs bit for bit, with no clock, no unseeded randomness and
 * no mutation of their arguments. Renderers only read the states these return.
 */
export interface Primitive<P, S, O extends Record<string, number> = Record<string, number>> {
  readonly id: string;
  readonly version: string;
  /** The family it belongs to (`FAMILIES` in contracts), whose checks and labels it carries. */
  readonly family: FamilyId;
  /**
   * Whether a run draws on its seed. A primitive that never does says so, and the level rule then
   * varies its worlds over a neighbourhood where its family allows (ADR-0046). Absent means it does.
   */
  readonly chance?: boolean;
  /** Model time per step, in `time.unit`; a render loop takes this many steps whatever its frame rate. */
  readonly fixedTimestep: number;
  readonly time: PrimitiveTime;
  readonly space: PrimitiveSpace;
  /** What a learner can place in its world, by kind. Absent when nothing can be placed. */
  readonly entities?: Readonly<Partial<Record<EntityKind, EntityDescription>>>;
  /**
   * Read-only questions a scene kit asks of a state, by name, such as which birds a bird sees.
   * A query changes nothing, so it never changes a version.
   */
  readonly queries?: Readonly<Record<string, (...args: never[]) => unknown>>;
  /** Allowed parameters and their ranges. An Action may only target a key of this schema. */
  readonly paramSchema: z.ZodType<P>;
  /** Validates a state read back from JSON, e.g. a RunRecord's initialState. */
  readonly stateSchema: z.ZodType<S>;
  init(params: P, seed: number): S;
  step(state: S, params: P, dt: number): S;
  measure(state: S): O;
  describe(): PrimitiveDescription;
  /** Places or removes a named entity. Pure. Primitives without placeable entities leave it out. */
  apply?(state: S, edit: EntityEdit): S;
}

/** A primitive whose worlds hold entities a learner can place and remove. */
export type EditablePrimitive<P, S, O extends Record<string, number> = Record<string, number>> = Primitive<P, S, O> & {
  apply(state: S, edit: EntityEdit): S;
};
