/**
 * A generated mechanism's candidate levels (ADR-0058), made and judged in code as every family's are
 * (ADR-0055): each parameter set to each end of its range as both the control and the What-if,
 * measured on every measurement by its value at the run's end, its peak and its mean, over the level
 * rule's 20 seeds in the sandbox. A candidate is kept where its claim holds on 16 of them and its
 * difference shows on the chart of the world's opening seed; the rest are refused, with why.
 */
import type { MechanismManifest } from "@paperplay/contracts";
import type { LevelCandidate } from "../candidates/types.ts";
import type { PlanLevel } from "../stages/planner.ts";
import { everyOf, paramsWith } from "./checks.ts";
import { openSandbox, type SandboxLimits } from "./sandbox.ts";

/** The level rule's seeds, and how many a claim must hold on (ADR-0018). */
export const MECHANISM_SEEDS: readonly number[] = Array.from({ length: 20 }, (_, index) => index + 1);
export const MECHANISM_HOLDS = 16;
/** The visibility rule on the chart: the two curves part by a tenth of the axis (ADR-0037). */
export const SHOWN_ON_CHART = 0.1;
/** A difference worth a level: a tenth of the measurement's size at least, as the attention family's. */
export const RESPONSE_SHOWN = 0.1;

type Summary = "at" | "peak" | "mean";
const SUMMARIES: readonly Summary[] = ["at", "peak", "mean"];

/** One run's measurements, every `every` steps, each row the manifest's measurements in order. */
type Series = readonly (readonly number[])[];

export interface MechanismSweep {
  /** Every run, by setting and seed: "default" or "<param>=<value>". */
  readonly runs: ReadonlyMap<string, ReadonlyMap<number, Series>>;
  readonly settings: readonly WhatIf[];
}

export interface MechanismJudged {
  readonly passing: LevelCandidate[];
  readonly refused: { readonly id: string; readonly why: string }[];
  readonly runs: number;
  /** The candidates whose What-if takes a parameter away as the paper means: a hook's first choices. */
  readonly away: readonly string[];
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};
const shown = (value: number): string => Number(value.toPrecision(3)).toString();
const twoFigures = (value: number): number => Number(value.toPrecision(2));

/** A What-if: a parameter set to a value, and whether that value takes it away as the paper means. */
export interface WhatIf {
  readonly key: string;
  readonly param: string;
  readonly value: number;
  readonly away: boolean;
}

/**
 * The What-ifs (ADR-0058's amendment): each parameter taken away as the paper means it, where the
 * paper gives a meaning, and each end of its range, except an end beyond that point: a module's
 * scaling run past "dividing by 1" to "multiplying by 0" teaches nothing the paper says.
 */
export function whatIfsOf(manifest: MechanismManifest): WhatIf[] {
  return manifest.params.flatMap((param) => {
    const without = param.paper?.without ?? null;
    const beyond = (value: number): boolean => without !== null && (value - without) * (param.default - without) < 0;
    const ends = [param.min, param.max].filter((value) => value !== param.default && value !== without && !beyond(value));
    return [...(without !== null ? [without] : []), ...ends].map((value) => ({ key: `${param.id}=${value}`, param: param.id, value, away: value === without }));
  });
}

/**
 * Every run the candidates need, the defaults and each What-if on each seed, shared out over a few
 * sandboxes at once. A run that fails leaves its setting out, said in `failures`.
 */
export async function sweepMechanism(source: string, manifest: MechanismManifest, options: { readonly sandboxes?: number; readonly limits?: SandboxLimits; readonly seeds?: readonly number[] } = {}): Promise<MechanismSweep & { readonly failures: readonly string[] }> {
  const seeds = options.seeds ?? MECHANISM_SEEDS;
  const settings: WhatIf[] = [{ key: "default", param: "", value: 0, away: false }, ...whatIfsOf(manifest)];
  const jobs = settings.flatMap((setting) => seeds.map((seed) => ({ setting, seed })));
  const runs = new Map<string, Map<number, Series>>(settings.map((setting) => [setting.key, new Map()]));
  const failures: string[] = [];
  const pool = Array.from({ length: Math.max(1, Math.min(options.sandboxes ?? 4, jobs.length)) }, () => openSandbox(source, options.limits));
  let next = 0;
  try {
    await Promise.all(
      pool.map(async (sandbox) => {
        for (let job = jobs[next++]; job; job = jobs[next++]) {
          const params = job.setting.key === "default" ? paramsWith(manifest.params) : paramsWith(manifest.params, { id: job.setting.param, value: job.setting.value });
          const answer = await sandbox.request({ op: "run", seed: job.seed, params, steps: manifest.steps, every: everyOf(manifest.steps), frameAt: [] });
          if (answer.ok) runs.get(job.setting.key)?.set(job.seed, answer["measures"] as number[][]);
          else failures.push(`${job.setting.key} on seed ${job.seed}: ${answer.error}`);
        }
      }),
    );
  } finally {
    await Promise.all(pool.map((sandbox) => sandbox.close()));
  }
  return { runs, settings, failures };
}

const summaryOf = (series: Series, index: number, summary: Summary): number => {
  const values = series.map((row) => row[index] ?? Number.NaN);
  if (summary === "at") return values[values.length - 1] ?? Number.NaN;
  if (summary === "peak") return Math.max(...values);
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
};

