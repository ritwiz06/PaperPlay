/**
 * Two transcriptions of one model, compared structurally up to renaming (ADR-0024, item 2). The
 * second is made by a different model that never sees the first; the world is verified only when
 * they agree. Names are paired by their symbols, then by their stated values, then by trying the
 * few pairings left; a pairing holds only when every rate and every starting value agrees at a
 * dozen seeded random points, so no pairing passes by a coincidence of names. Stated values are
 * compared too, and reported apart: a model can be transcribed right with a value read wrong.
 */
import type { Expr, ModelSpec } from "@paperplay/contracts";
import { mulberry32 } from "@paperplay/primitives";
import { compileExpr, type Compiled, type Indices } from "@paperplay/primitives/compartments";

export interface ModelMatch {
  /** Whether the equations and starting values agree, under the pairing found. */
  readonly structural: boolean;
  /** Whether every paired parameter's stated value agrees too. */
  readonly values: boolean;
  /** The first transcription's names, each paired with the second's. */
  readonly compartments: Readonly<Record<string, string>>;
  readonly parameters: Readonly<Record<string, string>>;
  /** What disagreed, in words. */
  readonly problems: readonly string[];
}

const GREEK: Readonly<Record<string, string>> = {
  α: "alpha", β: "beta", γ: "gamma", δ: "delta", ε: "epsilon", ζ: "zeta", η: "eta", θ: "theta", κ: "kappa", λ: "lambda", μ: "mu", ν: "nu", ξ: "xi",
  π: "pi", ρ: "rho", σ: "sigma", τ: "tau", φ: "phi", χ: "chi", ψ: "psi", ω: "omega", Λ: "lambda", Δ: "delta", Ω: "omega",
};

