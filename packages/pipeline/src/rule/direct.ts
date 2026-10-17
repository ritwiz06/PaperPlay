/**
 * What counts as definitional (ADR-0044), held by code, not by a reviewer's word alone.
 *
 * - **The direct-effect tag:** does a level's control parameter appear directly in the measured
 *   compartment's own equation, and with which sign? Read from the equation's exact expansion, it is
 *   given to the reviewers as evidence.
 * - **A named term:** a reviewer that calls a level definitional must name the term of that
 *   equation the effect follows from, in the model's ids; the term must be one the equation holds
 *   and must hold the control, as the tag says. A block naming no such term is ignored, and recorded.
 * - **Emergent summaries:** a direct effect measured on a peak, a lowest value, a time to a level or a
 *   final size is not definitional: how high or how soon depends on the whole model's motion.
 */
import type { Expr, ModelSpec } from "@paperplay/contracts";
import { expand, formatPolynomial, type Polynomial, type Term } from "@paperplay/primitives/compartments";
import { parseFormula } from "../transcribe/formula.ts";

export interface DirectEffect {
  readonly parameter: string;
  readonly compartment: string;
  /** Whether the parameter appears in the compartment's own equation. */
  readonly direct: boolean;
  /** The signs of the terms that hold it: "+" where it adds to the compartment, "−" where it takes away. */
  readonly signs: readonly ("+" | "−")[];
  /** Those terms, written out: "delta × c". */
  readonly terms: readonly string[];
  /** Whether the level measures an emergent summary of the compartment, not its level at a moment or its total. */
  readonly emergent: boolean;
}

/** Summaries a learner cannot read off one term: when and how high, not merely how much. */
export function isEmergent(summary: { readonly summary: string; readonly at: number | null; readonly time: number }): boolean {
  if (summary.summary === "peak" || summary.summary === "lowest" || summary.summary === "first-reach") return true;
  // A value at the end of the level's run is the final size.
  return summary.summary === "at" && summary.at !== null && summary.at >= summary.time;
}

const keyOf = (term: Term): string =>
  term.factors
    .map((factor) => `${factor.symbol.kind}:${factor.symbol.id}^${factor.power}`)
    .sort()
    .join("·");
const holds = (term: Term, parameter: string): boolean => term.factors.some((factor) => factor.symbol.kind === "p" && factor.symbol.id === parameter);

function mentions(expr: Expr, parameter: string): boolean {
  if ("p" in expr) return expr.p === parameter;
  if ("n" in expr || "c" in expr) return false;
  const parts = "args" in expr ? expr.args : "b" in expr ? [expr.a, expr.b] : [expr.a];
  return parts.some((part) => mentions(part, parameter));
}

/** The equation of a compartment, expanded; null when it is not a polynomial. */
function rateOf(model: ModelSpec, compartment: string): { readonly expr: Expr; readonly polynomial: Polynomial | null } | null {
  const equation = model.equations.find((candidate) => candidate.of === compartment);
  if (!equation) return null;
  const expanded = expand(equation.rate);
  return { expr: equation.rate, polynomial: expanded.polynomial ? expanded.value : null };
}

/** The direct-effect tag of a parameter on a measured compartment, with the level's summary. */
export function directEffectOf(model: ModelSpec, parameter: string, compartment: string, summary: { readonly summary: string; readonly at: number | null; readonly time: number }): DirectEffect {
  const rate = rateOf(model, compartment);
  const emergent = isEmergent(summary);
  if (!rate) return { parameter, compartment, direct: false, signs: [], terms: [], emergent };
  if (!rate.polynomial) return { parameter, compartment, direct: mentions(rate.expr, parameter), signs: [], terms: [], emergent };
  const terms = rate.polynomial.terms.filter((term) => holds(term, parameter));
  return { parameter, compartment, direct: terms.length > 0, signs: signsOf(model, terms, parameter), terms: terms.map((term) => formatPolynomial({ terms: [term] })), emergent };
}