const SUMMARY_WORDS: Readonly<Record<Summary, (steps: number, unit: string) => string>> = {
  at: (steps, unit) => `its value after ${steps} ${unit}s`,
  peak: (steps, unit) => `its highest within ${steps} ${unit}s`,
  mean: (steps, unit) => `its average over ${steps} ${unit}s`,
};

/**
 * The candidates the sweep allows, judged: a What-if's change on a measurement, by one summary,
 * where it moves the same way on 16 of 20 seeds by more than half its median change, that change a
 * tenth of the measurement's size, and where the two worlds' curves part on the opening seed's chart.
 */
export function judgeMechanismCandidates(manifest: MechanismManifest, sweep: MechanismSweep, openingSeed = 1): MechanismJudged {
  const passing: LevelCandidate[] = [];
  const refused: { id: string; why: string }[] = [];
  const takenAway: string[] = [];
  const base = sweep.runs.get("default");
  let count = 0;
  for (const setting of sweep.settings.filter((entry) => entry.key !== "default")) {
    const there = sweep.runs.get(setting.key);
    const param = manifest.params.find((entry) => entry.id === setting.param);
    if (!base || !there || !param) continue;
    const seeds = [...base.keys()].filter((seed) => there.has(seed));
    for (const [index, measurement] of manifest.measurements.entries()) {
      for (const summary of SUMMARIES) {
        const id = `g${(count += 1)}`;
        const pairs = seeds.map((seed) => [summaryOf(base.get(seed) ?? [], index, summary), summaryOf(there.get(seed) ?? [], index, summary)] as const);
        const differences = pairs.map(([here, away]) => away - here);
        const typical = median(differences);
        const size = median(pairs.map(([here, away]) => Math.max(Math.abs(here), Math.abs(away))));
        if (!Number.isFinite(typical) || typical === 0 || Math.abs(typical) < RESPONSE_SHOWN * size) {
          refused.push({ id, why: `${setting.key} moves ${measurement.id} (${summary}) by too little to teach: a median change of ${shown(typical)} on a size of ${shown(size)}` });
          continue;
        }
        const relation = typical > 0 ? "higher" : "lower";
        const by = twoFigures(Math.abs(typical) / 2);
        const holds = differences.filter((difference) => (relation === "higher" ? difference > by : difference < -by)).length;
        if (holds < Math.ceil((MECHANISM_HOLDS / MECHANISM_SEEDS.length) * seeds.length)) {
          refused.push({ id, why: `${setting.key} on ${measurement.id} (${summary}): the claim holds on ${holds} of ${seeds.length} seeds` });
          continue;
        }
        // The chart the fork shows: both worlds on the opening seed, the axis from its lowest (or 0) to its highest.
        const curve = (runs: ReadonlyMap<number, Series>) => (runs.get(openingSeed) ?? []).map((row) => row[index] ?? 0);
        const [a, b] = [curve(base), curve(there)];
        const top = Math.max(...a, ...b);
        const bottom = Math.min(0, ...a, ...b);
        const parting = Math.max(0, ...a.map((value, at) => Math.abs(value - (b[at] ?? value))));
        if (!(top > bottom) || parting < SHOWN_ON_CHART * (top - bottom)) {
          refused.push({ id, why: `${setting.key} on ${measurement.id} (${summary}): the two curves part by ${shown(parting)}, under a tenth of the chart's ${shown(top - bottom)}` });
          continue;
        }
        const here = median(pairs.map(([value]) => value));
        const away = median(pairs.map(([, value]) => value));
        const level: PlanLevel = {
          kind: "result",
          finding: null,
          title: `Candidate ${id}`,
          goal: "To be written.",
          control: { parameter: param.id, label: param.label.slice(0, 50), lowEnd: "Low", highEnd: "High" },
          watch: measurement.id,
          whatIf: { prompt: "To be written.", parameter: param.id, value: setting.value },
          difference: { compartment: measurement.id, summary, at: summary === "at" ? manifest.steps : null, time: manifest.steps, relation, by },
          effect: "To be written.",
          prediction: { prompt: "To be written.", claimed: "To be written.", other: "To be written." },
          passage: null,
          carryForward: "To be written.",
        };
        const unit = param.unit ? ` ${param.unit}` : "";
        if (setting.away) takenAway.push(id);
        const change = setting.away ? `it taken away, as the paper means it (${param.paper?.meaning ?? ""}), set to ${shown(setting.value)}${unit}` : `it set to ${shown(setting.value)}${unit}, which is not taking it away in the paper's sense`;
        passing.push({
          id,
          level,
          brief: `${id}: the control is ${param.label} (${param.id}, the paper's ${shown(param.default)}${unit}); What-if: ${param.paper ? change : `it set to ${shown(setting.value)}${unit}`}; measures ${measurement.label} (${measurement.id}), ${SUMMARY_WORDS[summary](manifest.steps, manifest.stepLabel)}: ${shown(here)} now, ${shown(away)} in the What-if, ${relation} by more than ${shown(by)}; holds on ${holds} of ${seeds.length} seeds`,
          holds,
        });
      }
    }
  }
  return { passing, refused, runs: [...sweep.runs.values()].reduce((sum, runs) => sum + runs.size, 0), away: takenAway };
}
