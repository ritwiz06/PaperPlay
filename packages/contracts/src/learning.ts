import { z } from "zod";
import { Expr, ModelParameter } from "./model.ts";
import { ParameterName, PrimitiveRef } from "./primitive.ts";
import { Origin } from "./provenance.ts";
import { AnchorRef } from "./worldspec.ts";

// A learning toy as data (ADR-0046, ADR-0047): an optimizer's update rule, written in the same
// closed expression grammar as a compartment model, and the loss surface it runs on. No rule is
// code: one trusted primitive, learning.landscape, interprets any of them, the way
// compartments.ode solves any compartment model.

const Name = z.string().regex(/^[a-z][a-zA-Z0-9]*$/, "must be a camelCase name");

/** What an update rule reads beyond its own state and hyperparameters: the gradient where it is taken, and the step's number, from 1. */
export const RULE_READS = Object.freeze({ gradient: "g", step: "t" });

/** One number the rule keeps for each coordinate: the position itself, or state such as a velocity. */
export const OptimizerState = z.strictObject({
  id: Name,
  /** How the paper writes it, such as "θ" or "v". */
  symbol: z.string().min(1),
  name: z.string().min(1),
  /** Its value before the first step, made of hyperparameters and numbers. The position's is the surface's starting point instead. */
  initial: Expr,
  anchors: z.array(AnchorRef),
});
export type OptimizerState = z.infer<typeof OptimizerState>;

/** One line of the rule: a state's next value, in the paper's own equation. */
export const OptimizerUpdate = z.strictObject({ of: Name, next: Expr, anchors: z.array(AnchorRef).min(1) });
export type OptimizerUpdate = z.infer<typeof OptimizerUpdate>;

type Path = (string | number)[];

/** Every name an expression reads, with its path: parameters as `p`, everything else as `c`. */
function namesIn(expr: Expr, path: Path, found: { kind: "p" | "c"; name: string; path: Path }[] = []): { kind: "p" | "c"; name: string; path: Path }[] {
  if ("p" in expr) found.push({ kind: "p", name: expr.p, path });
  else if ("c" in expr) found.push({ kind: "c", name: expr.c, path });
  else if ("args" in expr) expr.args.forEach((arg, index) => namesIn(arg, [...path, "args", index], found));
  else if ("op" in expr) {
    namesIn(expr.a, [...path, "a"], found);
    if ("b" in expr) namesIn(expr.b, [...path, "b"], found);
  }
  return found;
}

/**
 * An optimizer's update rule, applied to each coordinate alike: where the gradient is taken, then
 * each state's next value in turn. A later line reads the values earlier lines gave in the same
 * step, as an algorithm written line by line does: v ← μv − εg, then θ ← θ + v.
 */