/**
 * The signs of the equation's derivative in the parameter, at the model's values, for each product
 * of compartments it multiplies: delta × (1 − theta) × c expands to c × delta − c × delta × theta,
 * whose derivative in delta, (1 − theta) × c, adds to the compartment while theta is below one.
 */
function signsOf(model: ModelSpec, terms: readonly Term[], parameter: string): ("+" | "−")[] {
  const valueOf = (id: string): number => model.parameters.find((entry) => entry.id === id)?.defaultValue ?? Number.NaN;
  const byCompartments = new Map<string, number>();
  for (const term of terms) {
    const key = term.factors
      .filter((factor) => factor.symbol.kind !== "p")
      .map((factor) => `${factor.symbol.id}^${factor.power}`)
      .join("·");
    const slope = term.factors.reduce((product, factor) => {
      if (factor.symbol.kind !== "p") return product;
      if (factor.symbol.id === parameter) return product * factor.power * valueOf(parameter) ** (factor.power - 1);
      return product * valueOf(factor.symbol.id) ** factor.power;
    }, Number(term.coefficient.num) / Number(term.coefficient.den));
    byCompartments.set(key, (byCompartments.get(key) ?? 0) + slope);
  }
  return [...new Set([...byCompartments.values()].filter((slope) => Number.isFinite(slope) && slope !== 0).map((slope) => (slope > 0 ? "+" : "−")))];
}

/** The tag in words, for a reviewer: "control delta appears in dcQ/dt, adding (+ delta × c), measured on its peak, which is emergent". */
export function describeDirectEffect(tag: DirectEffect): string {
  if (!tag.direct) return `its control ${tag.parameter} does not appear in d${tag.compartment}/dt, the measured compartment's own equation`;
  const way = tag.signs.length === 1 ? (tag.signs[0] === "+" ? "adding to it" : "taking from it") : tag.signs.length === 0 ? "with a sign the expansion cannot read" : "both adding and taking";
  return `its control ${tag.parameter} appears directly in d${tag.compartment}/dt, the measured compartment's own equation, ${way} (${tag.terms.join("; ")}); the level measures ${tag.emergent ? "an emergent summary of it, which is never definitional" : "its level or total"}`;
}

/**
 * Whether a term a reviewer named is one the measured compartment's equation holds, and holds the
 * control: every monomial of the named term, whatever its coefficient, must be one of the
 * equation's, and one of them must hold the control.
 */
export function termHolds(model: ModelSpec, compartment: string, parameter: string, named: string | null): { readonly valid: boolean; readonly reason: string } {
  if (named === null || named.trim() === "") return { valid: false, reason: "it names no term" };
  const rate = rateOf(model, compartment);
  if (!rate?.polynomial) return { valid: false, reason: `d${compartment}/dt cannot be expanded into terms` };
  let parsed: Expr;
  try {
    // As the equations are written for the reviewer, × and − are the grammar's * and -.
    parsed = parseFormula(named.replace(/[×·]/g, "*").replace(/[−–]/g, "-"), { compartments: new Set(model.compartments.map((entry) => entry.id)), parameters: new Set(model.parameters.map((entry) => entry.id)) });
  } catch (error) {
    return { valid: false, reason: `its term "${named}" is not in the model's ids: ${error instanceof Error ? error.message : String(error)}` };
  }
  const expanded = expand(parsed);
  if (!expanded.polynomial) return { valid: false, reason: `its term "${named}" is not a polynomial` };
  const equationKeys = new Set(rate.polynomial.terms.map(keyOf));
  const missing = expanded.value.terms.filter((term) => !equationKeys.has(keyOf(term)));
  if (missing.length > 0) return { valid: false, reason: `d${compartment}/dt holds no ${missing.map((term) => formatPolynomial({ terms: [term] })).join(", ")}` };
  if (!expanded.value.terms.some((term) => holds(term, parameter))) return { valid: false, reason: `its term "${named}" does not hold the control, ${parameter}` };
  return { valid: true, reason: `d${compartment}/dt holds ${formatPolynomial(expanded.value)}, which holds ${parameter}` };
}

