/**
 * A deterministic sweep of flock.planar.weighted's four rule parameters, used to choose
 * teaching defaults (ADR-0003). Pure: the same grid, seeds and steps give the same rows.
 */
import { flockPlanarWeighted as flock, type FlockParams } from "@paperplay/primitives/flock";

/** The four parameters the sweep varies. */
export interface SweepConfig {
  separationWeight: number;
  alignmentWeight: number;
  cohesionWeight: number;
  perceptionRadius: number;
}

export type SweepGrid = { readonly [K in keyof SweepConfig]: readonly number[] };

export interface SweepRow extends SweepConfig {
  /** Seeds whose flock, at the last step, agrees on a heading (≥ 0.8) as one group. */
  successes: number;
  seeds: number;
  medianAgreement: number;
  medianClusters: number;
  /** Median first time (s) a once-per-second check saw an ordered single group; null if most seeds never did. */
  medianSecondsToOrder: number | null;
}

export interface SweepOptions {
  readonly seeds: readonly number[];
  readonly steps: number;
  readonly sampleEvery: number;
}

const KEYS = ["separationWeight", "alignmentWeight", "cohesionWeight", "perceptionRadius"] as const;

/** The seeds the defaults were chosen on, and the window they had to order within (20 s at 1/60 s). */
export const SWEEP_SEEDS: readonly number[] = Array.from({ length: 20 }, (_, index) => index + 1);
export const WINDOW_STEPS = 1200;

/** Held fixed for every configuration: the prototype's values for everything not swept. */
export const BASE: FlockParams = {
  agentCount: 72,
  worldWidth: 32,
  worldHeight: 32,
  separationWeight: 1.2,
  alignmentWeight: 1,
  cohesionWeight: 0.8,
  perceptionRadius: 4.5,
  separationRadius: 1.55,
  targetSpeed: 2.7,
  minSpeed: 0.45,
  maxSpeed: 3.6,
  maxAcceleration: 4.6,
  beaconWeight: 0.85,
  obstacleWeight: 3,
  obstacleRadius: 3.4,
};

/** The prototype's rule settings, which break ties so the accepted feel survives. */
export const PROTOTYPE: SweepConfig = { separationWeight: 1.2, alignmentWeight: 1, cohesionWeight: 0.8, perceptionRadius: 4.5 };

export const MIN_AGREEMENT = 0.8;

/** A flock counts as a murmuration when it agrees on a heading and moves as one group. */
export function judge(agreement: number, clusters: number): boolean {
  return agreement >= MIN_AGREEMENT && clusters === 1;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? Number.NaN;
  return sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] ?? Number.NaN) + upper) / 2;
}

function evaluate(config: SweepConfig, seed: number, options: SweepOptions) {
  // Copy only the swept rules: a SweepRow carries its results too, which are not parameters.
  const rules = Object.fromEntries(KEYS.map((key) => [key, config[key]]));
  const params = flock.paramSchema.parse({ ...BASE, ...rules });
  let state = flock.init(params, seed);
  let secondsToOrder = Number.POSITIVE_INFINITY;
  for (let t = 1; t <= options.steps; t++) {
    state = flock.step(state, params, flock.fixedTimestep);
    if (secondsToOrder === Number.POSITIVE_INFINITY && t % options.sampleEvery === 0) {
      const observed = flock.measure(state);
      if (judge(observed.directionalAgreement, observed.clusterCount)) secondsToOrder = t * flock.fixedTimestep;
    }
  }
  const final = flock.measure(state);
  return { agreement: final.directionalAgreement, clusters: final.clusterCount, secondsToOrder };
}

/** Every configuration in the grid, in grid order, each run on every seed. */
export function sweep(grid: SweepGrid, options: SweepOptions, onRow?: (row: SweepRow, index: number) => void): SweepRow[] {
  const rows: SweepRow[] = [];
  for (const separationWeight of grid.separationWeight) {
    for (const alignmentWeight of grid.alignmentWeight) {
      for (const cohesionWeight of grid.cohesionWeight) {
        for (const perceptionRadius of grid.perceptionRadius) {
          const config = { separationWeight, alignmentWeight, cohesionWeight, perceptionRadius };
          const outcomes = options.seeds.map((seed) => evaluate(config, seed, options));
          const order = median(outcomes.map((o) => o.secondsToOrder));
          const row: SweepRow = {
            ...config,
            successes: outcomes.filter((o) => judge(o.agreement, o.clusters)).length,
            seeds: options.seeds.length,
            medianAgreement: median(outcomes.map((o) => o.agreement)),
            medianClusters: median(outcomes.map((o) => o.clusters)),
            medianSecondsToOrder: Number.isFinite(order) ? order : null,
          };
          rows.push(row);
          onRow?.(row, rows.length - 1);
        }
      }
    }
  }
  return rows;
}

