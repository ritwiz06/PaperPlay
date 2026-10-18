import type { DescentSpec, Expr } from "@paperplay/contracts";

// Update rules as data, for the learning family's tests (ADR-0047): plain gradient descent, and
// momentum with a lookahead λ, classical at λ = 0 and Nesterov's at λ = 1, as Sutskever et al.
// 2013 write both. Each line is an expression in the closed grammar, never code.

const hyper = (id: string, symbol: string, name: string, range: [number, number], defaultValue: number) => ({ id, symbol, name, unit: {}, range, defaultValue, origin: "teaching-choice" as const, anchors: [] });
const start = (id: string, value: number) => hyper(id, id, `Where the ${id === "x0" ? "first" : "second"} coordinate starts`, [-10, 10], value);
const anchor = [{ placeholder: true as const, sourceId: "sutskever2013", need: "The paper's equation." }];
const c = (name: string): Expr => ({ c: name });
const p = (name: string): Expr => ({ p: name });
const mul = (...args: Expr[]): Expr => ({ op: "mul", args });

export const GRADIENT_DESCENT = {
  name: "plain gradient descent",
  state: [{ id: "theta", symbol: "θ", name: "Position", initial: { n: 0 }, anchors: [] }],
  position: "theta",
  hyperparameters: [hyper("eps", "ε", "Learning rate", [0, 10], 0.1)],
  gradientAt: c("theta"),
  update: [{ of: "theta", next: { op: "sub", a: c("theta"), b: mul(p("eps"), c("g")) }, anchors: anchor }],
} satisfies DescentSpec["optimizer"];

/** v ← μ·v − ε·∇f(θ + λ·μ·v), then θ ← θ + v. */
export const MOMENTUM = {
  name: "momentum",
  state: [
    { id: "theta", symbol: "θ", name: "Position", initial: { n: 0 }, anchors: [] },
    { id: "v", symbol: "v", name: "Velocity", initial: { n: 0 }, anchors: [] },
  ],
  position: "theta",
  hyperparameters: [hyper("eps", "ε", "Learning rate", [0, 10], 0.1), hyper("mu", "μ", "Momentum", [0, 0.999], 0.9), hyper("lookahead", "λ", "Lookahead", [0, 1], 0)],
  gradientAt: { op: "add", args: [c("theta"), mul(p("lookahead"), p("mu"), c("v"))] },
  update: [
    { of: "v", next: { op: "sub", a: mul(p("mu"), c("v")), b: mul(p("eps"), c("g")) }, anchors: anchor },
    { of: "theta", next: { op: "add", args: [c("theta"), c("v")] }, anchors: anchor },
  ],
} satisfies DescentSpec["optimizer"];

export interface SurfaceNumbers {
  readonly hx: number;
  readonly hy: number;
  readonly cx: number;
  readonly cy: number;
  readonly gx: number;
  readonly gy: number;
}

/** A rule on a quadratic surface, starting at (x0, y0). */
export function descent(rule: "gd" | "momentum" | "nesterov", surface: SurfaceNumbers, from: readonly [number, number]): DescentSpec {
  return {
    optimizer: rule === "gd" ? GRADIENT_DESCENT : MOMENTUM,
    surface: { kind: "quadratic", name: "a test surface", ...surface, extent: { x: [-10, 10], y: [-10, 10] }, start: [start("x0", from[0]), start("y0", from[1])], origin: "teaching-choice", anchors: [] },
  };
}

/** A rule's parameters: its hyperparameters, the lookahead set by the rule's name, and its start. */
export function paramsOf(rule: "gd" | "momentum" | "nesterov", hyperparameters: Readonly<Record<string, number>>, from: readonly [number, number]): Record<string, number> {
  return { ...(rule === "gd" ? {} : { lookahead: rule === "nesterov" ? 1 : 0 }), ...hyperparameters, x0: from[0], y0: from[1] };
}
