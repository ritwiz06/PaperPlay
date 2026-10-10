import { z } from "zod";
import { Origin } from "./provenance.ts";
import { TimeUnit } from "./time.ts";
import { AnchorRef } from "./worldspec.ts";

// A compartment model as data (docs/design/every-paper.md §2.2): every equation is an expression
// tree over a closed grammar, and one trusted solver, compartments.ode, runs it. No model is
// code, and no string is ever evaluated, so a new model needs no pull request, only its checks.
// Everything a spec can be wrong about on its own is refined here; units are checked
// dimensionally, and the family's numerical checks run, in the primitive (packages/primitives/
// src/compartments/MODEL.md), because both need more than the spec's shape.

/** The base dimensions a unit is built from. `time` is counted in the model's own time unit. */
export const Dimension = z.enum(["people", "cells", "molecules", "length", "mass", "time"]);
export type Dimension = z.infer<typeof Dimension>;

const Exponent = z.int().min(-4).max(4).refine((exponent) => exponent !== 0, { error: "leave a zero exponent out" });

/** A unit as whole-number powers of the base dimensions: { people: 1, time: -1 } is people per unit of time, and {} is dimensionless. */
export const Unit = z.strictObject({
  people: Exponent.optional(),
  cells: Exponent.optional(),
  molecules: Exponent.optional(),
  length: Exponent.optional(),
  mass: Exponent.optional(),
  time: Exponent.optional(),
});
export type Unit = z.infer<typeof Unit>;

/** A compartment's, parameter's or observable's id: camelCase like a primitive's parameter name, so an action can target it. */
const Name = z.string().regex(/^[a-z][a-zA-Z0-9]*$/, "must be a camelCase name");

/**
 * One node of an expression tree: a finite number, a parameter, a compartment, or one of eight
 * operations. The grammar is closed: no other operation, no string that is evaluated, and no
 * time input, so nothing outside the model can drive it.
 */
export type Expr =
  | { n: number }
  | { p: string }
  | { c: string }
  | { op: "add" | "mul"; args: Expr[] }
  | { op: "sub" | "div" | "pow"; a: Expr; b: Expr }
  | { op: "neg" | "exp" | "log"; a: Expr };

/** At most this many compartments and parameters; in each expression, at most this many nodes and this depth (a lone number has depth 1). */
export const MODEL_LIMITS = Object.freeze({ compartments: 24, parameters: 32, nodes: 400, depth: 24 });

const ExprNode: z.ZodType<Expr> = z.lazy(() =>
  z.union([
    z.strictObject({ n: z.number() }),
    z.strictObject({ p: Name }),
    z.strictObject({ c: Name }),
    z.discriminatedUnion("op", [
      z.strictObject({ op: z.enum(["add", "mul"]), args: z.array(ExprNode).min(2) }),
      z.strictObject({ op: z.enum(["sub", "div", "pow"]), a: ExprNode, b: ExprNode }),
      z.strictObject({ op: z.enum(["neg", "exp", "log"]), a: ExprNode }),
    ]),
  ]),
);

/** Whether a value nests objects and arrays more than `limit` deep, found with a stack of its own rather than by recursion. */
function nestsDeeperThan(value: unknown, limit: number): boolean {
  const stack: [unknown, number][] = [[value, 1]];
  while (stack.length > 0) {
    const [item, depth] = stack.pop() as [unknown, number];
    if (typeof item !== "object" || item === null) continue;
    if (depth > limit) return true;
    for (const child of Object.values(item)) stack.push([child, depth + 1]);
  }
  return false;
}

// The recursive parse would overflow the call stack on a hostile tree a thousand deep, and
// throw instead of reporting. So the tree's nesting is measured first, without recursion, and
// one that could not be within MODEL_LIMITS.depth is refused before it is descended into. A
// tree of depth d nests at most 2d − 1 deep as JSON (an add's arguments sit in an array), so a
// limit of twice the depth turns away nothing the depth check below would accept.
export const Expr: z.ZodType<Expr> = z
  .unknown()
  .check((ctx) => {
    if (nestsDeeperThan(ctx.value, 2 * MODEL_LIMITS.depth)) {
      ctx.issues.push({ code: "custom", message: `an expression nests at most ${MODEL_LIMITS.depth} deep`, input: ctx.value });
    }
  })
  .pipe(ExprNode);