/** The rows of several stages, each configuration once (the first stage that ran it wins). */
export function union(stages: readonly (readonly SweepRow[])[]): SweepRow[] {
  const seen = new Set<string>();
  const rows: SweepRow[] = [];
  for (const row of stages.flat()) {
    const key = KEYS.map((name) => row[name]).join(",");
    if (!seen.has(key)) {
      seen.add(key);
      rows.push(row);
    }
  }
  return rows;
}

/** How many of `seeds` succeed for one configuration: the held-out check after a choice. */
export function successesOn(config: SweepConfig, seeds: readonly number[], options: Omit<SweepOptions, "seeds">): number {
  return seeds
    .map((seed) => evaluate(config, seed, { ...options, seeds }))
    .filter((outcome) => judge(outcome.agreement, outcome.clusters)).length;
}

/** One grid holding every value any of the grids holds, for distances across stages. */
export function mergeGrids(grids: readonly SweepGrid[]): SweepGrid {
  const merged = (key: (typeof KEYS)[number]) => [...new Set(grids.flatMap((grid) => grid[key]))].sort((a, b) => a - b);
  return {
    separationWeight: merged("separationWeight"),
    alignmentWeight: merged("alignmentWeight"),
    cohesionWeight: merged("cohesionWeight"),
    perceptionRadius: merged("perceptionRadius"),
  };
}

export function spansOf(grid: SweepGrid): SweepConfig {
  const span = (values: readonly number[]) => Math.max(...values) - Math.min(...values) || 1;
  return {
    separationWeight: span(grid.separationWeight),
    alignmentWeight: span(grid.alignmentWeight),
    cohesionWeight: span(grid.cohesionWeight),
    perceptionRadius: span(grid.perceptionRadius),
  };
}

/** Rows by successes, then normalised distance from the prototype (rounded to 1e-9 so ties are exact), then grid order. */
export function rank(rows: readonly SweepRow[], prototype: SweepConfig, spans: SweepConfig): SweepRow[] {
  const distance = (row: SweepRow): number =>
    Math.round(Math.sqrt(KEYS.reduce((sum, key) => sum + ((row[key] - prototype[key]) / spans[key]) ** 2, 0)) * 1e9) / 1e9;
  return rows
    .map((row, index) => ({ row, index, distance: distance(row) }))
    .sort((a, b) => b.row.successes - a.row.successes || a.distance - b.distance || a.index - b.index)
    .map(({ row }) => row);
}

/** The best-ranked configuration that succeeds for at least `minSuccesses` seeds, if any. */
export function chooseDefaults(
  rows: readonly SweepRow[],
  prototype: SweepConfig,
  spans: SweepConfig,
  minSuccesses: number,
): SweepRow | undefined {
  return rank(rows, prototype, spans).find((row) => row.successes >= minSuccesses);
}

const HEADER = [...KEYS, "successes", "seeds", "medianAgreement", "medianClusters", "medianSecondsToOrder"].join(",");

function cells(row: SweepRow): string[] {
  return [
    ...KEYS.map((key) => String(row[key])),
    String(row.successes),
    String(row.seeds),
    row.medianAgreement.toFixed(4),
    String(row.medianClusters),
    row.medianSecondsToOrder === null ? "" : row.medianSecondsToOrder.toFixed(2),
  ];
}

export function toCsv(rows: readonly SweepRow[]): string {
  return `${[HEADER, ...rows.map((row) => cells(row).join(","))].join("\n")}\n`;
}

export interface StageResult {
  readonly name: string;
  /** Why this stage exists, written before it ran. */
  readonly note: string;
  readonly grid: SweepGrid;
  readonly rows: readonly SweepRow[];
}

export interface SweepReport {
  readonly stages: readonly StageResult[];
  readonly options: SweepOptions;
  readonly minSuccesses: number;
  /** The chosen configuration re-run on seeds the choice never saw. */
  readonly heldOut?: { readonly seeds: readonly number[]; readonly successes: number };
  readonly primitive: string;
  readonly runtime: string;
}

