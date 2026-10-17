/**
 * Running the paper's own numbers (ADR-0040): a deterministic stage, with no model call, between
 * the agreed transcription and the plan. Before a world may say a paper's headline does not appear
 * at the values it lists, the check makes sure the fault is not ours:
 *
 * - it recomputes the reproduction number from the transcribed equations, through the model's own
 *   next-generation matrix, and compares it with the paper's own formula at the same values;
 * - it checks every value against its quote: as written, a percentage read as a fraction, or
 *   converted from the time unit the paper names into the model's;
 * - it scans the headline's passages, the figures they cite, every caption and the sections on
 *   methods and supporting information for other values the headline may rest on.
 *
 * Only when all of that holds and the headline's threshold still does not appear is the mismatch
 * confirmed: level 1 then tests the headline's direction, and a computed observation says so,
 * neutrally. Every world the check ran on gets its table as a journal page.
 */
import type { Anchor, Expr, ModelSpec, Origin, SourceText } from "@paperplay/contracts";
import { anchorOf } from "../transcribe/convert.ts";
import { evaluate, FormulaError, parametersOf, parseFormula, symbolName } from "./formula.ts";
import { nextGeneration } from "./ngm.ts";
import { scanForOtherValues, type ScanResult } from "./scan.ts";
import { checkValues, percentagesIn, quoteOf, statedRange, type ValueCheck } from "./values.ts";

export { evaluate, FormulaError, parseFormula, symbolName } from "./formula.ts";
export { nextGeneration, type NextGeneration, type NgmResult } from "./ngm.ts";
export { scanForOtherValues, type ScanResult, type ScanStatement } from "./scan.ts";
export { checkValues, numbersIn, percentagesIn, statedRange, type ValueCheck, type ValueVerdict } from "./values.ts";

export interface FormulaCheck {
  /** "R0", "Rv": the quantity, as the paper names it. */
  readonly name: string;
  /** The paper's equation number, when it numbers it. */
  readonly equation: string | null;
  readonly latex: string;
  readonly anchor: Anchor | null;
  /** At the model's values; null when it could not be read. */
  readonly value: number | null;
  readonly problem: string | null;
  /** Whether the model's own next-generation matrix gives the same, at the same values. */
  readonly agrees: boolean | null;
  /** The model's parameters set to none for the two to agree: those the formula leaves out, as a basic reproduction number leaves out a control. */
  readonly zeroed: readonly string[];
}

export interface StatedValue {
  readonly name: string;
  readonly value: number;
  readonly quote: string;
  readonly anchor: Anchor | null;
  /** The paper's own formula of that name at the model's values. */
  readonly computed: number | null;
  readonly agrees: boolean | null;
}

export interface Statement {
  readonly text: string;
  readonly origin: Origin;
  readonly anchors: readonly Anchor[];
}

export type Verdict = "holds" | "mismatch" | "unresolved" | "not-applicable";

export interface ReproducibilityCheck {
  readonly schemaVersion: "reproducibility/1";
  readonly headline: {
    readonly text: string;
    readonly quote: string;
    readonly aboutReproductionNumber: boolean;
    /** The threshold the headline states, 0.52 for "52%", as written. */
    readonly threshold: { readonly value: number; readonly written: string } | null;
    /** The parameter the threshold is for, and the word the headline names it by. */
    readonly lever: { readonly id: string; readonly symbol: string; readonly word: string } | null;
  };
  readonly ngm: { readonly r0: number; readonly infected: readonly string[]; readonly sources: readonly string[]; readonly transmission: readonly string[] } | { readonly problem: string };
  readonly formulas: readonly FormulaCheck[];
  readonly stated: readonly StatedValue[];
  /** The reproduction number across the lever's range, by the model's own next-generation matrix. */
  readonly sweep: { readonly lever: string; readonly from: number; readonly to: number; readonly min: number; readonly max: number; readonly crossings: readonly number[] } | null;
  readonly values: readonly ValueCheck[];
  readonly scan: ScanResult;
  readonly verdict: Verdict;
  readonly reasons: readonly string[];
  /** When the mismatch is confirmed: what level 1 says, a computed observation. */
  readonly observation: string | null;
  /**
   * Why a job should stop for the owner, or null: on a headline about the reproduction number,
   * a value that may be misread, or the paper's formula and the model's own equations disagreeing,
   * point to a mistake of ours, to be fixed before a world says anything about the headline.
   */
  readonly stop: string | null;
  /** One line for the job's events. */
  readonly summary: string;
  /** The journal's page, "Running the paper's own numbers": each statement with its origin. */
  readonly statements: readonly Statement[];
}

