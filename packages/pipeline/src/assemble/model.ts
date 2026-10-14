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

/** The largest step at which the accuracy check passes over `time`, or null when none does: a model too stiff to draw. */
export function chooseStep(model: ModelSpec, time: number): number | null {
  for (const dt of STEPS) {
    const steps = Math.round(time / dt);
    if (steps < 1 || steps > MAX_STEPS) continue;
    try {
      const primitive = compartmentModel({ ...model, solver: { ...model.solver, dt } });
      const report = accuracyReport(primitive, defaultsOf(model), steps);
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
