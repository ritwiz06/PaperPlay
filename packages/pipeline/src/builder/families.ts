/**
 * The family's own checks, which the builder runs on both worlds of every level's fork, over the
 * level's time (docs/design/every-paper.md §3.4). A family whose models are code (the agents
 * family's flock) is checked by its oracles and tests instead, and has none here. A reviewer
 * cannot overturn one of these.
 */
import type { Primitive } from "@paperplay/primitives";
import { accuracy, conservation, positivity, steadyStates, type CompartmentModel } from "@paperplay/primitives/compartments";

const isCompartmentModel = (primitive: Primitive<unknown, unknown>): primitive is CompartmentModel & Primitive<unknown, unknown> =>
  primitive.id === "compartments.ode" && "spec" in primitive;

/** What the family's checks find wrong with one world, run for `steps` steps, in plain words; empty when it passes. */
export function familyProblems(primitive: Primitive<unknown, unknown>, params: Readonly<Record<string, number>>, steps: number): string[] {
  if (!isCompartmentModel(primitive)) return [];
  const { spec } = primitive;
  return [
    ...accuracy(primitive, params, steps),
    ...positivity(primitive, params, steps),
    ...conservation(spec, primitive, params, steps).problems,
    ...steadyStates(spec, primitive, params),
  ].map((problem) => problem.message);
}