export interface CheckInput {
  readonly source: SourceText;
  readonly model: ModelSpec;
  readonly headline: { readonly text: string; readonly quote: string };
}

const R_NAME = /^R(0|O|o|v|V|c|e|eff)$/;
const STOP = new Set(["rate", "rates", "proportion", "individuals", "individual", "number", "population", "those", "with", "from", "after", "under", "into", "their", "that", "this", "which", "cases", "people"]);
const shown = (value: number): string => (Number.isFinite(value) ? Number(value.toPrecision(3)).toString() : "not a number");
const two = (value: number): string => value.toFixed(2);
const near = (a: number, b: number, tolerance: number): boolean => Math.abs(a - b) <= tolerance * Math.max(Math.abs(a), Math.abs(b), 1e-300);
const nameOf = (name: string): string => (name === "RO" || name === "Ro" ? "R0" : name);

/** The parts of an equation joined by "=" at its top level, outside braces and brackets. */
function sides(latex: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let at = 0; at < latex.length; at++) {
    const char = latex[at];
    if (char === "{" || char === "(" || char === "[") depth++;
    else if (char === "}" || char === ")" || char === "]") depth--;
    else if (char === "=" && depth === 0) {
      parts.push(latex.slice(start, at));
      start = at + 1;
    }
  }
  parts.push(latex.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part !== "");
}

/** Symbols defined in a stretch of text, "$m_{1} = μ + r$", first definition first. */
function definitionsIn(text: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of text.matchAll(/\$([^$]{1,400})\$/g)) {
    const parts = sides(match[1] ?? "");
    if (parts.length !== 2) continue;
    const name = symbolName(parts[0] ?? "");
    if (name !== "" && !found.has(name)) found.set(name, (parts[1] ?? "").replace(/[,.;]\s*$/, ""));
  }
  return found;
}

/** The paper's reproduction-number formulas, read and evaluated at the model's values. */
function readFormulas(source: SourceText, model: ModelSpec): { readonly name: string; readonly equation: string | null; readonly latex: string; readonly anchor: Anchor | null; readonly expr: Expr | null; readonly problem: string | null }[] {
  const bySymbol = new Map(model.parameters.map((parameter) => [symbolName(parameter.symbol), parameter.id]));
  const out: { name: string; equation: string | null; latex: string; anchor: Anchor | null; expr: Expr | null; problem: string | null }[] = [];
  for (const equation of source.equations) {
    const parts = sides(equation.latex.replace(/\\\\/g, " "));
    const name = nameOf(symbolName(parts[0] ?? ""));
    if (parts.length < 2 || !R_NAME.test(name)) continue;
    const section = source.sections.find((candidate) => candidate.id === equation.sectionId);
    const after = definitionsIn(source.text.slice(equation.end, section?.end ?? equation.end + 1500));
    const before = definitionsIn(source.text.slice(section?.start ?? Math.max(0, equation.start - 1500), equation.start));
    const resolve = (seen: ReadonlySet<string>) => (symbol: string): Expr => {
      const parameter = bySymbol.get(symbol);
      if (parameter !== undefined) return { p: parameter };
      const defined = after.get(symbol) ?? before.get(symbol);
      if (defined !== undefined && !seen.has(symbol)) return parseFormula(defined, resolve(new Set([...seen, symbol])));
      throw new FormulaError(`it names ${symbol}, which is neither one of the model's parameters nor defined beside the formula`);
    };
    let expr: Expr | null = null;
    let problem: string | null = null;
    // The explicit side first: "ℛ0 = ℛI + ℛC = \frac{…}" is read from its last side.
    for (const side of parts.slice(1).reverse()) {
      try {
        expr = parseFormula(side.replace(/[,.;]\s*$/, ""), resolve(new Set([name])));
        problem = null;
        break;
      } catch (error) {
        problem ??= error instanceof Error ? error.message : String(error);
      }
    }
    out.push({ name, equation: equation.number ?? null, latex: equation.latex, anchor: anchorOf(source, equation.latex), expr, problem: expr ? null : problem });
  }
  return out;
}

