/**
 * A transcription as a ModelSpec (ADR-0028), checked against its source. Every quote must be found
 * in the source's text, allowing only for differences in whitespace, and becomes a real anchor with
 * its section and offsets; a quote that is not there is a problem, never an anchor. Formulas are
 * parsed by the closed grammar. A value the paper does not state is reported as unstated, never
 * filled in here: the planner fills it, as a teaching choice, and says so.
 */
import { ModelSpec, type Anchor, type Expr, type SourceText, type Unit } from "@paperplay/contracts";
import { FormulaError, parseFormula } from "./formula.ts";
import type { Transcription } from "./schema.ts";

export interface Conversion {
  /** The model, when everything parsed and every quote was found. */
  readonly model: ModelSpec | null;
  /** What is wrong, in words: a quote not in the source, a formula that does not parse. */
  readonly problems: readonly string[];
  /** What the paper does not state: starting values and parameter values, by id. */
  readonly unstated: readonly string[];
}

/** Where a quote stands in a text: exactly, or with its whitespace collapsed on both sides. */
export function findQuote(text: string, quote: string): { readonly start: number; readonly end: number } | null {
  const exact = text.indexOf(quote);
  if (exact >= 0) return { start: exact, end: exact + quote.length };
  const target = quote.replace(/\s+/g, "");
  if (target.length === 0) return null;
  // The text without whitespace, and where each of its characters came from.
  const positions: number[] = [];
  let squeezed = "";
  for (let i = 0; i < text.length; i++) {
    if (!/\s/.test(text[i] ?? "")) {
      squeezed += text[i];
      positions.push(i);
    }
  }
  const at = squeezed.indexOf(target);
  if (at < 0) return null;
  return { start: positions[at] ?? 0, end: (positions[at + target.length - 1] ?? 0) + 1 };
}

/** A quote as an anchor into the source, or null when the source does not hold it. */
export function anchorOf(source: SourceText, quote: string): Anchor | null {
  const found = findQuote(source.text, quote);
  if (!found) return null;
  const section = source.sections.find((candidate) => candidate.start <= found.start && found.start < candidate.end) ?? source.sections[0];
  if (!section) return null;
  const shown = source.text.slice(found.start, found.end);
  return { sourceId: source.sourceId, sectionId: section.id, charStart: found.start, charEnd: found.end, quote: shown.length <= 300 ? shown : `${shown.slice(0, 299)}…` };
}

/** A paper's name as a ModelSpec id, camelCase: "S" becomes "s", "C_q" "cQ", "theta_N" "thetaN". */
export function camelId(raw: string): string {
  const parts = raw.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const joined = parts.map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1))).join("");
  const id = joined.charAt(0).toLowerCase() + joined.slice(1);
  return /^[a-z]/.test(id) ? id : `x${id}`;
}

/** Each of the paper's names as a distinct camelCase id, compartments first; a clash gains a number. */
export function idsFor(raws: readonly string[]): Map<string, string> {
  const ids = new Map<string, string>();
  const taken = new Set<string>();
  for (const raw of raws) {
    let id = camelId(raw);
    for (let n = 2; taken.has(id); n++) id = `${camelId(raw)}${n}`;
    taken.add(id);
    ids.set(raw, id);
  }
  return ids;
}

/** An expression with its names replaced. */
function renamed(expr: Expr, ids: ReadonlyMap<string, string>): Expr {
  if ("n" in expr) return expr;
  if ("p" in expr) return { p: ids.get(expr.p) ?? expr.p };
  if ("c" in expr) return { c: ids.get(expr.c) ?? expr.c };
  if ("args" in expr) return { op: expr.op, args: expr.args.map((arg) => renamed(arg, ids)) };
  if ("b" in expr) return { op: expr.op, a: renamed(expr.a, ids), b: renamed(expr.b, ids) };
  return { op: expr.op, a: renamed(expr.a, ids) };
}

const cleanUnit = (unit: Unit): Unit => Object.fromEntries(Object.entries(unit).filter(([, power]) => power !== 0 && power !== undefined));

/** A range a learner's control may span, a teaching choice around the paper's value. */
const rangeAround = (value: number): [number, number] => (value > 0 ? [0, value * 4] : value < 0 ? [value * 4, 0] : [0, 1]);

