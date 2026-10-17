/**
 * Other values behind the headline (ADR-0040): before a world says the paper's headline does not
 * appear at its listed values, the check looks where a paper puts the values a figure was drawn
 * with. It reads the passages that state the headline's numbers and the figures they cite, every
 * figure caption, and the sections on methods, simulation, estimation and supporting information,
 * and lists each value they state ("β = 0.05") and each table they say their values come from.
 */
import type { ModelSpec, SourceText } from "@paperplay/contracts";
import { symbolName } from "./formula.ts";
import { numbersIn, percentagesIn } from "./values.ts";

export interface ScanStatement {
  /** Where it stands: "Figure 7's caption", "the section 4 Numerical simulations". */
  readonly where: string;
  /** As the paper writes it, "\beta = 0.05". */
  readonly text: string;
  readonly parameter: string;
  readonly value: number;
  /** The model's value, at the picked set. */
  readonly chosen: number;
  readonly agrees: boolean;
  /** Whether it stands where the headline's figure is drawn or its numbers are stated. */
  readonly behindHeadline: boolean;
}

export interface ScanResult {
  /** The places read, in words, for the journal's page. */
  readonly looked: readonly string[];
  /** The figures the headline's passages cite, by number or label. */
  readonly headlineFigures: readonly string[];
  readonly statements: readonly ScanStatement[];
  /** Captions and passages that say which table their values come from: "Figure 1's caption: Table 1". */
  readonly tables: readonly string[];
  /** What the captions of the headline's figures say of their values, sentence by sentence, as the paper writes it. */
  readonly headlineCaptions: readonly { readonly where: string; readonly sentence: string }[];
  /** Another set of values found behind the headline: statements there that differ from the model's. */
  readonly otherValues: readonly ScanStatement[];
}

const SECTION = /method|numerical|simulation|parameter|estimat|supplement|supporting|appendix/i;
const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-6 * Math.max(Math.abs(a), Math.abs(b), 1e-300);

/** The strings a headline's numbers are written as: 52% as "52%", "52 %", "0.52". */
function searchStrings(quote: string): string[] {
  const percents = percentagesIn(quote);
  const strings = percents.flatMap((percent) => [`${percent}%`, `${percent} %`, `${percent}\\%`, String(percent / 100)]);
  for (const number of numbersIn(quote.replace(/(\d+(?:\.\d+)?)\s*(?:\\?%|percent\b)/g, ""))) if (!Number.isInteger(number) || number > 9) strings.push(String(number));
  return [...new Set(strings)];
}

/** Each "symbol = number" a passage states for one of the model's parameters. */
function statementsIn(text: string, model: ModelSpec): { readonly text: string; readonly parameter: string; readonly value: number }[] {
  const bySymbol = new Map(model.parameters.map((parameter) => [symbolName(parameter.symbol), parameter.id]));
  const found: { text: string; parameter: string; value: number }[] = [];
  const pattern = /(\\[A-Za-z]+|[A-Za-zΑ-ωϕϵϑ])\s*(_\s*(?:\{[^}]{1,8}\}|[A-Za-z0-9]))?\s*=\s*(-?(?:\d+(?:\.\d+)?|\.\d+)(?:\s*(?:\\times|×)\s*10\s*\^\s*\{?\s*-?\d+\s*\}?)?)/g;
  for (const match of text.matchAll(pattern)) {
    const parameter = bySymbol.get(symbolName(`${match[1] ?? ""}${match[2] ?? ""}`));
    const value = numbersIn(match[3] ?? "")[0];
    if (parameter !== undefined && value !== undefined) found.push({ text: match[0].trim(), parameter, value });
  }
  return found;
}

