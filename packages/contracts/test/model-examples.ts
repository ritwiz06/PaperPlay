// Valid example models for contract tests. Synthetic on purpose: a textbook SIR model whose
// anchors point at the same made-up source as examples.ts, quoting no real paper.
import { anchor } from "./examples.ts";

export const n = (value: number) => ({ n: value });
export const p = (id: string) => ({ p: id });
export const c = (id: string) => ({ c: id });
export const neg = (a: unknown) => ({ op: "neg", a });

/** β s i / N: the rate of new infections. */
export const infection = () => ({ op: "div", a: { op: "mul", args: [p("beta"), c("s"), c("i")] }, b: p("population") });

type Loose = Record<string, unknown>;

/** A model as a test hands it to the schema: plain objects any test may change. */
export interface ModelInput {
  timeUnit: string;
  compartments: Loose[];
  parameters: Loose[];
  equations: Loose[];
  invariants: Loose[];
  steadyStates: Loose[];
  observables: Loose[];
  solver: Loose;
}

export function parameter(id: string, overrides: Loose = {}): Loose {
  return {
    id,
    symbol: id,
    name: `The parameter ${id}`,
    unit: {},
    range: [0, 1],
    defaultValue: 0.5,
    origin: "teaching-choice",
    anchors: [],
    ...overrides,
  };
}

/** ds/dt = −β s i / N, di/dt = β s i / N − γ i, dr/dt = γ i, in people, over days. */
export function sirModel(): ModelInput {
  return {
    timeUnit: "day",
    compartments: [
      { id: "s", name: "Susceptible", unit: { people: 1 }, initial: { op: "sub", a: p("population"), b: p("seeded") }, nonNegative: true, anchors: [] },
      { id: "i", name: "Infectious", unit: { people: 1 }, initial: p("seeded"), nonNegative: true, anchors: [] },
      { id: "r", name: "Recovered", unit: { people: 1 }, initial: n(0), nonNegative: true, anchors: [] },
    ],
    parameters: [
      parameter("beta", { symbol: "β", name: "Transmission rate", unit: { time: -1 }, range: [0, 2], defaultValue: 0.4, origin: "paper-derived", anchors: [anchor()] }),
      parameter("gamma", { symbol: "γ", name: "Recovery rate", unit: { time: -1 }, range: [0.01, 1], defaultValue: 0.2, origin: "paper-derived", anchors: [anchor()] }),
      parameter("population", { symbol: "N", name: "Population", unit: { people: 1 }, range: [1, 1e6], defaultValue: 1000 }),
      parameter("seeded", { symbol: "I₀", name: "Infectious at the start", unit: { people: 1 }, range: [0, 100], defaultValue: 1 }),
    ],
    equations: [
      { of: "s", rate: neg(infection()), anchors: [anchor()] },
      { of: "i", rate: { op: "sub", a: infection(), b: { op: "mul", args: [p("gamma"), c("i")] } }, anchors: [anchor()] },
      { of: "r", rate: { op: "mul", args: [p("gamma"), c("i")] }, anchors: [anchor()] },
    ],
    invariants: [{ kind: "conserved", expr: { op: "add", args: [c("s"), c("i"), c("r")] }, anchors: [anchor()] }],
    steadyStates: [{ label: "No infection", at: { s: p("population"), i: n(0), r: n(0) }, anchors: [anchor()] }],
    observables: [
      { id: "infectious", label: "People infectious", expr: c("i"), unit: { people: 1 } },
      { id: "infectiousShare", label: "Share of people infectious", expr: { op: "div", a: c("i"), b: { op: "add", args: [c("s"), c("i"), c("r")] } }, unit: {} },
    ],
    solver: { dt: 0.1, tolerance: 1e-6 },
  };
}

/** `count` compartments x0, x1, …, each decaying on its own: dxⱼ/dt = −xⱼ, from 1. */
export function decayChain(count: number): ModelInput {
  const ids = Array.from({ length: count }, (_, index) => `x${index}`);
  return {
    ...sirModel(),
    compartments: ids.map((id) => ({ id, name: `Store ${id}`, unit: {}, initial: n(1), nonNegative: true, anchors: [] })),
    parameters: [],
    equations: ids.map((id) => ({ of: id, rate: neg(c(id)), anchors: [anchor()] })),
    invariants: [],
    steadyStates: [],
    observables: [{ id: "first", label: "The first store", expr: c("x0"), unit: {} }],
  };
}
