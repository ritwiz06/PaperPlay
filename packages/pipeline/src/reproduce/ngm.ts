/**
 * The reproduction number of a compartment model, computed from its own equations (ADR-0040):
 * the next-generation matrix of van den Driessche and Watmough, built through our own code from the
 * transcribed system, never from the paper's formula, so the two can be compared.
 *
 * 1. Each rate is expanded exactly into terms (the solver's polynomial expansion). A transmission
 *    term is one that enters a compartment, is a product of at least two compartments, and leaves
 *    another compartment unchanged: `+β·S·I` in dI/dt with `−β·S·I` in dS/dt.
 * 2. The disease-free equilibrium: every compartment a transmission term enters or is made of, the
 *    source aside, set to none; the model run to rest, then settled by Newton's method.
 * 3. The infected compartments: those empty at that rest which new infections reach and which lead
 *    back to infecting. F holds the transmission terms' derivatives there, V the rest's, negated.
 * 4. R0 is the spectral radius of F·V⁻¹.
 *
 * A model this cannot read (a rate that is not a polynomial, no transmission term, no rest) is
 * refused, saying why.
 */
import type { ModelSpec } from "@paperplay/contracts";
import { differentiate, expand, formatPolynomial, type Polynomial, type Rational, type Term } from "@paperplay/primitives/compartments";
import { evaluate } from "./formula.ts";

export interface NextGeneration {
  /** The spectral radius of F·V⁻¹. */
  readonly r0: number;
  /** The compartments new infections enter or are made of, in the model's order. */
  readonly infected: readonly string[];
  /** The compartments transmission takes people from. */
  readonly sources: readonly string[];
  /** Each transmission term, written out: "beta1 × i × s". */
  readonly transmission: readonly string[];
  /** The disease-free equilibrium, by compartment. */
  readonly dfe: Readonly<Record<string, number>>;
}

export type NgmResult = { readonly ok: true; readonly value: NextGeneration } | { readonly ok: false; readonly reason: string };

const valueOf = (rational: Rational): number => Number(rational.num) / Number(rational.den);
const keyOf = (term: Term): string => term.factors.map((factor) => `${factor.symbol.kind}:${factor.symbol.id}^${factor.power}`).join("·");
const compartmentDegree = (term: Term): number => term.factors.filter((factor) => factor.symbol.kind === "c").reduce((total, factor) => total + factor.power, 0);

/** A polynomial's value with parameters and compartments given. */
function valueAt(polynomial: Polynomial, parameters: Readonly<Record<string, number>>, state: Readonly<Record<string, number>>): number {
  let total = 0;
  for (const term of polynomial.terms) {
    let product = valueOf(term.coefficient);
    for (const factor of term.factors) product *= ((factor.symbol.kind === "p" ? parameters[factor.symbol.id] : state[factor.symbol.id]) ?? Number.NaN) ** factor.power;
    total += product;
  }
  return total;
}

/** Solves A·x = b by Gaussian elimination with partial pivoting; null when A is singular. */
function solve(matrix: readonly (readonly number[])[], right: readonly number[]): number[] | null {
  const size = right.length;
  const rows = matrix.map((row, index) => [...row, right[index] ?? 0]);
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) if (Math.abs(rows[row]?.[column] ?? 0) > Math.abs(rows[pivot]?.[column] ?? 0)) pivot = row;
    const scale = Math.max(1e-300, ...rows.map((row) => Math.abs(row[column] ?? 0)));
    if (Math.abs(rows[pivot]?.[column] ?? 0) <= 1e-13 * scale) return null;
    [rows[column], rows[pivot]] = [rows[pivot] ?? [], rows[column] ?? []];
    const lead = rows[column] ?? [];
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const current = rows[row] ?? [];
      const factor = (current[column] ?? 0) / (lead[column] ?? 1);
      for (let k = column; k <= size; k++) current[k] = (current[k] ?? 0) - factor * (lead[k] ?? 0);
    }
  }
  return rows.map((row, index) => (row[size] ?? 0) / (row[index] ?? 1));
}

/** The largest eigenvalue of a non-negative matrix, by power iteration on K + I, whose dominant eigenvalue is ρ(K) + 1. */
function spectralRadius(matrix: readonly (readonly number[])[]): number {
  const size = matrix.length;
  let vector = new Array<number>(size).fill(1 / Math.sqrt(size));
  let estimate = 0;
  for (let iteration = 0; iteration < 20_000; iteration++) {
    const next = matrix.map((row, i) => row.reduce((total, entry, j) => total + entry * (vector[j] ?? 0), 0) + (vector[i] ?? 0));
    const norm = Math.hypot(...next);
    if (norm === 0) return 0;
    const value = next.reduce((total, entry, i) => total + entry * (vector[i] ?? 0), 0);
    vector = next.map((entry) => entry / norm);
    if (iteration > 10 && Math.abs(value - estimate) <= 1e-14 * Math.max(1, Math.abs(value))) return value - 1;
    estimate = value;
  }
  return estimate - 1;
}