/** One reviewer's finding, as the controller decided it (ADR-0044). */
export interface ReviewRecord {
  readonly reviewer: string;
  readonly level: number | null;
  readonly kind: "definitional" | "unsupported" | "overstated" | "other";
  readonly blocking: boolean;
  readonly term: string | null;
  /** A block the rules accept: a definitional one naming a valid term on a summary that is not emergent; any other block as given. */
  readonly valid: boolean;
  /** A valid block every reviewer made, of the same kind on the same level. */
  readonly stands: boolean;
  readonly reason: string;
}

interface ReviewedFinding {
  readonly level: number | null;
  readonly severity: "blocking" | "advice";
  readonly kind: ReviewRecord["kind"];
  readonly term: string | null;
}

/** A level as the rules read it: its control and its measured summary, in the model's ids. */
interface ReviewedLevel {
  readonly control: { readonly parameter: string };
  readonly difference: { readonly compartment: string; readonly summary: string; readonly at: number | null; readonly time: number };
}

/**
 * Which reviewers' blocks stand. Each block is first held to the rules: a definitional block must
 * name a term of the measured compartment's equation holding the control, on a level whose summary
 * is not emergent. Then, with two reviewers, a block stands only where both make a valid block of
 * the same kind on the same level; a lone reviewer, where no second is chosen, stands alone.
 */
export function decideReviews(model: ModelSpec, plan: { readonly levels: readonly ReviewedLevel[] }, tags: readonly DirectEffect[], reviews: readonly { readonly model: string; readonly review: { readonly findings: readonly ReviewedFinding[] } }[]): { readonly records: readonly ReviewRecord[]; readonly standing: (kind: ReviewRecord["kind"]) => readonly number[] } {
  const judged = reviews.map(({ model: reviewer, review }) =>
    review.findings.map((finding): Omit<ReviewRecord, "stands" | "reason"> & { readonly why: string } => {
      const base = { reviewer, level: finding.level, kind: finding.kind, blocking: finding.severity === "blocking", term: finding.term };
      if (!base.blocking) return { ...base, valid: false, why: "advice" };
      const level = finding.level === null ? undefined : plan.levels[finding.level - 1];
      if (!level || finding.level === null) return { ...base, valid: false, why: "it names no level of the world" };
      if (finding.kind !== "definitional") return { ...base, valid: true, why: "" };
      const tag = tags[finding.level - 1];
      if (tag?.emergent) return { ...base, valid: false, why: `the level measures the ${level.difference.summary === "at" ? "final size" : level.difference.summary} of ${level.difference.compartment}, an emergent summary, which is never definitional` };
      const term = termHolds(model, level.difference.compartment, level.control.parameter, finding.term);
      return { ...base, valid: term.valid, why: term.valid ? term.reason : `${term.reason}; a definitional block must name a term of d${level.difference.compartment}/dt holding the control` };
    }),
  );
  const madeBy = (index: number, level: number | null, kind: ReviewRecord["kind"]): boolean => judged[index]?.some((entry) => entry.valid && entry.level === level && entry.kind === kind) ?? false;
  const records = judged.flatMap((entries, index) =>
    entries.map(({ why, ...entry }): ReviewRecord => {
      if (!entry.valid) return { ...entry, stands: false, reason: why };
      const others = judged.map((_, other) => other).filter((other) => other !== index);
      const agreed = others.every((other) => madeBy(other, entry.level, entry.kind));
      const reason = others.length === 0 ? `${why ? `${why}; ` : ""}one reviewer only` : agreed ? `${why ? `${why}; ` : ""}${others.map((other) => reviews[other]?.model).join(", ")} agrees` : `${why ? `${why}; ` : ""}${others.map((other) => reviews[other]?.model).join(", ")} makes no such block`;
      return { ...entry, stands: agreed, reason };
    }),
  );
  return {
    records,
    standing: (kind) => [...new Set(records.filter((record) => record.stands && record.kind === kind && record.level !== null).map((record) => (record.level ?? 0) - 1))].sort((a, b) => a - b),
  };
}