export function scanForOtherValues(source: SourceText, model: ModelSpec, headlineQuote: string): ScanResult {
  const text = source.text;
  const chosen = new Map(model.parameters.map((parameter) => [parameter.id, parameter.defaultValue]));
  const paragraphs = text.split(/\n{2,}/);

  // The headline's passages: the one quoting it, and those stating its numbers; and the figures they cite.
  const strings = searchStrings(headlineQuote);
  const headlinePassages = paragraphs.filter((paragraph) => paragraph.includes(headlineQuote.slice(0, 60)) || strings.some((string) => paragraph.includes(string)));
  const headlineFigures = [...new Set(headlinePassages.flatMap((paragraph) => [...paragraph.matchAll(/\bFig(?:ure|\.)?\s*(\d+)/g)].map((match) => match[1] ?? "").concat([...paragraph.matchAll(/\[(fig:[^\]]+)\]/g)].map((match) => match[1] ?? ""))))].filter(Boolean);

  // Captions, numbered in order where the text numbers its figures ("Figure: …", as JATS gives them).
  const captions = paragraphs.filter((paragraph) => /^(Figure|Caption)\s*:/.test(paragraph));
  const numbered = captions.filter((caption) => caption.startsWith("Figure"));
  const captionPlace = (caption: string): string => (caption.startsWith("Figure") ? `Figure ${numbered.indexOf(caption) + 1}'s caption` : `the caption "${caption.slice(9, 60).trim()}…"`);
  const sections = source.sections.filter((section) => SECTION.test(section.title));

  const places: { readonly where: string; readonly text: string; readonly behind: boolean }[] = [
    ...headlinePassages.map((paragraph) => ({ where: `the passage stating "${paragraph.slice(0, 50).replace(/\s+/g, " ").trim()}…"`, text: paragraph, behind: true })),
    ...captions.map((caption) => ({ where: captionPlace(caption), text: caption, behind: caption.startsWith("Figure") && headlineFigures.includes(String(numbered.indexOf(caption) + 1)) })),
    ...sections.map((section) => ({ where: `the section ${section.title}`, text: text.slice(section.start, section.end), behind: false })),
  ];
  const statements: ScanStatement[] = [];
  const tables: string[] = [];
  for (const place of places) {
    for (const statement of statementsIn(place.text, model)) {
      const value = chosen.get(statement.parameter) ?? Number.NaN;
      statements.push({ where: place.where, ...statement, chosen: value, agrees: near(statement.value, value), behindHeadline: place.behind });
    }
    for (const match of place.text.matchAll(/\b(?:values?|parameters?)\b[^.\n]{0,60}?\bTable\s*(\d+|\[[^\]]+\])/gi)) tables.push(`${place.where}: Table ${match[1] ?? ""}`);
  }
  const looked = [
    `the passages that state the headline${strings.length > 0 ? ` or its numbers (${strings.filter((string) => !string.endsWith(" %") && !string.endsWith("\\%")).join(", ")})` : ""}`,
    headlineFigures.length > 0 ? `the figure${headlineFigures.length > 1 ? "s" : ""} they cite (${headlineFigures.map((figure) => (/^\d+$/.test(figure) ? `Figure ${figure}` : figure)).join(", ")})` : "no figure: the headline's passages cite none",
    `every figure caption (${captions.length})`,
    sections.length > 0 ? `the sections ${sections.map((section) => section.title).join("; ")}` : "no section on methods, simulation, estimation or supporting information",
  ];
  const headlineCaptions = captions
    .filter((caption) => caption.startsWith("Figure") && headlineFigures.includes(String(numbered.indexOf(caption) + 1)))
    .flatMap((caption) => (caption.replace(/^Figure\s*:\s*/, "").match(/[^.]*\b(?:Table\s*\d+|values?|parameters?)\b[^.]*\./g) ?? []).map((sentence) => ({ where: captionPlace(caption), sentence: sentence.trim() })));
  return { looked, headlineFigures, statements, tables: [...new Set(tables)], headlineCaptions, otherValues: statements.filter((statement) => statement.behindHeadline && !statement.agrees) };
}