/** A readable summary: method per stage, the choice, its held-out check, the prototype's row, the ranking. */
export function toMarkdown(chosen: SweepRow | undefined, report: SweepReport): string {
  const rows = union(report.stages.map((stage) => stage.rows));
  const ranked = rank(rows, PROTOTYPE, spansOf(mergeGrids(report.stages.map((stage) => stage.grid))));
  const table = (subset: readonly SweepRow[]) =>
    [
      "| Separation | Alignment | Cohesion | Perception | Successes | Median agreement | Median groups | Median s to order |",
      "|---|---|---|---|---|---|---|---|",
      ...subset.map((row) => {
        const [s, a, c, p, wins, seeds, agreement, groups, seconds] = cells(row);
        return `| ${s} | ${a} | ${c} | ${p} | ${wins}/${seeds} | ${agreement} | ${groups} | ${seconds || "never for most seeds"} |`;
      }),
    ].join("\n");
  const list = (values: readonly number[]) => values.join(", ");
  const { seeds, steps } = report.options;
  const stages = report.stages
    .map((stage) => {
      const best = rank(stage.rows, PROTOTYPE, spansOf(stage.grid))[0];
      return `### Stage "${stage.name}" (${stage.rows.length} configurations)

${stage.note}

separationWeight ∈ {${list(stage.grid.separationWeight)}}, alignmentWeight ∈ {${list(stage.grid.alignmentWeight)}},
cohesionWeight ∈ {${list(stage.grid.cohesionWeight)}}, perceptionRadius ∈ {${list(stage.grid.perceptionRadius)}}.
Best in this stage: ${best ? `${best.successes}/${best.seeds} successes` : "none"}. Rows are in flock-defaults-${stage.name}.csv.`;
    })
    .join("\n\n");
  const prototypeRow = rows.find((row) => KEYS.every((key) => row[key] === PROTOTYPE[key]));
  const heldOut = report.heldOut
    ? `Held-out check: the chosen settings succeed for ${report.heldOut.successes} of ${report.heldOut.seeds.length} unseen seeds (${report.heldOut.seeds[0]}–${report.heldOut.seeds.at(-1)}). Choosing the best of many configurations on seeds ${seeds[0]}–${seeds.at(-1)} flatters its success rate there; this number does not.`
    : "";
  return `# Flock defaults sweep

Generated by \`npm run sweep:defaults\` (scripts/sweep-defaults.ts) on ${report.runtime} with
${report.primitive}. Deterministic: rerunning it on the same commit rewrites this file
and the CSV files byte for byte. ADR-0003 records the decision this informs.

## Method

- Fixed at the prototype's values: 72 birds on a 32 × 32 torus, separationRadius 1.55,
  targetSpeed 2.7, speeds 0.45–3.6, maxAcceleration 4.6; no beacons or obstacles.
- Each configuration ran ${seeds.length} seeds (${seeds[0]}–${seeds.at(-1)}) for ${steps} steps (${(steps * flock.fixedTimestep).toFixed(0)} s at 1/60 s).
- A seed succeeds when, at the last step, directional agreement ≥ ${MIN_AGREEMENT} and the flock is one
  group (clusterCount = 1). "Median s to order" is the first once-per-second check at which
  that held.
- A configuration qualifies with at least ${report.minSuccesses} of ${seeds.length} successes. The choice is the
  qualifying configuration with the most successes, then the one closest to the prototype
  (${PROTOTYPE.separationWeight}, ${PROTOTYPE.alignmentWeight}, ${PROTOTYPE.cohesionWeight}, ${PROTOTYPE.perceptionRadius}) in grid-normalised distance, then the earliest in grid order.

${stages}

## Result

${chosen ? `Chosen: separation ${chosen.separationWeight}, alignment ${chosen.alignmentWeight}, cohesion ${chosen.cohesionWeight}, perception ${chosen.perceptionRadius}.\n\n${table([chosen])}\n\n${heldOut}` : `No configuration reached ${report.minSuccesses} of ${seeds.length} successes. Nothing was chosen.`}

The prototype's own settings, for comparison:

${prototypeRow ? table([prototypeRow]) : "The prototype's settings are not on these grids."}

## Top of the ranking, all stages

${table(ranked.slice(0, 15))}
`;
}
