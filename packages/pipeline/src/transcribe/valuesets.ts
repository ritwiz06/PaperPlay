/**
 * Several sets of values in one paper (the owner, 2026-10-16). Each transcription lists every set;
 * a deterministic rule picks one: the set the paper's main results use, values fitted to data
 * before illustrative ones, then the set behind the paper's first results figure or table. Only
 * when that still leaves more than one does the job go to the owner. Two transcriptions' sets are
 * paired by the values they share, never by their labels, so a set is the same set however each
 * transcriber names it.
 */
import type { SourceText } from "@paperplay/contracts";
import { findQuote } from "./convert.ts";
import type { TranscriptionWithSets as Transcription, ValueSet } from "./schema.ts";

export type ValueSetPick = { readonly set: ValueSet; readonly reason: string } | { readonly set: null; readonly ambiguous: string };

const close = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-6 * Math.max(Math.abs(a), Math.abs(b), 1e-300);

/** Where a set's first results figure or table first appears in the paper, so earlier comes first. */
function firstResultAt(set: ValueSet, source: SourceText): number {
  if (set.firstResult === null) return Number.POSITIVE_INFINITY;
  return findQuote(source.text, set.firstResult)?.start ?? Number.POSITIVE_INFINITY;
}

/** The rule, on one transcription's sets. */
export function pickValueSet(sets: readonly ValueSet[], source: SourceText): ValueSetPick {
  if (sets.length === 0) return { set: null, ambiguous: "the transcription lists no value sets" };
  if (sets.length === 1 && sets[0]) return { set: sets[0], reason: "the paper states one set of values" };
  const main = sets.filter((set) => set.mainResults);
  let group = main.length > 0 ? main : [...sets];
  let reason = main.length > 0 ? "the set the paper's main results use" : "no set is said to be behind the main results";
  const fitted = group.filter((set) => set.fittedToData);
  if (group.length > 1 && fitted.length > 0 && fitted.length < group.length) {
    group = fitted;
    reason = `${reason}, fitted to data rather than illustrative`;
  }
  if (group.length === 1 && group[0]) return { set: group[0], reason };
  // Then the set behind the paper's first results figure or table.
  const at = group.map((set) => ({ set, at: firstResultAt(set, source) })).sort((a, b) => a.at - b.at);
  const [first, second] = at;
  if (first && Number.isFinite(first.at) && (!second || first.at < second.at)) return { set: first.set, reason: `${reason}; behind the first results figure or table, ${first.set.firstResult ?? ""}` };
  return { set: null, ambiguous: `${group.map((set) => `"${set.label}"`).join(" and ")} are equally the paper's: ${reason}, and no first results figure or table tells them apart` };
}

/** The transcription with a set's values as its own: each value, and its quote where the set gives one. */
export function withValueSet(transcription: Transcription, set: ValueSet): { readonly transcription: Transcription; readonly problems: readonly string[] } {
  const byId = new Map(set.values.map((value) => [value.of, value]));
  const known = new Set([...transcription.parameters.map((parameter) => parameter.id), ...transcription.compartments.map((compartment) => compartment.id)]);
  const problems = set.values.filter((value) => !known.has(value.of)).map((value) => `the set "${set.label}" gives a value for ${value.of}, which the model does not have`);
  return {
    transcription: {
      ...transcription,
      parameters: transcription.parameters.map((parameter) => {
        const given = byId.get(parameter.id);
        return given ? { ...parameter, value: given.value, quote: given.quote ?? parameter.quote } : parameter;
      }),
      compartments: transcription.compartments.map((compartment) => {
        const given = byId.get(compartment.id);
        return given ? { ...compartment, initial: given.value, initialQuote: given.quote ?? compartment.initialQuote } : compartment;
      }),
    },
    problems,
  };
}

/** How many of a set's values another set shares, whatever either calls them. */
const shared = (a: ValueSet, b: ValueSet): number => {
  const left = b.values.map((value) => value.value);
  let count = 0;
  for (const value of a.values) {
    const at = left.findIndex((other) => close(other, value.value));
    if (at >= 0) {
      left.splice(at, 1);
      count++;
    }
  }
  return count;
};

export interface ValueSetComparison {
  /** Each of the first's sets, by id, and the second's set it pairs with, or null. */
  readonly pairs: Readonly<Record<string, string | null>>;
  readonly problems: readonly string[];
}

/** Two transcriptions' sets compared: each set pairs with the other's that shares at least half its values. */
export function compareValueSets(a: readonly ValueSet[], b: readonly ValueSet[]): ValueSetComparison {
  const pairs: Record<string, string | null> = {};
  const problems: string[] = [];
  if (a.length !== b.length) problems.push(`the first lists ${a.length} value sets, the second ${b.length}`);
  const taken = new Set<string>();
  for (const set of a) {
    const best = b.filter((other) => !taken.has(other.id)).map((other) => ({ other, count: shared(set, other) })).sort((x, y) => y.count - x.count)[0];
    if (best && best.count * 2 >= Math.max(set.values.length, best.other.values.length)) {
      pairs[set.id] = best.other.id;
      taken.add(best.other.id);
    } else {
      pairs[set.id] = null;
      problems.push(`the second has no set like the first's "${set.label}"`);
    }
  }
  return { pairs, problems };
}
