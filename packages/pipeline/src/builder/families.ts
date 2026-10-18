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

/**
 * The learning family's check (ADR-0047): the run stays finite over the level's time. A rule whose
 * step makes a value that is not a finite number is refused at that step, so a world that diverges
 * past what can be drawn is never built.
 */
function learningProblems(primitive: Primitive<unknown, unknown>, params: Readonly<Record<string, number>>, steps: number): string[] {
  try {
    let state = primitive.init(params, 0);
    for (let step = 0; step < steps; step++) state = primitive.step(state, params, primitive.fixedTimestep);
    return [];
  } catch (error) {
    if (error instanceof RangeError) return [error.message];
    throw error;
  }
}

/** What the family's checks find wrong with one world, run for `steps` steps, in plain words; empty when it passes. */
export function familyProblems(primitive: Primitive<unknown, unknown>, params: Readonly<Record<string, number>>, steps: number): string[] {
  if (primitive.family === "learning") return learningProblems(primitive, params, steps);
  if (!isCompartmentModel(primitive)) return [];
  const { spec } = primitive;
  return [
    ...accuracy(primitive, params, steps),
    ...positivity(primitive, params, steps),
    ...conservation(spec, primitive, params, steps).problems,
    ...steadyStates(spec, primitive, params),
  ].map((problem) => problem.message);
}
