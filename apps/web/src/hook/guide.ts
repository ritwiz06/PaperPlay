/**
 * The guide's two sentences in the /world/hook spike (ADR-0008): what the learner just did,
 * and what the primitive measured since. It reads only the session's values and the
 * learner's last action, and says nothing it did not get from them. Thresholds and wording
 * are teaching choices.
 */
import type { Origin } from "@paperplay/contracts";
import type { Depth } from "./hook-content.ts";

export interface GuideLine {
  readonly text: string;
  readonly origin: Origin;
}

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

function didLine({ lastAction, alignment }: GuideInput): GuideLine {
  const origin = "teaching-choice";
  if (!lastAction) return { text: "No bird leads. Each one steers only by the few it can see.", origin };
  if (alignment === 0) return { text: "At 0, no bird matches its neighbours' heading at all.", origin };
  const value = alignment.toFixed(2);
  return lastAction.to > lastAction.from
    ? { text: `You raised Move together to ${value}: birds turn harder toward their neighbours' heading.`, origin }
    : { text: `You lowered Move together to ${value}: birds care less which way their neighbours fly.`, origin };
}

function sawLine({ agreement, trend, playing, depth }: GuideInput): GuideLine {
  const value = agreement.toFixed(1);
  const measure = depth === "advanced" ? `Directional agreement ${value}` : `Agreement ${value}`;
  const motion = !playing ? "" : trend === "steady" ? " and holding" : ` and ${trend}`;
  const text = `${playing ? "" : "Paused. "}${measure}${motion}: ${describeAgreement(agreement)}.`;
  return { text, origin: "computed-observation" };
}

export function guideLines(input: GuideInput): readonly [GuideLine, GuideLine] {
  return [didLine(input), sawLine(input)];
}
