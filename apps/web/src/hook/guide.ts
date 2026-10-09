/**
 * The guide (ADR-0008): "you did X, so Y", then what the primitive measured since. It reads
 * only the level's script from the WorldSpec, the session's values and the learner's last
 * action, and says nothing it did not get from them. At Beginner it uses words only, as the
 * slider does. Its first line is a teaching choice, its second a computed observation.
 */
import type { GuideScript, Observable } from "@paperplay/contracts";
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
  return { text: (lastAction.to > lastAction.from ? script.raised : script.lowered).replace("{to}", to), origin };
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
