/**
 * Scores a stage's output against a gold answer, for the bake-off (eval/models.md). Deterministic:
 * the same output and gold give the same score, so a recorded bake-off replays to the same table.
 */
import type { SourceText } from "@paperplay/contracts";
import { findQuote, toModelSpec } from "./convert.ts";
import type { Gold } from "./gold.ts";
import { matchModels } from "./match.ts";
import type { TranscriptionWithSets as Transcription, ValueSet } from "./schema.ts";
import { compareValueSets, pickValueSet, withValueSet } from "./valuesets.ts";

export interface TranscriptionScore {
  /** Whether it became a model at all: every formula parsed and every quote was found. */
  readonly converted: boolean;
  /** Whether its equations and starting values agree with the gold's, up to renaming. */
  readonly structural: boolean;
  /** Of the gold's parameters and starting values, how many it read right, a value the paper also states counting. */
  readonly valuesRight: number;
  readonly valuesTotal: number;
  /** Of its quotes, how many the source holds. */
  readonly quotesFound: number;
  readonly quotesTotal: number;
  /** When the paper states several value sets: the gold's sets this one also lists, and whether its rule picks the gold's. */
  readonly setsFound: number;
  readonly setsTotal: number;
  readonly pickRight: boolean | null;
  readonly problems: readonly string[];
}

const close = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-6 * Math.max(Math.abs(a), Math.abs(b), 1e-300);

/** A transcription with the value set its rule picks applied, when it lists sets; else as it is. */
function applyPick(transcription: Transcription, source: SourceText, wanted?: string): { readonly transcription: Transcription; readonly picked: ValueSet | null } {
  const sets = transcription.valueSets ?? [];
  const chosen = wanted ? (sets.find((set) => set.id === wanted) ?? null) : sets.length > 0 ? pickValueSet(sets, source).set : null;
  return chosen ? { transcription: withValueSet(transcription, chosen).transcription, picked: chosen } : { transcription, picked: null };
}

export function scoreTranscription(original: Transcription, gold: Gold, source: SourceText): TranscriptionScore {
  // Each scored on the set its rule picks; the gold on the set it names.
  const own = applyPick(original, source);
  const golden = applyPick(gold.transcription, source, gold.picked);
  const transcription = own.transcription;
  const goldSets = gold.transcription.valueSets ?? [];
  const sets = goldSets.length > 0 ? compareValueSets(goldSets, original.valueSets ?? []) : null;
  const setsFound = sets ? Object.values(sets.pairs).filter((pair) => pair !== null).length : 0;
  const pickRight = sets && golden.picked ? own.picked !== null && sets.pairs[golden.picked.id] === own.picked.id : null;
  const setScore = { setsFound, setsTotal: goldSets.length, pickRight };
  const quotes = [
    ...transcription.compartments.flatMap((compartment) => [compartment.quote, ...(compartment.initialQuote ? [compartment.initialQuote] : [])]),
    ...transcription.parameters.map((parameter) => parameter.quote),
    ...transcription.equations.map((equation) => equation.quote),
  ];
  const quotesFound = quotes.filter((quote) => findQuote(source.text, quote, "whole") !== null).length;
  const mine = { model: modelForComparison(transcription, source), problems: [] as string[] };
  const theirs = toModelSpec(golden.transcription, source);
  const valuesTotal = gold.transcription.parameters.length + gold.transcription.compartments.length;
  if (!mine.model || !theirs.model) {
    const strict = toModelSpec(transcription, source);
    return { converted: false, structural: false, valuesRight: 0, valuesTotal, quotesFound, quotesTotal: quotes.length, ...setScore, problems: strict.problems.slice(0, 3) };
  }
  const match = matchModels(theirs.model, mine.model);
  let valuesRight = 0;
  if (match.structural) {
    // The converter lists the paper's parameters first, then each compartment's starting value, in order.
    const goldIds = [...gold.transcription.parameters.map((parameter) => parameter.id), ...gold.transcription.compartments.map((compartment) => compartment.id)];
    theirs.model.parameters.forEach((parameter, index) => {
      const other = mine.model?.parameters.find((candidate) => candidate.id === match.parameters[parameter.id]);
      const accepted = [parameter.defaultValue, ...(gold.acceptableValues[goldIds[index] ?? ""] ?? [])];
      if (other && accepted.some((value) => close(value, other.defaultValue))) valuesRight++;
    });
  }
  return { converted: true, structural: match.structural, valuesRight, valuesTotal, quotesFound, quotesTotal: quotes.length, ...setScore, problems: match.structural ? [] : match.problems.slice(0, 3) };
}

/**
 * A transcription's model for comparing equations, whatever its quotes say: a quote the source does
 * not hold is set aside here, since quotes are scored on their own. Null when a formula does not parse.
 */
export function modelForComparison(transcription: Transcription, source: SourceText) {
  const anyQuote = source.text.slice(0, Math.min(40, source.text.length)).trim();
  const keep = (quote: string): string => (findQuote(source.text, quote, "whole") ? quote : anyQuote);
  const lenient: Transcription = {
    ...transcription,
    compartments: transcription.compartments.map((compartment) => ({ ...compartment, quote: keep(compartment.quote), initialQuote: compartment.initialQuote && findQuote(source.text, compartment.initialQuote, "whole") ? compartment.initialQuote : null })),
    parameters: transcription.parameters.map((parameter) => ({ ...parameter, quote: keep(parameter.quote) })),
    equations: transcription.equations.map((equation) => ({ ...equation, quote: keep(equation.quote) })),
  };
  return toModelSpec(lenient, source).model;
}

export interface ReadingScore {
  /** The overlap of its model equations with the gold's, as intersection over union. */
  readonly equations: number;
  readonly resultQuoteFound: boolean;
  /** Its findings whose quotes the source holds, of all it gives (ADR-0037). */
  readonly findingQuotesFound: number;
  readonly findingQuotesTotal: number;
  /** Whether it gives enough anchored findings, the headline included, for three levels to test. */
  readonly enoughFindings: boolean;
}

export function scoreReading(reading: { readonly modelEquations: readonly string[]; readonly result: { readonly quote: string }; readonly findings: readonly { readonly quote: string }[] }, gold: Gold, source: SourceText): ReadingScore {
  const mine = new Set(reading.modelEquations);
  const theirs = new Set(gold.modelEquations);
  const union = new Set([...mine, ...theirs]).size;
  const both = [...mine].filter((id) => theirs.has(id)).length;
  return {
    equations: union === 0 ? 0 : both / union,
    resultQuoteFound: findQuote(source.text, reading.result.quote, "whole") !== null,
    findingQuotesFound: reading.findings.filter((finding) => findQuote(source.text, finding.quote, "whole") !== null).length,
    findingQuotesTotal: reading.findings.length,
    enoughFindings: [reading.result, ...reading.findings].filter((finding) => findQuote(source.text, finding.quote, "whole") !== null).length >= 3,
  };
}