/** R0 of `model` at `values` (every parameter by id), from the model's own equations. */
export function nextGeneration(model: ModelSpec, values: Readonly<Record<string, number>>): NgmResult {
  const ids = model.compartments.map((compartment) => compartment.id);
  const rates = new Map<string, Polynomial>();
  for (const equation of model.equations) {
    const expanded = expand(equation.rate);
    if (!expanded.polynomial) return { ok: false, reason: `the rate of ${equation.of} is not a polynomial (${expanded.reason}), so its terms cannot be told apart` };
    rates.set(equation.of, expanded.value);
  }

  // 1. Transmission terms: entering one compartment, a product of compartments, leaving another.
  const transmissions: { readonly into: string; readonly from: string; readonly term: Term }[] = [];
  for (const into of ids) {
    for (const term of rates.get(into)?.terms ?? []) {
      if (term.coefficient.num <= 0n || compartmentDegree(term) < 2) continue;
      const from = ids.find((other) => other !== into && (rates.get(other)?.terms ?? []).some((candidate) => keyOf(candidate) === keyOf(term) && candidate.coefficient.num === -term.coefficient.num && candidate.coefficient.den === term.coefficient.den));
      if (from !== undefined) transmissions.push({ into, from, term });
    }
  }
  if (transmissions.length === 0) return { ok: false, reason: "no term moves people from one compartment to another at a rate that is a product of compartments, so no transmission can be told apart" };
  const sources = [...new Set(transmissions.map((entry) => entry.from))];
  const targets = new Set(transmissions.map((entry) => entry.into));
  const carriers = new Set(transmissions.flatMap((entry) => entry.term.factors.filter((factor) => factor.symbol.kind === "c" && factor.symbol.id !== entry.from).map((factor) => factor.symbol.id)));
  const seeds = new Set([...targets, ...carriers].filter((id) => !sources.includes(id)));

  // 2. The disease-free equilibrium: the seeds empty, the rest run to rest and settled by Newton's method.
  const rate = (id: string, state: Readonly<Record<string, number>>): number => valueAt(rates.get(id) ?? { terms: [] }, values, state);
  const derivatives = new Map(ids.map((i) => [i, new Map(ids.map((j) => {
    const derived = differentiate(rates.get(i) ?? { terms: [] }, { kind: "c", id: j });
    return [j, derived.polynomial ? derived.value : { terms: [] }] as const;
  }))]));
  const jacobianAt = (state: Readonly<Record<string, number>>, rows: readonly string[], columns: readonly string[]): number[][] => rows.map((i) => columns.map((j) => valueAt(derivatives.get(i)?.get(j) ?? { terms: [] }, values, state)));
  let state: Record<string, number> = Object.fromEntries(model.compartments.map((compartment) => [compartment.id, seeds.has(compartment.id) ? 0 : evaluate(compartment.initial, values)]));
  const free = ids.filter((id) => !seeds.has(id));
  const dt = model.solver.dt;
  const scale = (): number => Math.max(1, ...ids.map((id) => Math.abs(state[id] ?? 0)));
  const residual = (): number => Math.max(0, ...free.map((id) => Math.abs(rate(id, state))));
  const settle = (): void => {
    for (let iteration = 0; iteration < 50 && residual() > 1e-14 * scale(); iteration++) {
      const step = solve(jacobianAt(state, free, free), free.map((id) => -rate(id, state)));
      if (step === null) break;
      state = { ...state, ...Object.fromEntries(free.map((id, index) => [id, (state[id] ?? 0) + (step[index] ?? 0)])) };
    }
  };
  // Newton's method first, from the start with no infection: a rest that is linear in the
  // uninfected settles in a step. Only when that finds no rest, or a negative one, is the model
  // run towards it first.
  const start = state;
  settle();
  const settled = ids.every((id) => Number.isFinite(state[id])) && residual() <= 1e-9 * scale() && ids.every((id) => (state[id] ?? 0) >= -1e-9 * scale());
  if (!settled) state = start;
  for (let step = 0; !settled && step < 50_000 && residual() > 1e-10 * scale(); step++) {
    const k = (at: Readonly<Record<string, number>>): Record<string, number> => Object.fromEntries(ids.map((id) => [id, seeds.has(id) ? 0 : rate(id, at)]));
    const shift = (by: Readonly<Record<string, number>>, h: number): Record<string, number> => Object.fromEntries(ids.map((id) => [id, (state[id] ?? 0) + h * (by[id] ?? 0)]));
    const k1 = k(state);
    const k2 = k(shift(k1, dt / 2));
    const k3 = k(shift(k2, dt / 2));
    const k4 = k(shift(k3, dt));
    state = Object.fromEntries(ids.map((id) => [id, (state[id] ?? 0) + (dt / 6) * ((k1[id] ?? 0) + 2 * (k2[id] ?? 0) + 2 * (k3[id] ?? 0) + (k4[id] ?? 0))]));
  }
  if (!settled) settle();
  if (!ids.every((id) => Number.isFinite(state[id])) || residual() > 1e-9 * scale()) return { ok: false, reason: "the model with no infection does not come to rest, so it has no disease-free equilibrium to compute R0 at" };
  if (ids.some((id) => (state[id] ?? 0) < -1e-9 * scale())) return { ok: false, reason: "the model's rest with no infection holds a negative compartment" };
  const dfe = Object.fromEntries(ids.map((id) => [id, Math.abs(state[id] ?? 0) <= 1e-12 * scale() ? 0 : (state[id] ?? 0)]));

  // 3. The infected compartments: empty at rest, reached by new infections, leading back to infecting.
  const empty = ids.filter((id) => dfe[id] === 0);
  const jacobian = jacobianAt(dfe, ids, ids);
  const edge = (from: string, to: string): boolean => from !== to && (jacobian[ids.indexOf(to)]?.[ids.indexOf(from)] ?? 0) !== 0;
  const reach = (starts: Iterable<string>, forward: boolean): Set<string> => {
    const found = new Set(starts);
    for (let changed = true; changed; ) {
      changed = false;
      for (const a of empty) {
        for (const b of empty) {
          if (found.has(a) && !found.has(b) && (forward ? edge(a, b) : edge(b, a))) {
            found.add(b);
            changed = true;
          }
        }
      }
    }
    return found;
  };
  const reached = reach(targets, true);
  const leadsBack = reach([...carriers].filter((id) => seeds.has(id)), false);
  const infected = ids.filter((id) => seeds.has(id) || (empty.includes(id) && reached.has(id) && leadsBack.has(id)));
  if (infected.some((id) => dfe[id] !== 0)) return { ok: false, reason: `the compartments infection enters are not empty with no infection (${infected.filter((id) => dfe[id] !== 0).join(", ")})` };

  // 4. F, V and the spectral radius of F·V⁻¹.
  const transmissionOf = (id: string): Polynomial => ({ terms: transmissions.filter((entry) => entry.into === id).map((entry) => entry.term) });
  const f = infected.map((i) => infected.map((j) => {
    const derived = differentiate(transmissionOf(i), { kind: "c", id: j });
    return derived.polynomial ? valueAt(derived.value, values, dfe) : Number.NaN;
  }));
  const v = infected.map((i, row) => infected.map((j, column) => (f[row]?.[column] ?? 0) - (jacobian[ids.indexOf(i)]?.[ids.indexOf(j)] ?? 0)));
  // K = F·V⁻¹, column by column: K's row r is F's row r times V⁻¹, so K = (V⁻ᵀ Fᵀ)ᵀ.
  const vTransposed = infected.map((_, i) => infected.map((__, j) => v[j]?.[i] ?? 0));
  const k: number[][] = [];
  for (const row of f) {
    const solved = solve(vTransposed, row);
    if (solved === null) return { ok: false, reason: "V, the infected compartments' outflows, cannot be inverted: some infected compartment has no way out" };
    k.push(solved);
  }
  const largest = Math.max(1e-300, ...k.flat().map(Math.abs));
  if (k.flat().some((entry) => !Number.isFinite(entry) || entry < -1e-9 * largest)) return { ok: false, reason: "F·V⁻¹ holds a negative entry, so its spectral radius is not R0" };
  return {
    ok: true,
    value: {
      r0: spectralRadius(k.map((row) => row.map((entry) => Math.max(0, entry)))),
      infected,
      sources,
      transmission: transmissions.map((entry) => `${formatPolynomial({ terms: [entry.term] })} into ${entry.into} from ${entry.from}`),
      dfe,
    },
  };
}