/** A name or symbol as compared: Greek letters spelt out, TeX and punctuation gone, lower case. */
export const normalName = (raw: string): string =>
  [...raw]
    .map((char) => GREEK[char] ?? char)
    .join("")
    .replace(/\\(mathrm|mathit|text|operatorname)\b/g, "")
    .replace(/\\/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toLowerCase();

const SAMPLES = 12;
const RELATIVE = 1e-9;
const close = (a: number, b: number): boolean => Math.abs(a - b) <= RELATIVE * Math.max(1, Math.abs(a), Math.abs(b));

interface Compiled2 {
  readonly rates: ReadonlyMap<string, Compiled>;
  readonly initials: ReadonlyMap<string, Compiled>;
  readonly indices: Indices;
}

function compile(spec: ModelSpec): Compiled2 {
  const indices: Indices = {
    compartments: new Map(spec.compartments.map((compartment, index) => [compartment.id, index])),
    parameters: new Map(spec.parameters.map((parameter, index) => [parameter.id, index])),
  };
  const rateOf = (id: string): Expr | undefined => spec.equations.find((equation) => equation.of === id)?.rate;
  return {
    indices,
    rates: new Map(spec.compartments.map((compartment) => [compartment.id, compileExpr(rateOf(compartment.id) ?? { n: 0 }, indices)])),
    initials: new Map(spec.compartments.map((compartment) => [compartment.id, compileExpr(compartment.initial, indices)])),
  };
}

/** Pairs each of `left` with one of `right`: by name, then by value, then every arrangement of the few left, best first. */
function pairings<T extends { readonly id: string }>(left: readonly T[], right: readonly T[], keys: (item: T) => readonly string[], value: (item: T) => number | null): Record<string, string>[] {
  const paired: Record<string, string> = {};
  const free = new Set(right.map((item) => item.id));
  for (const item of left) {
    const wanted = new Set(keys(item).map(normalName).filter(Boolean));
    const match = right.find((other) => free.has(other.id) && keys(other).some((key) => wanted.has(normalName(key))));
    if (match) {
      paired[item.id] = match.id;
      free.delete(match.id);
    }
  }
  for (const item of left.filter((candidate) => !(candidate.id in paired))) {
    const mine = value(item);
    const same = right.filter((other) => free.has(other.id) && mine !== null && value(other) !== null && close(mine, value(other) ?? Number.NaN));
    const only = same.length === 1 ? same[0] : undefined;
    if (only) {
      paired[item.id] = only.id;
      free.delete(only.id);
    }
  }
  const rest = left.filter((item) => !(item.id in paired)).map((item) => item.id);
  const others = [...free];
  if (rest.length === 0) return [paired];
  if (rest.length !== others.length || rest.length > 6) return [];
  const arrangements: string[][] = [];
  const permute = (prefix: string[], remaining: string[]) => {
    if (remaining.length === 0) arrangements.push(prefix);
    remaining.forEach((id, index) => permute([...prefix, id], [...remaining.slice(0, index), ...remaining.slice(index + 1)]));
  };
  permute([], others);
  return arrangements.map((arrangement) => ({ ...paired, ...Object.fromEntries(rest.map((id, index) => [id, arrangement[index] ?? ""])) }));
}

/** Whether the second model, renamed by the pairing, computes what the first does, at seeded random points. */
function agrees(a: ModelSpec, b: ModelSpec, ca: Compiled2, cb: Compiled2, compartments: Record<string, string>, parameters: Record<string, string>): string[] {
  const problems: string[] = [];
  const random = mulberry32(0x5eed);
  for (let sample = 0; sample < SAMPLES; sample++) {
    const x = Float64Array.from(a.compartments, () => 0.05 + random.next() * 2);
    const theta = Float64Array.from(a.parameters, () => 0.05 + random.next() * 2);
    const xb = new Float64Array(b.compartments.length);
    const thetab = new Float64Array(b.parameters.length);
    a.compartments.forEach((compartment, index) => xb.set([x[index] ?? 0], cb.indices.compartments.get(compartments[compartment.id] ?? "") ?? 0));
    a.parameters.forEach((parameter, index) => thetab.set([theta[index] ?? 0], cb.indices.parameters.get(parameters[parameter.id] ?? "") ?? 0));
    for (const compartment of a.compartments) {
      const other = compartments[compartment.id] ?? "";
      const left = ca.rates.get(compartment.id)?.(x, theta) ?? Number.NaN;
      const right = cb.rates.get(other)?.(xb, thetab) ?? Number.NaN;
      if (!close(left, right)) problems.push(`d${compartment.id}/dt and d${other}/dt differ`);
      const startLeft = ca.initials.get(compartment.id)?.(x, theta) ?? Number.NaN;
      const startRight = cb.initials.get(other)?.(xb, thetab) ?? Number.NaN;
      if (!close(startLeft, startRight)) problems.push(`${compartment.id}'s and ${other}'s starting values differ`);
    }
    if (problems.length > 0) return [...new Set(problems)];
  }
  return [];
}

export function matchModels(a: ModelSpec, b: ModelSpec): ModelMatch {
  const fail = (problem: string): ModelMatch => ({ structural: false, values: false, compartments: {}, parameters: {}, problems: [problem] });
  // The rates' time unit is structure: the same equations per day and per year are different models.
  if (a.timeUnit !== b.timeUnit) return fail(`the first's rates are per ${a.timeUnit}, the second's per ${b.timeUnit}`);
  if (a.compartments.length !== b.compartments.length) return fail(`the first has ${a.compartments.length} compartments, the second ${b.compartments.length}`);
  if (a.parameters.length !== b.parameters.length) return fail(`the first has ${a.parameters.length} parameters, the second ${b.parameters.length}`);
  const ca = compile(a);
  const cb = compile(b);
  const compartmentPairings = pairings(a.compartments, b.compartments, (item) => [item.id, item.name], () => null);
  const parameterPairings = pairings(a.parameters, b.parameters, (item) => [item.id, item.symbol, item.name], (item) => item.defaultValue);
  let best: ModelMatch | null = null;
  for (const compartments of compartmentPairings.slice(0, 720)) {
    for (const parameters of parameterPairings.slice(0, 720)) {
      const problems = agrees(a, b, ca, cb, compartments, parameters);
      if (problems.length === 0) {
        const valueProblems = a.parameters.flatMap((parameter) => {
          const other = b.parameters.find((candidate) => candidate.id === parameters[parameter.id]);
          return other && close(parameter.defaultValue, other.defaultValue) ? [] : [`${parameter.id} is ${parameter.defaultValue} in the first and ${other?.defaultValue ?? "missing"} in the second`];
        });
        return { structural: true, values: valueProblems.length === 0, compartments, parameters, problems: valueProblems };
      }
      if (!best) best = { structural: false, values: false, compartments, parameters, problems };
    }
  }
  return best ?? fail("no pairing of the two models' names could be tried");
}
