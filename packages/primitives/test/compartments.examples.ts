// Small hand-built models for the compartments.ode tests. Synthetic: none comes from a paper,
// so every anchor is a placeholder saying so.
import type { Expr, ModelSpec, Unit } from "@paperplay/contracts";

export const n = (value: number): Expr => ({ n: value });
export const p = (id: string): Expr => ({ p: id });
export const c = (id: string): Expr => ({ c: id });
export const add = (...args: Expr[]): Expr => ({ op: "add", args });
export const mul = (...args: Expr[]): Expr => ({ op: "mul", args });
export const sub = (a: Expr, b: Expr): Expr => ({ op: "sub", a, b });
export const div = (a: Expr, b: Expr): Expr => ({ op: "div", a, b });
export const pow = (a: Expr, b: Expr): Expr => ({ op: "pow", a, b });
export const neg = (a: Expr): Expr => ({ op: "neg", a });
export const exp = (a: Expr): Expr => ({ op: "exp", a });
export const log = (a: Expr): Expr => ({ op: "log", a });

const anchors = [{ placeholder: true as const, sourceId: "tests", need: "None: a hand-built test model, taken from no paper." }];

export function parameter(id: string, unit: Unit, range: [number, number], defaultValue: number, symbol = id, name = `The parameter ${id}`): ModelSpec["parameters"][number] {
  return { id, symbol, name, unit, range, defaultValue, origin: "teaching-choice", anchors: [] };
}

export function compartment(id: string, unit: Unit, initial: Expr, name = id, nonNegative = true): ModelSpec["compartments"][number] {
  return { id, name, unit, initial, nonNegative, anchors: [] };
}

/** A model with the given parts; equations are { compartment id: rate }, every observable defaults to the first compartment. */
export function model(parts: {
  timeUnit?: ModelSpec["timeUnit"];
  compartments: ModelSpec["compartments"];
  parameters?: ModelSpec["parameters"];
  rates: Record<string, Expr>;
  invariants?: Expr[];
  steadyStates?: { label: string; at: Record<string, Expr> }[];
  observables?: ModelSpec["observables"];
  dt?: number;
  tolerance?: number;
}): ModelSpec {
  const first = parts.compartments[0];
  return {
    timeUnit: parts.timeUnit ?? "day",
    compartments: parts.compartments,
    parameters: parts.parameters ?? [],
    equations: Object.entries(parts.rates).map(([of, rate]) => ({ of, rate, anchors })),
    invariants: (parts.invariants ?? []).map((expr) => ({ kind: "conserved" as const, expr, anchors })),
    steadyStates: (parts.steadyStates ?? []).map((steady) => ({ ...steady, anchors })),
    observables: parts.observables ?? [{ id: "first", label: first?.name ?? "First", expr: c(first?.id ?? "x"), unit: first?.unit ?? {} }],
    solver: { dt: parts.dt ?? 0.1, tolerance: parts.tolerance ?? 1e-6 },
  };
}

const PEOPLE: Unit = { people: 1 };
const PER_DAY: Unit = { time: -1 };

/** β s i / N: the rate of new infections, in people per day. */
export const infection = (): Expr => div(mul(p("beta"), c("s"), c("i")), p("population"));

/** SIR in people: ds/dt = −βsi/N, di/dt = βsi/N − γi, dr/dt = γi. Its rates divide by a parameter, so they are not polynomials (P1). */
export function sirPeople(): ModelSpec {
  return model({
    compartments: [
      compartment("s", PEOPLE, sub(p("population"), p("seeded")), "Susceptible"),
      compartment("i", PEOPLE, p("seeded"), "Infectious"),
      compartment("r", PEOPLE, n(0), "Recovered"),
    ],
    parameters: [
      parameter("beta", PER_DAY, [0, 2], 0.4, "β", "Transmission rate"),
      parameter("gamma", PER_DAY, [0.01, 1], 0.2, "γ", "Recovery rate"),
      parameter("population", PEOPLE, [1, 1e6], 1000, "N", "Population"),
      parameter("seeded", PEOPLE, [0, 100], 1, "I₀", "Infectious at the start"),
    ],
    rates: { s: neg(infection()), i: sub(infection(), mul(p("gamma"), c("i"))), r: mul(p("gamma"), c("i")) },
    invariants: [add(c("s"), c("i"), c("r"))],
    steadyStates: [{ label: "No infection", at: { s: p("population"), i: n(0), r: n(0) } }],
    observables: [
      { id: "infectious", label: "People infectious", expr: c("i"), unit: PEOPLE },
      { id: "infectiousShare", label: "Share of people infectious", expr: div(c("i"), add(c("s"), c("i"), c("r"))), unit: {} },
    ],
  });
}

/** SIR as shares of one population: ds/dt = −βsi, di/dt = βsi − γi, dr/dt = γi. Every rate is a polynomial. */
export function sirShares(rates: Partial<Record<"s" | "i" | "r", Expr>> = {}, invariants: Expr[] = [add(c("s"), c("i"), c("r"))]): ModelSpec {
  return model({
    compartments: [compartment("s", {}, sub(n(1), p("seeded")), "Susceptible"), compartment("i", {}, p("seeded"), "Infectious"), compartment("r", {}, n(0), "Recovered")],
    parameters: [
      parameter("beta", PER_DAY, [0, 2], 0.4, "β", "Transmission rate"),
      parameter("gamma", PER_DAY, [0.01, 1], 0.2, "γ", "Recovery rate"),
      parameter("seeded", {}, [0, 0.1], 0.001, "i₀", "Share infectious at the start"),
    ],
    rates: { s: neg(mul(p("beta"), c("s"), c("i"))), i: sub(mul(p("beta"), c("s"), c("i")), mul(p("gamma"), c("i"))), r: mul(p("gamma"), c("i")), ...rates },
    invariants,
  });
}

/** dx/dt = −k x, in molecules over the given time unit. */
export function decay(k: number, dt: number, timeUnit: ModelSpec["timeUnit"] = "hour"): ModelSpec {
  return model({
    timeUnit,
    compartments: [compartment("x", { molecules: 1 }, p("dose"), "Drug")],
    parameters: [parameter("k", { time: -1 }, [0, 2 * k], k, "k", "Elimination rate"), parameter("dose", { molecules: 1 }, [0, 1e6], 1000, "x₀", "Starting amount")],
    rates: { x: neg(mul(p("k"), c("x"))) },
    dt,
  });
}

/** The parameters' defaults, as describe() gives them. */
export function defaults(spec: ModelSpec): Record<string, number> {
  return Object.fromEntries(spec.parameters.map((parameter) => [parameter.id, parameter.defaultValue]));
}

/** Freezes a plain-data tree, so any write to it throws in a module's strict code. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