/** The numbers the paper states for a reproduction number in its own results, "We obtained R0 = 2.67". */
function statedValues(source: SourceText): { readonly name: string; readonly value: number; readonly quote: string }[] {
  const found: { name: string; value: number; quote: string }[] = [];
  const pattern = /(?:\\mathscr\{R\}|\\mathcal\{R\}|ℛ|\bR)\s*_\s*\{?\s*(0|O|v|V|c|e|eff)\s*\}?\s*\$?\s*(?:=|≈|\\approx)\s*\$?\s*(\d+(?:\.\d+)?)/g;
  for (const section of source.sections) {
    if (/introduction|literature|background|review|related/i.test(section.title)) continue;
    const text = source.text.slice(section.start, section.end);
    for (const match of text.matchAll(pattern)) {
      if (source.equations.some((equation) => equation.start <= section.start + (match.index ?? 0) && section.start + (match.index ?? 0) < equation.end)) continue;
      const at = match.index ?? 0;
      const from = Math.max(text.lastIndexOf(". ", at) + 2, text.lastIndexOf("\n", at) + 1, 0);
      const end = text.indexOf(".", at + match[0].length);
      // A threshold, "a bifurcation at R0 = 1", is not a result.
      if (Number(match[2]) === 1 || Number(match[2]) === 0) continue;
      found.push({ name: nameOf(`R${match[1] ?? ""}`), value: Number(match[2]), quote: text.slice(from, end < 0 ? Math.min(text.length, at + 200) : end + 1).trim().slice(0, 290) });
    }
  }
  return found;
}

