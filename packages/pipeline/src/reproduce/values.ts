/**
 * Every value against its quote (ADR-0040): the number the model holds must be a number the
 * paper's passage holds, as written, or a percentage read as a fraction, or a rate converted from
 * the time unit the passage names into the model's. A rate the paper gives per day, read as
 * written into a model that runs in years, is the mistake this catches; so is a proportion read
 * as a whole number, and a value that is in no quote at all.
 */
import type { ModelSpec, SourceText } from "@paperplay/contracts";

export type ValueVerdict = "as written" | "a percentage, read as a fraction" | "converted" | "mismatch";

export interface ValueCheck {
  readonly id: string;
  readonly symbol: string;
  readonly value: number;
  readonly verdict: ValueVerdict;
  /** What the check found: the time unit the passage names, the percentage, or what is wrong. */
  readonly note: string;
}

/** Days in each time unit a model may run in; a rate per `from` is per `to` times DAYS[to] / DAYS[from]. */
const DAYS: Readonly<Record<string, number>> = { hour: 1 / 24, day: 1, week: 7, month: 365.25 / 12, year: 365.25 };
const TIME_WORDS: readonly (readonly [RegExp, string])[] = [
  [/\b(?:per\s+)?(?:hours?|hourly|hr)\b|\/h\b/i, "hour"],
  [/\b(?:per\s+)?(?:days?|daily)\b|\bd\^\{?-1\}?|\/d(?:ay)?\b/i, "day"],
  [/\b(?:per\s+)?(?:weeks?|weekly)\b|\/w(?:ee)?k\b/i, "week"],
  [/\b(?:per\s+)?(?:months?|monthly)\b|\/mo(?:nth)?\b/i, "month"],
  [/\b(?:per\s+)?(?:years?|yearly|annual|annually|per\s+annum|yrs?)\b|\/y(?:ea)?r\b/i, "year"],
];
const PROPORTION = /\b(proportion|fraction|probability|coverage|efficacy|percentage|share)\b/i;

/** Every number a passage holds, as written: 0.01, 1.658\times10^6, 7.75 × 10^{-7}, 2e-3, .5. */
export function numbersIn(text: string): number[] {
  const found: number[] = [];
  const clean = text.replace(/−/g, "-");
  for (const match of clean.matchAll(/(\d+(?:\.\d+)?|\.\d+)\s*(?:\\times|×|\\cdot|\*|x)\s*10\s*\^\s*\{?\s*(-?\d+)\s*\}?/g)) found.push(Number(match[1]) * 10 ** Number(match[2]));
  for (const match of clean.matchAll(/(\d+(?:\.\d+)?|\.\d+)[eE]([-+]?\d+)\b/g)) found.push(Number(`${match[1]}e${match[2]}`));
  for (const match of clean.matchAll(/\d+(?:\.\d+)?|\.\d+/g)) found.push(Number(match[0]));
  return found;
}

/** The percentages a passage states: "52%", "52 %", "52\%", "52 percent". */
export function percentagesIn(text: string): number[] {
  return [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:\\?%|percent\b)/g)].map((match) => Number(match[1]));
}

const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b), 1e-300);

/** The time units a passage, or the header of the table it stands in, names. */
function timeUnitsNear(source: SourceText, quote: string): string[] {
  const at = source.text.indexOf(quote);
  let context = quote;
  if (at >= 0 && quote.includes("|")) {
    // A table row: its table's lines run up to the header, and its caption may stand just above or below.
    const lines = source.text.slice(Math.max(0, at - 6000), at).split("\n");
    // The last piece is the row's own line, before the quote.
    lines.pop();
    const header: string[] = [];
    for (let index = lines.length - 1; index >= 0; index--) {
      const line = lines[index] ?? "";
      if (!line.includes("|")) {
        if (/^(Table|Caption)/.test(line)) header.push(line);
        break;
      }
      header.push(line);
    }
    // The header is the table's first line; a row's own neighbours name other parameters.
    context = `${quote}\n${header.at(-1) ?? ""}\n${header.find((line) => /^(Table|Caption)/.test(line)) ?? ""}`;
  }
  return [...new Set(TIME_WORDS.filter(([pattern]) => pattern.test(context)).map(([, unit]) => unit))];
}

/** The quote a parameter's value comes from: its first anchor's, or none for a placeholder. */
export function quoteOf(parameter: ModelSpec["parameters"][number]): string {
  const anchor = parameter.anchors?.find((candidate) => "quote" in candidate);
  return anchor && "quote" in anchor ? anchor.quote : "";
}

/** Each parameter's value against its quote, in the model's order. */
export function checkValues(model: ModelSpec, source: SourceText): ValueCheck[] {
  return model.parameters.map((parameter) => {
    const quote = quoteOf(parameter);
    const value = parameter.defaultValue;
    const base = { id: parameter.id, symbol: parameter.symbol, value };
    if (quote === "") return { ...base, verdict: "mismatch" as const, note: "it has no quote from the paper" };
    const written = numbersIn(quote);
    const percents = percentagesIn(quote);
    const isRate = parameter.unit?.time === -1;
    const units = isRate ? timeUnitsNear(source, quote) : [];
    const foreign = units.filter((unit) => unit !== model.timeUnit && DAYS[unit] !== undefined && DAYS[model.timeUnit] !== undefined);
    if (PROPORTION.test(parameter.name) && Object.keys(parameter.unit ?? {}).length === 0 && value > 1) return { ...base, verdict: "mismatch" as const, note: `a proportion above 1, ${value}` };
    if (percents.some((percent) => near(value, percent / 100)) && !written.some((number) => near(number, value) && !percents.includes(number))) return { ...base, verdict: "a percentage, read as a fraction" as const, note: `${percents.find((percent) => near(value, percent / 100))}%` };
    if (percents.some((percent) => near(value, percent))) return { ...base, verdict: "mismatch" as const, note: `the paper states ${value}%, and the model holds ${value}, not ${value / 100}` };
    const converted = foreign.find((unit) => written.some((number) => near(value, (number * (DAYS[model.timeUnit] ?? 1)) / (DAYS[unit] ?? 1))));
    if (converted) return { ...base, verdict: "converted" as const, note: `from per ${converted} to per ${model.timeUnit}` };
    if (written.some((number) => near(number, value))) {
      if (foreign.length > 0 && !units.includes(model.timeUnit)) return { ...base, verdict: "mismatch" as const, note: `the paper gives it per ${foreign.join(" or ")}, the model runs per ${model.timeUnit}, and it is read as written` };
      return { ...base, verdict: "as written" as const, note: units.length > 0 ? `per ${units.join(" or ")}` : "" };
    }
    return { ...base, verdict: "mismatch" as const, note: `${value} is not among the numbers its quote holds (${[...new Set(written)].slice(0, 6).join(", ") || "none"})` };
  });
}

/** The range a quote states for a value, "0.5 (0-1)", as [0, 1]; null when it states none. */
export function statedRange(quote: string): readonly [number, number] | null {
  const match = /\(\s*(\d*\.?\d+)\s*[-–—]\s*(\d*\.?\d+)\s*\)?/.exec(quote);
  if (!match) return null;
  const [low, high] = [Number(match[1]), Number(match[2])];
  return Number.isFinite(low) && Number.isFinite(high) && low < high ? [low, high] : null;
}
