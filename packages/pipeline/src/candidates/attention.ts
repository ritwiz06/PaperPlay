/**
 * The attention family's candidate levels (ADR-0054, ADR-0055): from a setting of attention.toy,
 * one switch at a time, each switch the paper's own (§3.2.1 the √dk scaling, §3.2.2 the heads,
 * §3.2.3 the decoder's mask, §3.5 the positional encoding, §4 and Table 1 a recurrent layer's path),
 * measured on every observable. Each is judged by the primitive itself over 20 seeds, as the level
 * rule judges a world whose weights vary with its seed: its claim must hold on 16. Code finds the
 * levels; a planner, later, only chooses among them (ADR-0056).
 */
import { attentionToy, type AttentionObservables, type AttentionParams } from "@paperplay/primitives/attention";
import type { CandidateGenerator, LevelCandidate } from "./types.ts";

/** A setting a level switches. */
export type AttentionSetting = "scaled" | "positional" | "causal" | "recurrent" | "heads";

/** An attention level's facts: the switch, what it measures and the claim, with the paper's section. */
export interface AttentionLevel {
  readonly whatIf: { readonly setting: AttentionSetting; readonly from: number; readonly to: number };
  readonly measure: keyof AttentionObservables;
  readonly relation: "higher" | "lower";
  readonly by: number;
  readonly section: string;
}

/** The seeds the claim is checked on, and how many it must hold on: the level rule's 16 of 20. */
export const ATTENTION_SEEDS: readonly number[] = Array.from({ length: 20 }, (_, index) => index + 1);
export const ATTENTION_HOLDS = 16;

const SWITCHES: readonly { readonly setting: AttentionSetting; readonly to: (params: AttentionParams) => number; readonly section: string; readonly words: string }[] = [
  { setting: "scaled", to: () => 0, section: "§3.2.1", words: "the dot products no longer divided by √dk" },
  { setting: "positional", to: () => 0, section: "§3.5", words: "the positional encoding taken away" },
  { setting: "causal", to: () => 1, section: "§3.2.3", words: "the decoder's mask on, so no word attends to a later one" },
  { setting: "recurrent", to: () => 1, section: "§4, Table 1", words: "the layer counted as a recurrent one" },
  { setting: "heads", to: () => 1, section: "§3.2.2", words: "one head instead of several, at the same width" },
];

const shown = (value: number): string => Number(value.toPrecision(3)).toString();
const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

/**
 * Every switch the setting allows, on every observable, kept where the What-if moves it the same way
 * on 16 of 20 seeds by more than half its median change, and by a tenth of its size at least.
 */
export const attentionCandidates: CandidateGenerator<AttentionParams, undefined, AttentionLevel> = (params) => {
  const candidates: LevelCandidate<AttentionLevel>[] = [];
  const measures = Object.keys(attentionToy.describe().observables) as (keyof AttentionObservables)[];
  for (const change of SWITCHES) {
    const from = params[change.setting];
    const to = change.to(params);
    if (from === to) continue;
    const there = { ...params, [change.setting]: to };
    const pairs = ATTENTION_SEEDS.map((seed) => [attentionToy.measure(attentionToy.init(params, seed)), attentionToy.measure(attentionToy.init(there, seed))] as const);
    for (const measure of measures) {
      const differences = pairs.map(([here, away]) => away[measure] - here[measure]);
      const typical = median(differences);
      const size = median(pairs.map(([here, away]) => Math.max(Math.abs(here[measure]), Math.abs(away[measure]))));
      if (typical === 0 || !Number.isFinite(typical) || Math.abs(typical) < 0.1 * size) continue;
      const relation = typical > 0 ? "higher" : "lower";
      const by = Number((Math.abs(typical) / 2).toPrecision(2));
      const holds = differences.filter((difference) => (relation === "higher" ? difference > by : difference < -by)).length;
      if (holds < ATTENTION_HOLDS) continue;
      const id = `a${candidates.length + 1}`;
      const here = median(pairs.map(([value]) => value[measure]));
      const away = median(pairs.map(([, value]) => value[measure]));
      candidates.push({
        id,
        level: { whatIf: { setting: change.setting, from, to }, measure, relation, by, section: change.section },
        brief: `${id} (${change.section}): What-if: ${change.words}; measures ${attentionToy.describe().observables[measure]?.meaning.toLowerCase() ?? measure} (${measure}): ${shown(here)} now, ${shown(away)} in the What-if, ${relation} by more than ${shown(by)}; holds on ${holds} of ${ATTENTION_SEEDS.length} seeds`,
        holds,
      });
    }
  }
  return candidates;
};
