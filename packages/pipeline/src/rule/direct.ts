/**
 * What counts as definitional (ADR-0044), held by code, not by a reviewer's word alone.
 *
 * - **The direct-effect tag:** does a level's control parameter appear directly in the measured
 *   compartment's own equation, and with which sign? Read from the equation's exact expansion, it is
 *   given to the reviewers as evidence.
 * - **A named term:** a reviewer that calls a level definitional must name the term of that
 *   equation the effect follows from, in the model's ids; the term must be one the equation holds
 *   and must hold the control, as the tag says. A block naming no such term is ignored, and recorded.
 * - **What is definitional** (the owner's rule of 2026-10-20, closing the loophole of 2026-10-18):
 *   judged by compartment, not by summary. A level whose control appears directly in the measured
 *   compartment's own equation is definitional whatever it measures of that compartment: its level,
 *   peak, time to a level, total over time or value at the end. An effect that travels through other
 *   compartments is not, nor a system-wide measure, one across compartments (a total ever infected) or
 *   of a derived quantity (a threshold crossing such as R0 = 1). A level of a generated world
 *   measures one compartment, so the tag alone decides it, before any reviewer reads the world.
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
  /** Whether the level measures across compartments or a derived quantity; one compartment never is. */
  readonly systemWide: boolean;
  /** Direct, and measured on that compartment, whatever its summary: the effect follows from the model's definition. */
  readonly definitional: boolean;
  /** The summary the level takes of the compartment, for the words. */
  readonly summary: string;
  /** Whether that summary is the compartment's level at a moment or its peak, as the words of 2026-10-18 said. */
  readonly levelOrPeak: boolean;
}

/**
 * Whether what a level measures is system-wide: across several compartments, or a quantity derived
 * from them, such as a threshold crossing of R0. One compartment never is, whatever its summary.
 */
export const isSystemWide = (measured: { readonly compartments: readonly string[] }): boolean => measured.compartments.length !== 1;

/** A summary that is the compartment's level at a moment before the end, its peak, its lowest value or its mean. */
const isLevelOrPeak = (summary: { readonly summary: string; readonly at: number | null; readonly time: number }): boolean =>
  !(summary.summary === "first-reach" || summary.summary === "total" || (summary.summary === "at" && summary.at !== null && summary.at >= summary.time));

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
  const systemWide = isSystemWide({ compartments: [compartment] });
  const words = { summary: summary.summary, levelOrPeak: isLevelOrPeak(summary) };
  if (!rate) return { parameter, compartment, direct: false, signs: [], terms: [], systemWide, definitional: false, ...words };
  if (!rate.polynomial) {
    const direct = mentions(rate.expr, parameter);
    return { parameter, compartment, direct, signs: [], terms: [], systemWide, definitional: direct && !systemWide, ...words };
  }
  const terms = rate.polynomial.terms.filter((term) => holds(term, parameter));
  return { parameter, compartment, direct: terms.length > 0, signs: signsOf(model, terms, parameter), terms: terms.map((term) => formatPolynomial({ terms: [term] })), systemWide, definitional: terms.length > 0 && !systemWide, ...words };
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
  if (!tag.direct) return `its control ${tag.parameter} does not appear in d${tag.compartment}/dt, the measured compartment's own equation: its effect travels through other compartments, so it is not definitional`;
  const way = tag.signs.length === 1 ? (tag.signs[0] === "+" ? "adding to it" : "taking from it") : tag.signs.length === 0 ? "with a sign the expansion cannot read" : "both adding and taking";
  const appears = `its control ${tag.parameter} appears directly in d${tag.compartment}/dt, the measured compartment's own equation, ${way} (${tag.terms.join("; ")})`;
  if (!tag.definitional) return `${appears}, but the level measures a system-wide summary, so it is not definitional`;
  // A level or a peak keeps the words reviewers have read since 2026-10-18, so their recorded reviews replay.
  if (tag.levelOrPeak) return `${appears}, and the level measures that compartment's own level or peak, so it is definitional: its effect follows from the model's definition`;
  return `${appears}, and the level measures that compartment, by its ${SUMMARY_WORDS[tag.summary] ?? tag.summary}, so it is definitional: whatever its summary, the effect follows from the model's definition`;
}

/** A summary in words. */
const SUMMARY_WORDS: Readonly<Record<string, string>> = { "first-reach": "time to a level", total: "total over time", at: "value at the run's end", peak: "peak", lowest: "lowest value", mean: "mean" };

/** A definitional level's problem, in words for the planner, who changes it. */
export function definitionalProblem(tag: DirectEffect): string {
  const measured = tag.levelOrPeak ? `${tag.compartment}'s own level or peak` : `${tag.compartment}'s ${SUMMARY_WORDS[tag.summary] ?? tag.summary}`;
  return `it is definitional: its control ${tag.parameter} appears directly in d${tag.compartment}/dt (${tag.terms.join("; ")}) and it measures ${measured}, so its effect follows from the model's definition, whatever the summary; measure a compartment the effect must travel through others to reach`;
}

/** What an unsupported finding says the model has, so the code can check it: a parameter's kind, or whether it appears in a compartment's equation. */
export interface ModelClaim {
  readonly parameter: string | null;
  readonly compartment: string | null;
  readonly says: "share" | "rate" | "absent" | "present";
}