export const ModelCompartment = z.strictObject({
  id: Name,
  name: z.string().min(1),
  unit: Unit,
  /** Its value at time 0, made of parameters and numbers only. */
  initial: Expr,
  /** The model never lets it go below zero, as with a count or a concentration; the positivity check holds the solver to that. */
  nonNegative: z.boolean(),
  anchors: z.array(AnchorRef),
});
export type ModelCompartment = z.infer<typeof ModelCompartment>;

export const ModelParameter = z
  .strictObject({
    id: Name,
    /** How the paper writes it, such as "β" or "k_on". */
    symbol: z.string().min(1),
    name: z.string().min(1),
    unit: Unit,
    range: z.tuple([z.number(), z.number()]),
    defaultValue: z.number(),
    origin: Origin,
    anchors: z.array(AnchorRef),
  })
  .refine((parameter) => parameter.range[0] < parameter.range[1], {
    error: "range must be [min, max] with min below max",
    path: ["range"],
  })
  .refine((parameter) => parameter.defaultValue >= parameter.range[0] && parameter.defaultValue <= parameter.range[1], {
    error: "defaultValue must lie within range",
    path: ["defaultValue"],
  })
  .refine((parameter) => parameter.origin !== "paper-derived" || parameter.anchors.length > 0, {
    error: "a paper-derived parameter needs at least one anchor",
    path: ["anchors"],
  });
export type ModelParameter = z.infer<typeof ModelParameter>;

/** d(of)/dt = rate: one per compartment, anchored to the paper's own equation. */
export const ModelEquation = z.strictObject({ of: Name, rate: Expr, anchors: z.array(AnchorRef).min(1) });
export type ModelEquation = z.infer<typeof ModelEquation>;

/** A quantity the paper states is conserved, such as S + I + R. Only those it states. */
export const ModelInvariant = z.strictObject({ kind: z.literal("conserved"), expr: Expr, anchors: z.array(AnchorRef).min(1) });
export type ModelInvariant = z.infer<typeof ModelInvariant>;

/** A steady state the paper gives: every compartment's value there, as an expression of the parameters. */
export const ModelSteadyState = z.strictObject({ label: z.string().min(1), at: z.record(Name, Expr), anchors: z.array(AnchorRef).min(1) });
export type ModelSteadyState = z.infer<typeof ModelSteadyState>;

/** What a learner watches: made of compartments and numbers only, because a primitive's measure sees the state and no parameters. */
export const ModelObservable = z.strictObject({ id: Name, label: z.string().min(1), expr: Expr, unit: Unit });
export type ModelObservable = z.infer<typeof ModelObservable>;

export const ModelSolver = z.strictObject({
  /** The solver's fixed step, in the model's time unit. */
  dt: z.number().positive(),
  /** The accuracy check's tolerance: halving the step may move a compartment by at most this fraction of its scale. */
  tolerance: z.number().positive(),
});
export type ModelSolver = z.infer<typeof ModelSolver>;

type Path = (string | number)[];

/** Visits every node of an expression, depth first and in order, with its path and its depth (the root's is 1). */
function walk(expr: Expr, path: Path, visit: (node: Expr, path: Path, depth: number) => void, depth = 1): void {
  visit(expr, path, depth);
  if ("args" in expr) expr.args.forEach((arg, index) => walk(arg, [...path, "args", index], visit, depth + 1));
  else if ("op" in expr) {
    walk(expr.a, [...path, "a"], visit, depth + 1);
    if ("b" in expr) walk(expr.b, [...path, "b"], visit, depth + 1);
  }
}

/** What one kind of expression may read, and how its issues name it. */
interface Context {
  readonly parameters: boolean;
  readonly compartments: boolean;
  readonly what: string;
}

const INITIAL: Context = { parameters: true, compartments: false, what: "an initial value is made of parameters and numbers" };
const RATE: Context = { parameters: true, compartments: true, what: "a rate" };
const INVARIANT: Context = { parameters: true, compartments: true, what: "an invariant" };
const STEADY: Context = { parameters: true, compartments: false, what: "a steady state's value is made of parameters and numbers" };
const OBSERVED: Context = { parameters: false, compartments: true, what: "an observable is made of compartments and numbers, since measuring sees only the state" };

