import { z } from "zod";

// Primitive families (docs/design/every-paper.md §2.1, ADR-0024): a family is a set of trusted,
// deterministic primitives with the checks and labels that come with them. This is the
// catalogue, as data, so the builder, the router and the shell read one list.

export const FamilyId = z.enum(["agents", "compartments", "learning", "study-design", "grids", "networks"]);
export type FamilyId = z.infer<typeof FamilyId>;

/**
 * How the level rule varies a run (ADR-0018, ADR-0024): over seeds, for models with randomness;
 * over a neighbourhood of the paper's values, for models with none; over simulated cohorts, for
 * a study's design.
 */
export const Variation = z.enum(["seeds", "neighbourhood", "cohorts"]);
export type Variation = z.infer<typeof Variation>;

/** The kinds of space a primitive's world can have: a scene kit says which it draws. */
export const SpaceKind = z.enum(["torus2d", "surface2d", "none"]);
export type SpaceKind = z.infer<typeof SpaceKind>;

export interface Family {
  readonly id: FamilyId;
  /** The family in words. */
  readonly name: string;
  /** Shown on every world in the family and never dropped, when the family has one. */
  readonly label?: string;
  readonly variation: Variation;
  /**
   * How a world of the family with no chance in it is varied instead, when the family's toys may
   * or may not draw on chance: a learning toy on a noiseless surface moves its hyperparameters and
   * its starting point within a tenth, as a compartment model moves its parameters (ADR-0046).
   */
  readonly variationWithoutChance?: Variation;
  /**
   * Where a level's fork starts both worlds when its What-if changes only live variables: from the
   * moment it opens, for a model that keeps going, like a flock; or from the start, for one whose
   * run is a story with an end, like an epidemic, so the fork shows the difference the level
   * rule checked.
   */
  readonly forkFrom: "now" | "start";
}

export const FAMILIES: Readonly<Record<FamilyId, Family>> = Object.freeze({
  agents: Object.freeze({ id: "agents", name: "Agents that each follow local rules", variation: "seeds", forkFrom: "now" }),
  compartments: Object.freeze({ id: "compartments", name: "Compartment models, solved as equations", variation: "neighbourhood", forkFrom: "start" }),
  learning: Object.freeze({ id: "learning", name: "Learning toys", label: "miniature: the idea at toy scale", variation: "seeds", variationWithoutChance: "neighbourhood", forkFrom: "start" }),
  "study-design": Object.freeze({ id: "study-design", name: "A study's design", label: "a model of how the study was designed, not its data", variation: "cohorts", forkFrom: "start" }),
  grids: Object.freeze({ id: "grids", name: "Fields on a grid", variation: "neighbourhood", forkFrom: "start" }),
  networks: Object.freeze({ id: "networks", name: "Networks", variation: "seeds", forkFrom: "start" }),
});