/**
 * Whether the model bears a reviewer's claim out: a share is a parameter with no unit of time in it,
 * a rate one per unit of time; absent and present, whether the parameter appears in the
 * compartment's own equation. Null when the claim names nothing the model has.
 */
export function checkClaim(model: ModelSpec, claim: ModelClaim): { readonly holds: boolean; readonly reason: string } | null {
  const parameter = model.parameters.find((entry) => entry.id === claim.parameter);
  if (!parameter) return null;
  if (claim.says === "share" || claim.says === "rate") {
    const perTime = (parameter.unit.time ?? 0) < 0;
    const share = Object.keys(parameter.unit).length === 0;
    const holds = claim.says === "rate" ? perTime : share;
    return { holds, reason: `${parameter.id} is ${perTime ? "a rate, per unit of time" : share ? "a share, with no unit" : "neither a share nor a rate"}` };
  }
  if (!model.compartments.some((entry) => entry.id === claim.compartment) || claim.compartment === null) return null;
  const tag = directEffectOf(model, parameter.id, claim.compartment, { summary: "peak", at: null, time: 1 });
  return { holds: claim.says === "present" ? tag.direct : !tag.direct, reason: `${parameter.id} ${tag.direct ? "appears" : "does not appear"} in d${claim.compartment}/dt` };
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
  /**
   * A block the rules accept: a definitional one only where the code finds the level definitional,
   * naming a valid term; an unsupported one unless the code refutes what it says of the model; any
   * other as given.
   */
  readonly valid: boolean;
  /** A valid unsupported block, from one reviewer; any other valid block, only where every reviewer made it. */
  readonly stands: boolean;
  readonly reason: string;
}

interface ReviewedFinding {
  readonly level: number | null;
  readonly severity: "blocking" | "advice";
  readonly kind: ReviewRecord["kind"];
  readonly term: string | null;
  readonly claim?: ModelClaim | null;
}

/** A level as the rules read it: its control and its measured summary, in the model's ids. */
interface ReviewedLevel {
  readonly control: { readonly parameter: string };
  readonly difference: { readonly compartment: string; readonly summary: string; readonly at: number | null; readonly time: number };
}

/**
 * Which reviewers' blocks stand (ADR-0044, corrected 2026-10-18). Each block is first held to the
 * rules: a definitional block only where the code finds the level definitional, with a term of the
 * measured compartment's equation holding the control; an unsupported block unless what it claims
 * of the model, a share or a rate, a term present or absent, is refuted by the model itself. An
 * unsupported block then stands from one reviewer, since it only sends words to be written again;
 * any other, only where every reviewer made a valid block of the same kind on the same level.
 */
export function decideReviews(model: ModelSpec, plan: { readonly levels: readonly ReviewedLevel[] }, tags: readonly DirectEffect[], reviews: readonly { readonly model: string; readonly review: { readonly findings: readonly ReviewedFinding[] } }[]): { readonly records: readonly ReviewRecord[]; readonly standing: (kind: ReviewRecord["kind"]) => readonly number[] } {
  const judged = reviews.map(({ model: reviewer, review }) =>
    review.findings.map((finding): Omit<ReviewRecord, "stands" | "reason"> & { readonly why: string } => {
      const base = { reviewer, level: finding.level, kind: finding.kind, blocking: finding.severity === "blocking", term: finding.term };
      if (!base.blocking) return { ...base, valid: false, why: "advice" };
      const level = finding.level === null ? undefined : plan.levels[finding.level - 1];
      if (!level || finding.level === null) return { ...base, valid: false, why: "it names no level of the world" };
      if (finding.kind === "unsupported") {
        const checked = finding.claim ? checkClaim(model, finding.claim) : null;
        if (checked && !checked.holds) return { ...base, valid: false, why: `the model refutes what it says: ${checked.reason}` };
        return { ...base, valid: true, why: checked ? `the model bears it out: ${checked.reason}` : "" };
      }
      if (finding.kind !== "definitional") return { ...base, valid: true, why: "" };
      const tag = tags[finding.level - 1];
      if (tag && !tag.definitional) return { ...base, valid: false, why: `the code finds the level is not definitional: ${describeDirectEffect(tag)}` };
      const term = termHolds(model, level.difference.compartment, level.control.parameter, finding.term);
      return { ...base, valid: term.valid, why: term.valid ? term.reason : `${term.reason}; a definitional block must name a term of d${level.difference.compartment}/dt holding the control` };
    }),
  );
  const madeBy = (index: number, level: number | null, kind: ReviewRecord["kind"]): boolean => judged[index]?.some((entry) => entry.valid && entry.level === level && entry.kind === kind) ?? false;
  const records = judged.flatMap((entries, index) =>
    entries.map(({ why, ...entry }): ReviewRecord => {
      if (!entry.valid) return { ...entry, stands: false, reason: why };
      const others = judged.map((_, other) => other).filter((other) => other !== index);
      if (entry.kind === "unsupported") return { ...entry, stands: true, reason: `${why ? `${why}; ` : ""}one reviewer's block is enough to send words back` };
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
