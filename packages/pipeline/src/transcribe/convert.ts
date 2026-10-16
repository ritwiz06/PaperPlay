/**
 * A transcription as a ModelSpec (ADR-0028), checked against its source. Every quote must be found
 * in the source's text, allowing only for differences in whitespace, and becomes a real anchor with
 * its section and offsets; a quote that is not there is a problem, never an anchor. Formulas are
 * parsed by the closed grammar. A value the paper does not state is reported as unstated, never
 * filled in here: the planner fills it, as a teaching choice, and says so.
 */
import { ModelSpec, type Anchor, type Expr, type SourceText, type Unit } from "@paperplay/contracts";
import { FormulaError, parseFormula } from "./formula.ts";
import type { Transcription, ValueSet } from "./schema.ts";

export interface Conversion {
  /** The model, when everything parsed and every quote was found. */
  readonly model: ModelSpec | null;
  /** What is wrong, in words: a quote not in the source, a formula that does not parse. */
  readonly problems: readonly string[];
  /** What the paper does not state: starting values and parameter values, by id. */
  readonly unstated: readonly string[];
}

const GREEK: Readonly<Record<string, string>> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", vartheta: "θ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", varLambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
};
/** Characters written more than one way: a quote and its source may use either. */
const SAME: Readonly<Record<string, string>> = { "−": "-", "–": "-", "×": "*", "·": "*", "⋅": "*", "∗": "*", "ϕ": "φ", "ϵ": "ε", "ϑ": "θ", "’": "'", "‘": "'", "“": '"', "”": '"' };
/** LaTeX that only lays out: dropped, as are whitespace, `$`, braces and alignment marks. */
const LAYOUT = new Set(["left", "right", "big", "Big", "bigl", "bigr", "displaystyle", "mathrm", "mathit", "mathbf", "text", "textrm", "quad", "qquad", "frac", "dfrac", "tfrac", "nonumber"]);
const COMMANDS: Readonly<Record<string, string>> = { times: "*", cdot: "*", coloneqq: ":=" };

/**
 * A text in one notation, with where each of its characters came from: a LaTeX command's Greek
 * letter as the letter, as is the bare name a model writes for it ("sigma", "\sigma", "σ" alike),
 * × and \times as *, − as -, and layout dropped, with \frac's braces and any "/" so that
 * "dS/dt" finds "\frac{dS}{dt}". Used only to find a quote a model wrote in
 * another notation; the anchor still holds the source's own characters.
 */
function notation(text: string): { readonly chars: string; readonly from: readonly number[] } {
  let chars = "";
  const from: number[] = [];
  const put = (value: string, at: number): void => {
    for (const char of value) {
      chars += char;
      from.push(at);
    }
  };
  for (let i = 0; i < text.length; ) {
    const char = text[i] ?? "";
    // LaTeX's spacing and line breaks, "\,", "\;", "\\": dropped whole.
    if (char === "\\" && /[^A-Za-z]/.test(text[i + 1] ?? "a")) {
      i += 2;
      continue;
    }
    if (/[A-Za-z\\]/.test(char)) {
      const word = /^\\?([A-Za-z]+)/.exec(text.slice(i));
      const name = word?.[1] ?? "";
      const length = word?.[0].length ?? 1;
      const command = char === "\\";
      if (GREEK[name] !== undefined) put(GREEK[name], i);
      else if (command && COMMANDS[name] !== undefined) put(COMMANDS[name], i);
      else if (command && LAYOUT.has(name)) {
        // dropped
      } else if (name) for (let k = 0; k < name.length; k++) put(name[k] ?? "", i + (command ? 1 : 0) + k);
      i += Math.max(length, 1);
      continue;
    }
    if (!/[\s${}&/]/.test(char)) put(SAME[char] ?? char, i);
    i++;
  }
  return { chars, from };
}

/**
 * Where a quote stands in a text: exactly; else with its whitespace differing; else written in
 * another notation, as models do with LaTeX ("β = 0.05" for "\beta = 0.05"); else with its first
 * letter's case the other way, as a sentence quoted from its middle starts with a capital ("Exposed
 * individuals are …" for "Thus, exposed individuals are …"). The span returned is always the text's
 * own, so an anchor quotes the source, never the model's rendering of it.
 */