export const OptimizerSpec = z
  .strictObject({
    name: z.string().min(1).max(80),
    state: z.array(OptimizerState).min(1).max(8),
    /** The state that is the position on the surface. */
    position: Name,
    hyperparameters: z.array(ModelParameter).max(12),
    /** Where the gradient is taken: the position, or a point ahead of it, as in Nesterov's method. Made of state and hyperparameters. */
    gradientAt: Expr,
    update: z.array(OptimizerUpdate).min(1).max(8),
  })
  .check((ctx) => {
    const spec = ctx.value;
    const issue = (message: string, input: unknown, path: Path): void => void ctx.issues.push({ code: "custom", message, input, path });
    const states = new Set(spec.state.map((entry) => entry.id));
    const hyper = new Set(spec.hyperparameters.map((entry) => entry.id));
    const reserved = new Set<string>(Object.values(RULE_READS));
    spec.state.forEach((entry, index) => {
      if (reserved.has(entry.id)) issue(`${entry.id} is what the rule reads as the ${entry.id === RULE_READS.gradient ? "gradient" : "step's number"}, so no state may take it`, entry.id, ["state", index, "id"]);
      if (spec.state.findIndex((other) => other.id === entry.id) !== index) issue(`state ${entry.id} is named twice`, entry.id, ["state", index, "id"]);
      if (hyper.has(entry.id)) issue(`${entry.id} is both a state and a hyperparameter`, entry.id, ["state", index, "id"]);
    });
    spec.hyperparameters.forEach((entry, index) => {
      if (reserved.has(entry.id)) issue(`${entry.id} is reserved for what the rule reads`, entry.id, ["hyperparameters", index, "id"]);
      if (spec.hyperparameters.findIndex((other) => other.id === entry.id) !== index) issue(`hyperparameter ${entry.id} is named twice`, entry.id, ["hyperparameters", index, "id"]);
    });
    if (!states.has(spec.position)) issue(`the position, ${spec.position}, is not one of the rule's states`, spec.position, ["position"]);
    const reads = (expr: Expr, path: Path, allowed: { readonly states: boolean; readonly reads: boolean }, what: string): void => {
      for (const { kind, name, path: at } of namesIn(expr, path)) {
        if (kind === "p" && !hyper.has(name)) issue(`${what} names ${name}, which is not a hyperparameter`, name, at);
        if (kind === "c" && !(allowed.states && states.has(name)) && !(allowed.reads && reserved.has(name))) issue(`${what} cannot read ${name}`, name, at);
      }
    };
    spec.state.forEach((entry, index) => reads(entry.initial, ["state", index, "initial"], { states: false, reads: false }, "a starting value, made of hyperparameters and numbers,"));
    reads(spec.gradientAt, ["gradientAt"], { states: true, reads: false }, "where the gradient is taken");
    const updated = new Set<string>();
    spec.update.forEach((line, index) => {
      if (!states.has(line.of)) issue(`the rule updates ${line.of}, which is not one of its states`, line.of, ["update", index, "of"]);
      if (updated.has(line.of)) issue(`the rule updates ${line.of} twice in one step`, line.of, ["update", index, "of"]);
      updated.add(line.of);
      reads(line.next, ["update", index, "next"], { states: true, reads: true }, "an update");
    });
    if (!updated.has(spec.position)) issue("the rule never moves the position", spec.position, ["update"]);
  });
export type OptimizerSpec = z.infer<typeof OptimizerSpec>;

const Range = z.tuple([z.number(), z.number()]).refine(([low, high]) => low < high, { error: "must be [min, max] with min below max" });

/**
 * A loss surface over the plane, from the closed list the primitive differentiates exactly:
 * f(x, y) = ½·hx·(x − cx)² + ½·hy·(y − cy)² + gx·x + gy·y. Unequal curvatures make a ravine; a
 * zero curvature with a slope, a plain incline.
 */
export const SurfaceSpec = z.strictObject({
  kind: z.literal("quadratic"),
  /** The surface in words, for the journal. */
  name: z.string().min(1).max(120),
  hx: z.number().nonnegative(),
  hy: z.number().nonnegative(),
  cx: z.number(),
  cy: z.number(),
  gx: z.number(),
  gy: z.number(),
  /** The part of the plane a scene shows, which the visibility rule measures distances against. */
  extent: z.strictObject({ x: Range, y: Range }),
  /** The starting point, each coordinate a parameter a learner or the level rule may move. */
  start: z.tuple([ModelParameter, ModelParameter]),
  /** Whose the surface is: a toy's surface is a teaching choice unless the paper gives it. */
  origin: Origin,
  anchors: z.array(AnchorRef),
});
export type SurfaceSpec = z.infer<typeof SurfaceSpec>;

/** An update rule on a surface: what learning.landscape runs. */
export const DescentSpec = z
  .strictObject({ optimizer: OptimizerSpec, surface: SurfaceSpec })
  .check((ctx) => {
    const hyper = new Set(ctx.value.optimizer.hyperparameters.map((entry) => entry.id));
    ctx.value.surface.start.forEach((entry, index) => {
      if (hyper.has(entry.id)) ctx.issues.push({ code: "custom", message: `the starting point's ${entry.id} is also a hyperparameter`, input: entry.id, path: ["surface", "start", index, "id"] });
    });
  });
export type DescentSpec = z.infer<typeof DescentSpec>;

/** The learning family's binding: an update rule and its surface given as data, and the trusted primitive that runs it. */
export const UpdateRuleBinding = z.strictObject({
  type: z.literal("update-rule"),
  /** The primitive, such as learning.landscape@1.0.0. */
  solver: PrimitiveRef,
  model: DescentSpec,
  params: z.record(ParameterName, z.number()),
  /** How many steps a second of watching shows at 1x, a teaching choice. */
  perWatchSecond: z.number().positive(),
});
export type UpdateRuleBinding = z.infer<typeof UpdateRuleBinding>;
