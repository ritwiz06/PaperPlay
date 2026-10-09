/**
 * The hook level's guide (ADR-0008): "you did X, so Y", then what the primitive measured
 * since. It reads only the session's values and the learner's last action, and says nothing
 * it did not get from them. At Beginner it uses words only, as the slider does. Thresholds and
 * wording are teaching choices; until WorldSpec they are hard-coded here.
 */
import type { Depth, GuideLine } from "@paperplay/ui/react";

export type Trend = "rising" | "falling" | "steady";

export interface GuideInput {
  /** The learner's last change to the control, or null before the first. */
  readonly lastAction: { readonly from: number; readonly to: number } | null;
  readonly alignment: number;
  /** Directional agreement, as the primitive measures it. */
  readonly agreement: number;
  readonly trend: Trend;
  readonly playing: boolean;
  readonly depth: Depth;
}

/** Agreement in plain words. */
export function describeAgreement(agreement: number): string {
  if (agreement >= 0.9) return "nearly every bird heads the same way";
  if (agreement >= 0.6) return "most birds head the same way";
  if (agreement >= 0.3) return "headings are only partly shared";
  return "headings are scattered";
}

/** Rising or falling when the recent readouts moved more than `threshold` from first to last. */
export function trendOf(samples: readonly number[], threshold = 0.03): Trend {
  const first = samples[0];
  const last = samples.at(-1);
  if (first === undefined || last === undefined) return "steady";
  if (last - first > threshold) return "rising";
  if (first - last > threshold) return "falling";
  return "steady";
}

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

function didLine({ lastAction, alignment, depth }: GuideInput): GuideLine {
  const origin = "teaching-choice";
  if (!lastAction) return { text: "No bird leads. Each one steers only by the few it can see.", origin };
  if (alignment === 0) return { text: "At 0, no bird matches its neighbours' heading at all.", origin };
  const to = depth === "beginner" ? "" : ` to ${alignment.toFixed(2)}`;
  return lastAction.to > lastAction.from
    ? { text: `You raised Move together${to}, so birds turn harder toward their neighbours' heading.`, origin }
    : { text: `You lowered Move together${to}, so birds care less which way their neighbours fly.`, origin };
}

function sawLine({ agreement, trend, playing, depth }: GuideInput): GuideLine {
  const origin = "computed-observation";
  const words = describeAgreement(agreement);
  if (depth === "beginner") {
    const motion = !playing || trend === "steady" ? "" : trend === "rising" ? ", and more are joining in" : ", and they are drifting apart";
    return { text: `${playing ? "" : "Paused. "}${capitalise(words)}${motion}.`, origin };
  }
  const measure = depth === "advanced" ? `Directional agreement ${agreement.toFixed(2)}` : `Agreement ${agreement.toFixed(1)}`;
  const motion = !playing ? "" : trend === "steady" ? " and holding" : ` and ${trend}`;
  return { text: `${playing ? "" : "Paused. "}${measure}${motion}: ${words}.`, origin };
}

export function guideLines(input: GuideInput): readonly [GuideLine, GuideLine] {
  return [didLine(input), sawLine(input)];
}