export function toModelSpec(transcription: Transcription, source: SourceText, options: { readonly dt?: number; readonly tolerance?: number } = {}): Conversion {
  const problems: string[] = [];
  const unstated: string[] = [];
  const anchor = (quote: string, what: string): Anchor[] => {
    const found = anchorOf(source, quote);
    if (!found) problems.push(`${what}: the quote "${quote.slice(0, 80)}" is not in the source`);
    return found ? [found] : [];
  };
  const names = {
    compartments: new Set(transcription.compartments.map((compartment) => compartment.id)),
    parameters: new Set(transcription.parameters.map((parameter) => parameter.id)),
  };
  for (const id of names.compartments) if (names.parameters.has(id)) problems.push(`${id} names both a compartment and a parameter`);
  const ids = idsFor([...transcription.compartments.map((compartment) => compartment.id), ...transcription.parameters.map((parameter) => parameter.id)]);
  const idOf = (raw: string): string => ids.get(raw) ?? raw;

  // A starting value carries its compartment's unit, so it is a parameter: S(0) becomes s0.
  const starts = transcription.compartments.map((compartment) => {
    if (compartment.initial === null) unstated.push(`${compartment.id}'s starting value`);
    const anchors = compartment.initialQuote ? anchor(compartment.initialQuote, `${compartment.id}'s starting value`) : [];
    const value = compartment.initial ?? 0;
    return {
      id: `${idOf(compartment.id)}0`,
      symbol: `${compartment.symbol}(0)`,
      name: `${compartment.name} at the start`,
      unit: cleanUnit(compartment.unit),
      range: rangeAround(value),
      defaultValue: value,
      origin: anchors.length > 0 && compartment.initial !== null ? ("paper-derived" as const) : ("teaching-choice" as const),
      anchors,
    };
  });
  const compartments = transcription.compartments.map((compartment) => ({
    id: idOf(compartment.id),
    name: compartment.name,
    unit: cleanUnit(compartment.unit),
    initial: { p: `${idOf(compartment.id)}0` },
    nonNegative: true,
    anchors: anchor(compartment.quote, `compartment ${compartment.id}`),
  }));
  const parameters = transcription.parameters.map((parameter) => {
    if (parameter.value === null) unstated.push(`${parameter.id}'s value`);
    const value = parameter.value ?? 0;
    const anchors = anchor(parameter.quote, `parameter ${parameter.id}`);
    return {
      id: idOf(parameter.id),
      symbol: parameter.symbol,
      name: parameter.name,
      unit: cleanUnit(parameter.unit),
      range: rangeAround(value),
      defaultValue: value,
      origin: anchors.length > 0 && parameter.value !== null ? ("paper-derived" as const) : ("teaching-choice" as const),
      anchors,
    };
  });
  const equations = transcription.compartments.map((compartment) => {
    const written = transcription.equations.filter((equation) => equation.of === compartment.id);
    if (written.length !== 1) {
      problems.push(`${compartment.id} has ${written.length} equations, not one`);
      return null;
    }
    const [equation] = written;
    if (!equation) return null;
    let rate: Expr;
    try {
      rate = parseFormula(equation.rate, names);
    } catch (error) {
      problems.push(`d${compartment.id}/dt = ${equation.rate}: ${error instanceof FormulaError ? `${error.message}, at character ${error.at}` : String(error)}`);
      return null;
    }
    const anchors = anchor(equation.quote, `d${compartment.id}/dt`);
    return anchors.length > 0 ? { of: idOf(compartment.id), rate: renamed(rate, ids), anchors } : null;
  });
  for (const equation of transcription.equations) if (!names.compartments.has(equation.of)) problems.push(`an equation for ${equation.of}, which is not a compartment`);
  if (problems.length > 0 || equations.some((equation) => equation === null)) return { model: null, problems, unstated };

  const candidate = {
    timeUnit: transcription.timeUnit,
    compartments,
    parameters: [...parameters, ...starts],
    equations,
    invariants: [],
    steadyStates: [],
    observables: transcription.compartments.map((compartment) => ({ id: `level${camelId(compartment.id).replace(/^./, (first) => first.toUpperCase())}`, label: compartment.name, expr: { c: idOf(compartment.id) }, unit: cleanUnit(compartment.unit) })),
    solver: { dt: options.dt ?? 0.01, tolerance: options.tolerance ?? 1e-6 },
  };
  const parsed = ModelSpec.safeParse(candidate);
  if (!parsed.success) return { model: null, problems: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`), unstated };
  return { model: parsed.data, problems: [], unstated };
}
