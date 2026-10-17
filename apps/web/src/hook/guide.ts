/**
 * The guide (ADR-0008): "you did X, so Y", then what the primitive measured since. It reads
 * only the level's script from the WorldSpec, the session's values and the learner's last
 * action, and says nothing it did not get from them. At Beginner it uses words only, as the
 * slider does. Its first line is a teaching choice, its second a computed observation.
 */
import { isPlaceholder, RULE_HOLDS, RULE_SEEDS, type DifferenceClaim, type GuidedExploration, type GuideScript, type Observable, type Variation } from "@paperplay/contracts";
import type { Depth, GuideLine } from "@paperplay/ui/react";

export type Trend = "rising" | "falling" | "steady";

export interface GuideControl {
  readonly min: number;
  readonly step: number;
}

export interface GuideInput {
  /** The learner's last change to the control, or null before the first. */
  readonly lastAction: { readonly from: number; readonly to: number } | null;
  /** The control's variable, as the engine holds it. */
  readonly value: number;
  /** The level's observable, as the primitive measures it. */
  readonly observed: number;
  readonly trend: Trend;
  readonly playing: boolean;
  readonly depth: Depth;
}

/** The words of the first reading whose threshold the value reaches, or of the last. */
export function describeReading(readings: GuideScript["readings"], value: number): string {
  return (readings.find((reading) => value >= reading.atLeast) ?? readings.at(-1))?.words ?? "";
}

/** Rising or falling when the recent readouts moved more than `within` from first to last. */
export function trendOf(samples: readonly number[], within: number): Trend {
  const first = samples[0];
  const last = samples.at(-1);
  if (first === undefined || last === undefined) return "steady";
  if (last - first > within) return "rising";
  if (first - last > within) return "falling";
  return "steady";
}

export const decimalsOf = (step: number): number => Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

function didLine(script: GuideScript, control: GuideControl, { lastAction, value, depth }: GuideInput): GuideLine {
  const origin = "teaching-choice";
  if (!lastAction) return { text: script.idle, origin };
  if (value <= control.min && script.atMinimum) return { text: script.atMinimum, origin };
  const to = depth === "beginner" ? "" : ` to ${value.toFixed(decimalsOf(control.step))}`;
  // The placeholder brings its own "to": a line written "adherence to {to}, so" reads "adherence to
  // 0.61, so", and at Beginner "adherence, so", never "to , so".
  return { text: (lastAction.to > lastAction.from ? script.raised : script.lowered).replace(/(?:\s+to)?\s*\{to\}/, to), origin };
}

function sawLine(script: GuideScript, observable: Observable, { observed, trend, playing, depth }: GuideInput): GuideLine {
  const origin = "computed-observation";
  const words = describeReading(script.readings, observed);
  const paused = playing ? "" : "Paused. ";
  if (depth === "beginner") {
    const motion = !playing || trend === "steady" ? "" : `, ${script.trend[trend].beginner}`;
    return { text: `${paused}${capitalise(words)}${motion}.`, origin };
  }
  const decimals = depth === "advanced" ? observable.decimals : Math.max(observable.decimals - 1, 0);
  const label = depth === "advanced" ? observable.label : observable.shortLabel;
  const motion = !playing ? "" : ` and ${trend === "steady" ? script.trend.steady : script.trend[trend].measured}`;
  return { text: `${paused}${label} ${observed.toFixed(decimals)}${motion}: ${words}.`, origin };
}

export function guideLines(script: GuideScript, control: GuideControl, observable: Observable, input: GuideInput): readonly [GuideLine, GuideLine] {
  return [didLine(script, control, input), sawLine(script, observable, input)];
}

/** Where a guided exploration stands: predicted, then watching both worlds, then done. */
export interface ExplorationState {
  /** The choice the learner made, by index. */
  readonly predicted: number;
  /** What the other world changes, in words: "How far a bird sees at 50". */
  readonly change: string;
  /** Whether the level's time is up. */
  readonly done: boolean;
  /** On this sky, whether the claim's relation held: the outcome the first choice names. */
  readonly holdsHere: boolean | null;
}

/** What one run of a world is called, as its scene kit says: on this sky, across 20 skies. */
export interface RunWords {
  readonly one: string;
  readonly many: string;
  readonly on: string;
}

/**
 * Where the level rule checked a statement, opening a sentence: across 20 skies, for a model
 * with chance in it; for one with none, across the world's values and 19 near them (ADR-0024).
 */
export function acrossWords(run: RunWords, variation: Variation): string {
  const across = `Across ${RULE_SEEDS} ${run.many}`;
  return variation === "neighbourhood" ? `${across}, this world's values and ${RULE_SEEDS - 1} within a tenth of them` : across;
}

/**
 * The guide through predict, intervene, observe, explain (ADR-0018): it repeats the learner's
 * prediction, names the intervention, then reports what was measured, here and across 20
 * skies, and what the paper says. Never scored: nothing calls a prediction right or wrong.
 */
export function explorationLines(
  exploration: GuidedExploration,
  claim: DifferenceClaim,
  state: ExplorationState,
  /** What one run of the world is called, as its scene kit says: the valley's skies by default. */
  run: RunWords = { one: "sky", many: "skies", on: "on" },
  /** Where the level rule checked the statement: across 20 of those runs by default. */
  across = `Across ${RULE_SEEDS} ${run.many}`,
): GuideLine[] {
  const choice = (index: number): string => exploration.choices[index] ?? "";
  // The learner's own words: "You said", with no origin chip (owner, 2026-10-14).
  const lines: GuideLine[] = [{ text: `You said: ${choice(state.predicted)}.`, origin: "learner" }];
  if (!state.done) {
    lines.push({ text: `Now both worlds run, the other with ${state.change}. Watch the chart.`, origin: "teaching-choice" });
    return lines;
  }
  const on = run.on.charAt(0).toUpperCase() + run.on.slice(1);
  lines.push({ text: `${on} this ${run.one}: ${choice(state.holdsHere ? 0 : 1)}.`, origin: "computed-observation" });
  lines.push({
    text:
      claim.kind === "count"
        ? `${across}: ${choice(0)} on ${claim.holds}, ${choice(1).toLowerCase()} on ${RULE_SEEDS - claim.holds}.`
        : `${across}, the level's statement holds on at least ${RULE_HOLDS}.`,
    origin: "computed-observation",
  });
  const { explanation } = exploration;
  lines.push({ text: explanation.text, origin: explanation.origin, placeholder: explanation.anchors.length > 0 && explanation.anchors.every(isPlaceholder) });
  lines.push({ text: exploration.explainPrompt, origin: "teaching-choice" });
  return lines;
}