export const ModelSpec = z
  .strictObject({
    timeUnit: TimeUnit,
    compartments: z.array(ModelCompartment).min(1).max(MODEL_LIMITS.compartments),
    parameters: z.array(ModelParameter).max(MODEL_LIMITS.parameters),
    equations: z.array(ModelEquation),
    invariants: z.array(ModelInvariant),
    steadyStates: z.array(ModelSteadyState),
    observables: z.array(ModelObservable).min(1),
    solver: ModelSolver,
  })
  .check((ctx) => {
    const spec = ctx.value;
    const issue = (message: string, input: unknown, path: Path): void => void ctx.issues.push({ code: "custom", message, input, path });

    // One namespace for all three: an expression's name, an action's target and a metric each mean one thing.
    const seen = new Set<string>();
    for (const list of ["compartments", "parameters", "observables"] as const) {
      spec[list].forEach((item, index) => {
        if (seen.has(item.id)) issue(`id ${item.id} is used twice`, item.id, [list, index, "id"]);
        seen.add(item.id);
      });
    }

    const compartments = new Set(spec.compartments.map((compartment) => compartment.id));
    const parameters = new Set(spec.parameters.map((parameter) => parameter.id));

    spec.equations.forEach((equation, index) => {
      if (!compartments.has(equation.of)) issue(`there is no compartment ${equation.of} for this equation to govern`, equation.of, ["equations", index, "of"]);
      else if (spec.equations.findIndex((other) => other.of === equation.of) !== index) {
        issue(`compartment ${equation.of} already has an equation`, equation.of, ["equations", index, "of"]);
      }
    });
    spec.compartments.forEach((compartment, index) => {
      if (!spec.equations.some((equation) => equation.of === compartment.id)) issue(`compartment ${compartment.id} has no equation`, compartment.id, ["compartments", index, "id"]);
    });

    const expression = (expr: Expr, path: Path, context: Context): void => {
      let nodes = 0;
      let depth = 0;
      walk(expr, path, (node, at, level) => {
        nodes++;
        depth = Math.max(depth, level);
        if ("p" in node) {
          if (!context.parameters) issue(`${context.what}, so it cannot read parameter ${node.p}`, node.p, [...at, "p"]);
          else if (!parameters.has(node.p)) issue(`there is no parameter ${node.p}`, node.p, [...at, "p"]);
        } else if ("c" in node) {
          if (!context.compartments) issue(`${context.what}, so it cannot read compartment ${node.c}`, node.c, [...at, "c"]);
          else if (!compartments.has(node.c)) issue(`there is no compartment ${node.c}`, node.c, [...at, "c"]);
        }
      });
      if (nodes > MODEL_LIMITS.nodes) issue(`an expression has at most ${MODEL_LIMITS.nodes} nodes, and this one has ${nodes}`, nodes, path);
      if (depth > MODEL_LIMITS.depth) issue(`an expression nests at most ${MODEL_LIMITS.depth} deep, and this one nests ${depth}`, depth, path);
    };

    spec.compartments.forEach((compartment, index) => expression(compartment.initial, ["compartments", index, "initial"], INITIAL));
    spec.equations.forEach((equation, index) => expression(equation.rate, ["equations", index, "rate"], RATE));
    spec.invariants.forEach((invariant, index) => expression(invariant.expr, ["invariants", index, "expr"], INVARIANT));
    spec.steadyStates.forEach((steady, index) => {
      for (const [id, value] of Object.entries(steady.at)) {
        if (compartments.has(id)) expression(value, ["steadyStates", index, "at", id], STEADY);
        else issue(`there is no compartment ${id}`, id, ["steadyStates", index, "at", id]);
      }
      spec.compartments.forEach((compartment) => {
        if (!Object.hasOwn(steady.at, compartment.id)) issue(`the steady state gives no value for compartment ${compartment.id}`, steady.at, ["steadyStates", index, "at"]);
      });
    });
    spec.observables.forEach((observable, index) => expression(observable.expr, ["observables", index, "expr"], OBSERVED));
  });
export type ModelSpec = z.infer<typeof ModelSpec>;