/** The parameter a headline's threshold is for: the one whose name it uses, the quote counting twice. */
function leverOf(model: ModelSpec, headline: CheckInput["headline"]): { readonly id: string; readonly symbol: string; readonly word: string } | null {
  const scored = model.parameters
    .filter((parameter) => !parameter.id.endsWith("0"))
    .map((parameter) => {
      const words = parameter.name.toLowerCase().split(/[^a-z]+/).filter((word) => word.length >= 4 && !STOP.has(word));
      const inQuote = words.filter((word) => headline.quote.toLowerCase().includes(word));
      const inText = words.filter((word) => headline.text.toLowerCase().includes(word));
      return { parameter, score: 2 * inQuote.length + inText.length, word: inQuote[0] ?? inText[0] ?? "" };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  const [best, next] = scored;
  if (!best || (next && next.score === best.score)) return null;
  return { id: best.parameter.id, symbol: best.parameter.symbol, word: best.word };
}

/** The table a value's quote stands in, "Table 1", from the caption above it. */
function tableOf(source: SourceText, quote: string): string | null {
  const at = source.text.indexOf(quote);
  if (at < 0) return null;
  const before = source.text.slice(Math.max(0, at - 4000), at);
  const caption = [...before.matchAll(/^Table\s*(\d+)\s*:/gm)].at(-1);
  return caption ? `Table ${caption[1] ?? ""}` : null;
}

export function runOwnNumbers(input: CheckInput): ReproducibilityCheck {
  const { source, model, headline } = input;
  const values = Object.fromEntries(model.parameters.map((parameter) => [parameter.id, parameter.defaultValue]));
  const reasons: string[] = [];
  /** The reasons that may be our own mistake: a value misread, our equations and the paper's formula apart. */
  const ours: string[] = [];

  // The model's own R0, and the paper's formulas beside it.
  const own = nextGeneration(model, values);
  const ngm = own.ok ? { r0: own.value.r0, infected: own.value.infected, sources: own.value.sources, transmission: own.value.transmission } : { problem: own.reason };
  const rateParameters = model.parameters.filter((parameter) => !parameter.id.endsWith("0") || !model.compartments.some((compartment) => `${compartment.id}0` === parameter.id)).map((parameter) => parameter.id);
  const read = readFormulas(source, model);
  // A formula the paper restates, "R0 = RI + RC + RCq" after equation (7), is counted once, numbered first.
  const distinct = read
    .filter((formula) => formula.expr !== null || !read.some((other) => other !== formula && other.name === formula.name && other.expr !== null))
    .sort((a, b) => Number(b.equation !== null) - Number(a.equation !== null))
    .filter((formula, index, all) => formula.expr === null || !all.slice(0, index).some((other) => other.expr !== null && other.name === formula.name && near(evaluate(other.expr, values), evaluate(formula.expr as Expr, values), 1e-9)))
    .sort((a, b) => read.indexOf(a) - read.indexOf(b));
  const formulas: FormulaCheck[] = distinct.map((formula) => {
    if (!formula.expr) return { name: formula.name, equation: formula.equation, latex: formula.latex, anchor: formula.anchor, value: null, problem: formula.problem, agrees: null, zeroed: [] };
    const value = evaluate(formula.expr, values);
    if (!own.ok) return { name: formula.name, equation: formula.equation, latex: formula.latex, anchor: formula.anchor, value, problem: null, agrees: null, zeroed: [] };
    if (near(value, own.value.r0, 1e-6)) return { name: formula.name, equation: formula.equation, latex: formula.latex, anchor: formula.anchor, value, problem: null, agrees: true, zeroed: [] };
    // A basic reproduction number leaves a control out: set what the formula leaves out to none, and compare again.
    const used = parametersOf(formula.expr);
    const zeroed = rateParameters.filter((id) => !used.has(id));
    const without = nextGeneration(model, { ...values, ...Object.fromEntries(zeroed.map((id) => [id, 0])) });
    const agrees = without.ok && near(value, without.value.r0, 1e-6);
    return { name: formula.name, equation: formula.equation, latex: formula.latex, anchor: formula.anchor, value, problem: null, agrees, zeroed: agrees ? zeroed : [] };
  });
  if (!own.ok) reasons.push(`the model's own reproduction number cannot be computed: ${own.reason}`);
  if (formulas.length === 0) reasons.push("the paper gives no formula for its reproduction number that the check can find");
  for (const formula of formulas.filter((entry) => entry.agrees === false)) ours.push(`the paper's ${formula.name}${formula.equation ? `, equation (${formula.equation}),` : ""} gives ${shown(formula.value ?? Number.NaN)} at the model's values, and the model's own equations give ${own.ok ? shown(own.value.r0) : "nothing"}: the transcription or the formula differs`);
  reasons.push(...ours);

  const stated: StatedValue[] = statedValues(source).map((entry) => {
    const formula = formulas.find((candidate) => candidate.name === entry.name && candidate.value !== null);
    const computed = formula?.value ?? null;
    return { ...entry, anchor: anchorOf(source, entry.quote), computed, agrees: computed === null ? null : near(computed, entry.value, 0.05) };
  });

  // The values, against their quotes; and other values behind the headline.
  const checked = checkValues(model, source);
  const misread = checked.filter((entry) => entry.verdict === "mismatch");
  const scan = scanForOtherValues(source, model, headline.quote);

  // The headline: about the reproduction number, with a threshold for one of the model's values?
  const words = `${headline.text} ${headline.quote}`;
  const aboutReproductionNumber = /reproduction number|reproductive number|ℛ|\\mathscr\{R\}|\bR_?\{?0\}?\b/i.test(words);
  const percents = percentagesIn(headline.quote).concat(percentagesIn(headline.text));
  const threshold = percents[0] !== undefined ? { value: percents[0] / 100, written: `${percents[0]}%` } : null;
  const lever = aboutReproductionNumber && threshold ? leverOf(model, headline) : null;

  let sweep: ReproducibilityCheck["sweep"] = null;
  let verdict: Verdict = "not-applicable";
  if (aboutReproductionNumber && threshold) {
    if (!lever) reasons.push("which of the model's values the headline's threshold is for cannot be told from its words");
    else if (own.ok) {
      const parameter = model.parameters.find((candidate) => candidate.id === lever.id);
      const [from, to] = statedRange(parameter ? quoteOf(parameter) : "") ?? parameter?.range ?? [0, 1];
      const points = Array.from({ length: 101 }, (_, index) => from + ((to - from) * index) / 100);
      const r0s = points.map((point) => {
        const result = nextGeneration(model, { ...values, [lever.id]: point });
        return result.ok ? result.value.r0 : Number.NaN;
      });
      const finite = r0s.filter(Number.isFinite);
      const crossings: number[] = [];
      for (let index = 1; index < points.length; index++) {
        const [a, b] = [r0s[index - 1] ?? Number.NaN, r0s[index] ?? Number.NaN];
        if (Number.isFinite(a) && Number.isFinite(b) && (a - 1) * (b - 1) < 0) crossings.push((points[index - 1] ?? 0) + (((points[index] ?? 0) - (points[index - 1] ?? 0)) * (1 - a)) / (b - a));
      }
      sweep = { lever: lever.id, from, to, min: Math.min(...finite), max: Math.max(...finite), crossings };
    }
    if (misread.length > 0) {
      const words = `a value may be misread: ${misread.map((entry) => `${entry.symbol} ${shown(entry.value)}, ${entry.note}`).join("; ")}`;
      reasons.push(words);
      ours.push(words);
    }
    if (scan.otherValues.length > 0) reasons.push(`other values stand behind the headline: ${scan.otherValues.map((entry) => `${entry.text} in ${entry.where}`).join("; ")}`);
    const swept = sweep;
    const holds = swept !== null && swept.crossings.some((crossing) => Math.abs(crossing - threshold.value) <= Math.max(0.1 * Math.abs(threshold.value), 0.02 * (swept.to - swept.from)));
    verdict = reasons.length > 0 ? "unresolved" : holds ? "holds" : sweep ? "mismatch" : "unresolved";
  }

  // What level 1 says when the mismatch is confirmed, neutrally: never that the paper is wrong.
  const leverParameter = lever ? model.parameters.find((parameter) => parameter.id === lever.id) : undefined;
  const leverQuote = leverParameter ? quoteOf(leverParameter) : "";
  const listedIn = tableOf(source, leverQuote) ?? "its table of values";
  const observation =
    verdict === "mismatch" && sweep && lever && threshold
      ? `At the values the paper lists in ${listedIn}, R0 stays between ${two(sweep.min)} and ${two(sweep.max)} for every ${lever.word} from ${shown(sweep.from)} to ${shown(sweep.to)}, so the ${threshold.written} threshold doesn't appear here; the paper's figure may use values it doesn't list.`
      : null;

  const headlineAnchor = anchorOf(source, headline.quote);
  const symbolOf = (id: string): string => model.parameters.find((parameter) => parameter.id === id)?.symbol ?? id;
  const statements: Statement[] = [
    ...(aboutReproductionNumber && headlineAnchor ? [{ text: `The paper's headline: "${headline.quote}"`, origin: "paper-derived" as const, anchors: [headlineAnchor] }] : []),
    ...formulas.map((formula) => ({
      text:
        formula.value === null
          ? `The paper's ${formula.name}${formula.equation ? `, equation (${formula.equation})` : ""}, could not be read: ${formula.problem ?? ""}.`
          : `${formula.name} by the paper's own formula${formula.equation ? `, equation (${formula.equation})` : ""}, at the values it lists: ${shown(formula.value)}${formula.agrees === true ? `; the model's own equations give the same${formula.zeroed.length > 0 ? ` with ${formula.zeroed.map(symbolOf).join(", ")} set to none, as the formula leaves them out` : ""}` : formula.agrees === false ? "; the model's own equations give another number" : ""}.`,
      origin: "computed-observation" as const,
      anchors: formula.anchor ? [formula.anchor] : [],
    })),
    { text: own.ok ? `The reproduction number computed from the model's own equations, through its next-generation matrix (infected: ${own.value.infected.join(", ")}): ${shown(own.value.r0)}.` : `The reproduction number could not be computed from the model's own equations: ${own.reason}.`, origin: "computed-observation", anchors: [] },
    ...stated.map((entry) => ({
      text: `The paper states ${entry.name} = ${shown(entry.value)}${entry.computed === null ? "." : entry.agrees ? `, and its formula gives ${shown(entry.computed)} at the values it lists.` : `; at the values it lists, its formula gives ${shown(entry.computed)}, so the stated value may rest on values it doesn't list.`}`,
      origin: "computed-observation" as const,
      anchors: entry.anchor ? [entry.anchor] : [],
    })),
    ...scan.headlineCaptions.flatMap((caption) => {
      const anchor = anchorOf(source, caption.sentence);
      return anchor ? [{ text: `${caption.where.charAt(0).toUpperCase()}${caption.where.slice(1)} says: "${caption.sentence}"`, origin: "paper-derived" as const, anchors: [anchor] }] : [];
    }),
    ...(sweep && lever ? [{ text: `Across ${lever.word} from ${shown(sweep.from)} to ${shown(sweep.to)}, R0 runs between ${two(sweep.min)} and ${two(sweep.max)}${sweep.crossings.length > 0 ? `, crossing 1 at ${sweep.crossings.map(shown).join(" and ")}` : ", never crossing 1"}.`, origin: "computed-observation" as const, anchors: [] }] : []),
    {
      text:
        misread.length === 0
          ? `Every value checked against its passage: ${checked.filter((entry) => entry.verdict === "as written").length} as written, ${checked.filter((entry) => entry.verdict === "converted").length} converted into ${model.timeUnit}s, ${checked.filter((entry) => entry.verdict === "a percentage, read as a fraction").length} percentages read as fractions; none per another time unit than the model's.`
          : `Values to look at again: ${misread.map((entry) => `${entry.symbol}, ${entry.note}`).join("; ")}.`,
      origin: "computed-observation",
      anchors: [],
    },
    { text: `Looked for other values behind the headline in ${scan.looked.join("; ")}: ${scan.otherValues.length > 0 ? scan.otherValues.map((entry) => `${entry.text} in ${entry.where}`).join("; ") : "none found"}.`, origin: "computed-observation", anchors: [] },
    ...(observation ? [{ text: observation, origin: "computed-observation" as const, anchors: [] }] : []),
  ];

  const stop = ours.length > 0 && aboutReproductionNumber && threshold ? `running the paper's own numbers points to a mistake of ours, to be fixed before a world says anything of its headline: ${ours.join("; ")}` : null;
  const firstFormula = formulas.find((formula) => formula.value !== null);
  const summary = [
    firstFormula ? `${firstFormula.name} by the paper's formula${firstFormula.equation ? ` (${firstFormula.equation})` : ""} ${shown(firstFormula.value ?? Number.NaN)}` : "no formula of the paper's read",
    own.ok ? `by the model's own equations ${shown(own.value.r0)}` : `not from the model's own equations: ${own.reason}`,
    `${checked.filter((entry) => entry.verdict !== "mismatch").length} of ${checked.length} values as their quotes state them`,
    scan.otherValues.length > 0 ? `${scan.otherValues.length} other value(s) behind the headline` : "no other values behind the headline",
    verdict === "mismatch" ? `the headline's ${threshold?.written ?? ""} threshold does not appear at the listed values: level 1 tests its direction` : verdict === "holds" ? "the headline appears at the listed values" : verdict === "unresolved" ? `unresolved: ${reasons.join("; ")}` : "the headline states no threshold to check",
  ].join("; ");

  return {
    schemaVersion: "reproducibility/1",
    headline: { text: headline.text, quote: headline.quote, aboutReproductionNumber, threshold, lever },
    ngm,
    formulas,
    stated,
    sweep,
    values: checked,
    scan,
    verdict,
    reasons,
    observation,
    stop,
    summary,
    statements,
  };
}