export function findQuote(text: string, quote: string): { readonly start: number; readonly end: number } | null {
  const found = findAsWritten(text, quote);
  if (found) return found;
  const first = quote.charAt(0);
  const flipped = first === first.toUpperCase() ? first.toLowerCase() : first.toUpperCase();
  return flipped === first ? null : findAsWritten(text, `${flipped}${quote.slice(1)}`);
}

function findAsWritten(text: string, quote: string): { readonly start: number; readonly end: number } | null {
  const exact = text.indexOf(quote);
  if (exact >= 0) return widen(text, exact, exact + quote.length);
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
  if (at >= 0) return widen(text, positions[at] ?? 0, (positions[at + target.length - 1] ?? 0) + 1);
  // In one notation: only a quote with something to find, so a short one cannot match by chance.
  const wanted = notation(quote).chars;
  if (wanted.length < 4) return null;
  const source = notation(text);
  const found = source.chars.indexOf(wanted);
  if (found < 0) return null;
  const first = source.from[found] ?? 0;
  const last = source.from[found + wanted.length - 1] ?? first;
  // Through to the end of the last character's command or word, so "\beta" is not cut to "\b".
  const tail = /^\\?[A-Za-z]+/.exec(text.slice(last))?.[0].length ?? 1;
  return widen(text, first, last + Math.max(tail, 1));
}

/**
 * A span widened to whole LaTeX: from a command's backslash when it starts inside a command's
 * name, back over the layout and braces it opens with, "\frac{", and on over the braces it leaves
 * open, so an anchor shows "\frac{dS}{dt}", never "dS}{dt" or "beta" for "\beta".
 */
function widen(text: string, from: number, to: number): { readonly start: number; readonly end: number } {
  let start = from;
  while (start > 0 && /[A-Za-z]/.test(text[start] ?? "") && /[A-Za-z\\]/.test(text[start - 1] ?? "")) {
    const run = /\\?[A-Za-z]*$/.exec(text.slice(0, start))?.[0] ?? "";
    if (!run.startsWith("\\")) break;
    start -= run.length;
  }
  for (;;) {
    const before = /(\\[A-Za-z]+|\{)$/.exec(text.slice(Math.max(0, start - 16), start))?.[0];
    if (!before || (before.startsWith("\\") && !LAYOUT.has(before.slice(1)))) break;
    start -= before.length;
  }
  let end = to;
  const open = (span: string): number => (span.match(/{/g)?.length ?? 0) - (span.match(/}/g)?.length ?? 0);
  while (open(text.slice(start, end)) > 0 && text[end] === "}") end++;
  return { start, end };
}

/** Whether two names are one symbol written in different notations: "theta_N", "\theta_N", "θ_N". */
export function sameSymbol(a: string, b: string): boolean {
  const left = notation(a).chars;
  return left.length > 0 && left === notation(b).chars;
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

export function toModelSpec(transcription: Transcription, source: SourceText, options: { readonly dt?: number; readonly tolerance?: number; readonly alternatives?: readonly ValueSet[] } = {}): Conversion {
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
    // The paper's other value sets, by the model's ids: a starting value is its compartment's parameter.
    ...(options.alternatives && options.alternatives.length > 0
      ? {
          alternatives: options.alternatives.map((set) => ({
            id: camelId(set.id),
            label: set.label,
            values: Object.fromEntries(set.values.filter((value) => names.parameters.has(value.of) || names.compartments.has(value.of)).map((value) => [names.compartments.has(value.of) ? `${idOf(value.of)}0` : idOf(value.of), value.value])),
            anchors: [anchorOf(source, set.quote)].filter((found): found is Anchor => found !== null),
          })),
        }
      : {}),
  };
  const parsed = ModelSpec.safeParse(candidate);
  if (!parsed.success) return { model: null, problems: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`), unstated };
  return { model: parsed.data, problems: [], unstated };
}
