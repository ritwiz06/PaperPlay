/**
 * Two deterministic helpers for a transcribed model: the solver's step, chosen as the largest that
 * passes the accuracy check over the world's time, and a short description of how the model behaves
 * at the paper's values, which the planner reads to choose times and thresholds that mean something.
 */
import type { ModelSpec } from "@paperplay/contracts";
import { accuracyReport, compartmentModel } from "@paperplay/primitives/compartments";

const STEPS = [1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001] as const;
const MAX_STEPS = 400_000;

export const defaultsOf = (model: ModelSpec): Record<string, number> => Object.fromEntries(model.parameters.map((parameter) => [parameter.id, parameter.defaultValue]));

/** The largest step at which the accuracy check passes over `time` at `params`, the paper's values unless given, or null when none does: a model too stiff to draw. */
export function chooseStep(model: ModelSpec, time: number, params: Readonly<Record<string, number>> = defaultsOf(model)): number | null {
  for (const dt of STEPS) {
    const steps = Math.round(time / dt);
    if (steps < 1 || steps > MAX_STEPS) continue;
    try {
      const primitive = compartmentModel({ ...model, solver: { ...model.solver, dt } });
      const report = accuracyReport(primitive, params, steps);
      if (!("failure" in report) && report.ratio <= 0.5) return dt;
    } catch {
      continue;
    }
  }
  return null;
}

/** Each compartment's value at ten times over `time`, its highest and when, at the paper's values. */
export function describeBehaviour(model: ModelSpec, time: number): string {
  const primitive = compartmentModel(model);
  const params = defaultsOf(model);
  const dt = model.solver.dt;
  const steps = Math.round(time / dt);
  const every = Math.max(1, Math.round(steps / 10));
  let state = primitive.init(params, 0);
  const rows: string[] = [];
  const peaks = new Map<string, { value: number; at: number }>();
  for (let step = 0; step <= steps; step++) {
    for (const [id, value] of Object.entries(state.compartments)) {
      const peak = peaks.get(id);
      if (!peak || value > peak.value) peaks.set(id, { value, at: step * dt });
    }
    if (step % every === 0) rows.push(`t = ${Number((step * dt).toPrecision(4))}: ${Object.entries(state.compartments).map(([id, value]) => `${id} ${Number(value.toPrecision(4))}`).join(", ")}`);
    if (step < steps) state = primitive.step(state, params, dt);
  }
  return [
    ...rows,
    `Highest: ${[...peaks].map(([id, peak]) => `${id} ${Number(peak.value.toPrecision(4))} at t = ${Number(peak.at.toPrecision(4))}`).join("; ")}.`,
  ].join("\n");
}

/** Ten times the median of a model's per-time rates: a horizon to describe its behaviour over. */
export function horizonOf(model: ModelSpec): number {
  const rates = model.parameters.filter((parameter) => parameter.unit.time === -1 && Object.keys(parameter.unit).length === 1 && parameter.defaultValue > 0).map((parameter) => parameter.defaultValue).sort((a, b) => a - b);
  const median = rates[Math.floor(rates.length / 2)] ?? 1;
  return Number((10 / median).toPrecision(2));
}

/** Each compartment's highest value and its value at the end of `time`, at `params`. */
function summaryOf(model: ModelSpec, params: Readonly<Record<string, number>>, time: number): Map<string, { readonly peak: number; readonly end: number }> {
  const primitive = compartmentModel(model);
  const dt = model.solver.dt;
  const steps = Math.round(time / dt);
  let state = primitive.init(params, 0);
  const peaks = new Map<string, number>();
  for (let step = 0; step <= steps; step++) {
    for (const [id, value] of Object.entries(state.compartments)) peaks.set(id, Math.max(peaks.get(id) ?? Number.NEGATIVE_INFINITY, value));
    if (step < steps) state = primitive.step(state, params, dt);
  }
  return new Map(Object.entries(state.compartments).map(([id, end]) => [id, { peak: peaks.get(id) ?? end, end }]));
}

/** At least this relative change in a compartment's peak or end value is listed: a smaller one will not show. */
export const RESPONSE_SHOWN = 0.15;

/**
 * How the model responds to change, as solved (ADR-0037): each rate halved and doubled, and every
 * compartment whose peak or value at the end of `time` moves by at least RESPONSE_SHOWN, with the
 * numbers. Deterministic, for the planner, who otherwise chooses its What-ifs blind and finds out
 * from the level rule. A rate whose change moves nothing that much is named as moving nothing.
 */
export function describeResponse(model: ModelSpec, time: number): string {
  const base = defaultsOf(model);
  const before = summaryOf(model, base, time);
  const shown = (value: number): string => Number(value.toPrecision(3)).toString();
  const rates = model.parameters.filter((parameter) => !parameter.id.endsWith("0") && parameter.defaultValue !== 0);
  const lines = rates.flatMap((parameter) =>
    [0.5, 2].map((factor) => {
      const value = parameter.defaultValue * factor;
      let after: ReturnType<typeof summaryOf>;
      try {
        after = summaryOf(model, { ...base, [parameter.id]: value }, time);
      } catch {
        return `${parameter.id} ${factor === 2 ? "doubled" : "halved"} (${shown(parameter.defaultValue)} to ${shown(value)}): the solver refuses it`;
      }
      const moves = [...before].flatMap(([id, was]) => {
        const now = after.get(id);
        if (!now) return [];
        const change = (from: number, to: number): number => (Math.abs(from) > 1e-12 ? (to - from) / Math.abs(from) : to === from ? 0 : Number.POSITIVE_INFINITY);
        const parts: string[] = [];
        if (Math.abs(change(was.peak, now.peak)) >= RESPONSE_SHOWN) parts.push(`${id} peak ${shown(was.peak)} to ${shown(now.peak)}`);
        // An end value is listed only where it is a fifth of the peak or more: a tail near zero does not show on a chart.
        const visibleEnd = Math.max(Math.abs(was.end), Math.abs(now.end)) >= 0.2 * Math.max(Math.abs(was.peak), Math.abs(now.peak));
        if (visibleEnd && Math.abs(change(was.end, now.end)) >= RESPONSE_SHOWN) parts.push(`${id} at t = ${shown(time)} ${shown(was.end)} to ${shown(now.end)}`);
        return parts;
      });
      return `${parameter.id} ${factor === 2 ? "doubled" : "halved"} (${shown(parameter.defaultValue)} to ${shown(value)}): ${moves.length > 0 ? moves.join("; ") : `nothing moves by ${RESPONSE_SHOWN * 100}% or more`}`;
    }),
  );
  return lines.join("\n");
}
