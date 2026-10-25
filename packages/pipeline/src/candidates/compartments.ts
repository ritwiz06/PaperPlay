/**
 * The compartment family's candidate levels (ADR-0055): each rate, halved and doubled, as both the
 * level's control and its What-if, measured on every compartment the rate does not feed directly
 * (so never definitional, ADR-0044), by its peak or its value at the run's end, where that moves
 * by at least RESPONSE_SHOWN. The claim's margin is half the difference at the paper's values, so
 * it can hold on starts a tenth away. Placeholder words only: the explainer writes them later.
 */
import type { ModelSpec } from "@paperplay/contracts";
import { defaultsOf, RESPONSE_SHOWN, summaryOf } from "../assemble/model.ts";
import { directEffectOf } from "../rule/direct.ts";
import type { PlanLevel } from "../stages/planner.ts";
import type { CandidateGenerator, LevelCandidate } from "./types.ts";

const shown = (value: number): string => Number(value.toPrecision(3)).toString();
const twoFigures = (value: number): number => Number(value.toPrecision(2));

export const compartmentCandidates: CandidateGenerator = (model: ModelSpec, horizon: number) => {
  const base = defaultsOf(model);
  const before = summaryOf(model, base, horizon);
  const rates = model.parameters.filter((parameter) => !parameter.id.endsWith("0") && parameter.defaultValue !== 0);
  const candidates: LevelCandidate[] = [];
  for (const parameter of rates) {
    for (const factor of [0.5, 2] as const) {
      const value = Number((parameter.defaultValue * factor).toPrecision(6));
      let after: ReturnType<typeof summaryOf>;
      try {
        after = summaryOf(model, { ...base, [parameter.id]: value }, horizon);
      } catch {
        continue;
      }
      for (const compartment of model.compartments) {
        const was = before.get(compartment.id);
        const now = after.get(compartment.id);
        if (!was || !now) continue;
        const measures: { readonly summary: "peak" | "at"; readonly here: number; readonly there: number }[] = [{ summary: "peak", here: was.peak, there: now.peak }];
        // An end value only where it is a fifth of the peak or more, as the response table lists it.
        if (Math.max(Math.abs(was.end), Math.abs(now.end)) >= 0.2 * Math.max(Math.abs(was.peak), Math.abs(now.peak))) measures.push({ summary: "at", here: was.end, there: now.end });
        for (const measure of measures) {
          const at = measure.summary === "at" ? horizon : null;
          if (directEffectOf(model, parameter.id, compartment.id, { summary: measure.summary, at, time: horizon }).definitional) continue;
          const change = Math.abs(measure.here) > 1e-12 ? (measure.there - measure.here) / Math.abs(measure.here) : Number.POSITIVE_INFINITY;
          if (!(Math.abs(change) >= RESPONSE_SHOWN) || !Number.isFinite(measure.there)) continue;
          const relation = measure.there > measure.here ? "higher" : "lower";
          const by = twoFigures(Math.abs(measure.there - measure.here) / 2);
          const id = `c${candidates.length + 1}`;
          const level: PlanLevel = {
            kind: "result",
            finding: null,
            title: `Candidate ${id}`,
            goal: "To be written.",
            control: { parameter: parameter.id, label: parameter.name.slice(0, 50) || parameter.id, lowEnd: "Low", highEnd: "High" },
            watch: compartment.id,
            whatIf: { prompt: "To be written.", parameter: parameter.id, value },
            difference: { compartment: compartment.id, summary: measure.summary, at, time: horizon, relation, by },
            effect: "To be written.",
            prediction: { prompt: "To be written.", claimed: "To be written.", other: "To be written." },
            passage: null,
            carryForward: "To be written.",
          };
          const what = measure.summary === "peak" ? `its peak within ${shown(horizon)} ${model.timeUnit}s` : `its value at ${model.timeUnit} ${shown(horizon)}`;
          candidates.push({
            id,
            level,
            brief: `${id}: the control is ${parameter.name} (${parameter.id}, now ${shown(parameter.defaultValue)}); What-if: it ${factor === 2 ? "doubled" : "halved"}, to ${shown(value)}; measures ${compartment.name} (${compartment.id}), ${what}: ${shown(measure.here)} now, ${shown(measure.there)} in the What-if, which is ${relation} by more than ${shown(by)}`,
          });
        }
      }
    }
  }
  return candidates;
};
