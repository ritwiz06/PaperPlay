/**
 * The group measure's validation sweep (ADR-0015). Pure and deterministic.
 *
 * - Random scatters: the flock at step 0 on many seeds, at the default density, which is
 *   uniform positions and headings. The owner's criterion: fewer than 1% read as one group.
 * - Seed 4's murmuration, the flock the demo capture films: it must read as one group.
 *
 * "Reads as one group" is O1 (MODEL.md): exactly one group, holding at least half the birds.
 * The owner chose it on 2026-10-09 after the bare count failed the first criterion (1.28%).
 *
 * It also counts what the old, distance-only measure (flock 2.x) and each half of the new
 * one would have said, so the report shows what each condition contributes. Those
 * comparison measures live here, in evaluation code, and never in the primitive.
 */
import { flockDefaultParams, flockPlanarWeighted as flock, flockReadsAsOneGroup, type FlockState } from "@paperplay/primitives";

export const SCATTER_SEEDS = 10_000;
export const MURMURATION_SEED = 4;
/** 20 s at 60 steps a second, the defaults sweep's window. */
export const MURMURATION_STEPS = 1200;
export const CRITERION = 0.01;

const LINK = 4.5;
const MIN_GROUP = 4;

export type Variant = "distance only (flock 2.x)" | "distance and headings" | "distance and strays" | "the owner's measure (flock 3.0.0)";
export const VARIANTS: readonly Variant[] = ["distance only (flock 2.x)", "distance and headings", "distance and strays", "the owner's measure (flock 3.0.0)"];
/** The rows of the scatter table: each variant's bare count of one, then O1 on the primitive's own measure. */
export type Row = Variant | "one group holding at least half the birds (O1, adopted)";

/** Groups under one variant, for comparison. The last variant must equal the primitive's own E14. */
export function groupsBy(state: FlockState, variant: Variant): number {
  const { agents, width, height } = state;
  const headings = variant === "distance and headings" || variant === "the owner's measure (flock 3.0.0)";
  const strays = variant === "distance and strays" || variant === "the owner's measure (flock 3.0.0)";
  const parent = agents.map((_, index) => index);
  const root = (index: number): number => {
    let at = index;
    while (parent[at] !== at) at = parent[at] as number;
    return at;
  };
  const wrap = (d: number, size: number) => d - size * Math.round(d / size);
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const [a, b] = [agents[i], agents[j]];
      if (!a || !b) continue;
      if (Math.hypot(wrap(b.x - a.x, width), wrap(b.y - a.y, height)) >= LINK) continue;
      if (headings) {
        const dot = a.vx * b.vx + a.vy * b.vy;
        if (!(dot > 0 && 2 * dot * dot > (a.vx * a.vx + a.vy * a.vy) * (b.vx * b.vx + b.vy * b.vy))) continue;
      }
      parent[root(j)] = root(i);
    }
  }
  const sizes = new Map<number, number>();
  for (let i = 0; i < agents.length; i++) sizes.set(root(i), (sizes.get(root(i)) ?? 0) + 1);
  return [...sizes.values()].filter((size) => size >= (strays ? MIN_GROUP : 1)).length;
}

/** The share of seeds whose scatter reads as exactly one group, with a 95% Wilson upper bound. */
export interface ScatterRow {
  readonly variant: Row;
  readonly oneGroup: number;
  readonly share: number;
  readonly upper95: number;
  /** Seeds reading 0, 1, 2, 3 and 4 or more groups; null for the O1 row, which reads the 3.0.0 count. */
  readonly counts: readonly [number, number, number, number, number] | null;
}

const wilsonUpper = (k: number, n: number): number => {
  const z = 1.959963984540054;
  const p = k / n;
  return (p + (z * z) / (2 * n) + z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n);
};

export function scatterSweep(seeds = SCATTER_SEEDS): ScatterRow[] {
  const tallies = VARIANTS.map(() => [0, 0, 0, 0, 0] as [number, number, number, number, number]);
  let adopted = 0;
  for (let seed = 0; seed < seeds; seed++) {
    const state = flock.init(flockDefaultParams, seed);
    VARIANTS.forEach((variant, index) => {
      const tally = tallies[index];
      const column = Math.min(groupsBy(state, variant), 4) as 0 | 1 | 2 | 3 | 4;
      if (tally) tally[column] += 1;
    });
    // O1, on the primitive's own measure: under it, a scatter "reads as one group".
    if (flockReadsAsOneGroup(flock.measure(state))) adopted++;
  }
  const rows: ScatterRow[] = VARIANTS.map((variant, index) => {
    const counts = tallies[index] ?? [0, 0, 0, 0, 0];
    return { variant, oneGroup: counts[1], share: counts[1] / seeds, upper95: wilsonUpper(counts[1], seeds), counts };
  });
  return [...rows, { variant: "one group holding at least half the birds (O1, adopted)", oneGroup: adopted, share: adopted / seeds, upper95: wilsonUpper(adopted, seeds), counts: null }];
}

export interface MurmurationRow {
  readonly seconds: number;
  readonly groups: number;
  readonly strayShare: number;
  readonly agreement: number;
  readonly oneGroup: boolean;
}

/** Seed 4 at the defaults, sampled every 2 s, and the step from which it reads as one group (O1) to the end. */
export function murmuration(seed = MURMURATION_SEED, steps = MURMURATION_STEPS): { readonly rows: MurmurationRow[]; readonly oneGroupFrom: number | null } {
  let state = flock.init(flockDefaultParams, seed);
  const rows: MurmurationRow[] = [];
  let oneGroupFrom: number | null = null;
  for (let t = 0; t <= steps; t++) {
    if (t > 0) state = flock.step(state, flockDefaultParams, flock.fixedTimestep);
    const observed = flock.measure(state);
    const one = flockReadsAsOneGroup(observed);
    if (one) oneGroupFrom ??= t;
    else oneGroupFrom = null;
    if (t % 120 === 0) {
      rows.push({ seconds: t * flock.fixedTimestep, groups: observed.clusterCount, strayShare: observed.strayShare, agreement: observed.directionalAgreement, oneGroup: one });
    }
  }
  return { rows, oneGroupFrom };
}

export function toMarkdown(rows: readonly ScatterRow[], seed: ReturnType<typeof murmuration>, meta: { readonly primitive: string; readonly runtime: string }): string {
  const own = rows.find((row) => row.variant === "one group holding at least half the birds (O1, adopted)");
  const last = seed.rows.at(-1);
  const passScatter = own !== undefined && own.upper95 < CRITERION;
  const passSeed = last?.oneGroup === true;
  return [
    "# The group measure's sweep",
    "",
    "Generated by `npm run sweep:groups` (scripts/sweep/group-measure.ts). Do not edit by hand;",
    "`scripts/test/group-measure.test.ts` fails if this file drifts from a fresh run.",
    "",
    `Primitive: ${meta.primitive}. Runtime: ${meta.runtime}. ADR-0015.`,
    "",
    "## The owner's criteria",
    "",
    `- Random scatters at the default density read as one group in under 1% of seeds: **${passScatter ? "met" : "not met"}**.`,
    `  ${own?.oneGroup ?? "?"} of ${SCATTER_SEEDS.toLocaleString("en-GB")} seeds, ${((own?.share ?? 0) * 100).toFixed(2)}%; the 95% upper bound is ${((own?.upper95 ?? 0) * 100).toFixed(3)}%.`,
    `- Seed 4's murmuration reads as one group: **${passSeed ? "met" : "not met"}**. It reads as one group at 20 s, and from step ${seed.oneGroupFrom ?? "never"} on (${seed.oneGroupFrom === null ? "never" : `${(seed.oneGroupFrom / 60).toFixed(2)} s`}).`,
    "",
    "\"Reads as one group\" is O1: exactly one group, holding at least half the birds. The owner adopted",
    "it on 2026-10-09, after the bare count of one group failed the first criterion (the fourth",
    "row below). The 95% upper bound is a Wilson score interval.",
    "",
    "## Random scatters",
    "",
    `${SCATTER_SEEDS.toLocaleString("en-GB")} seeds (0 to ${SCATTER_SEEDS - 1}), each flock at step 0: 72 birds on a 32 × 32 world, positions and headings uniform (E15). The first four rows count the scatters whose measure gives exactly one group; the last applies O1 to the primitive's own measure.`,
    "",
    "| Measure | One group | Share | 95% upper bound | 0 groups | 1 | 2 | 3 | 4 or more |",
    "|---|---|---|---|---|---|---|---|---|",
    ...rows.map(
      (row) =>
        `| ${row.variant} | ${row.oneGroup} | ${(row.share * 100).toFixed(2)}% | ${(row.upper95 * 100).toFixed(3)}% | ${row.counts ? row.counts.join(" | ") : "— | — | — | — | —"} |`,
    ),
    "",
    "## Seed 4's murmuration",
    "",
    "Seed 4 at the defaults, sampled every 2 s.",
    "",
    "| Seconds | Groups | Stray share | Directional agreement | Reads as one group |",
    "|---|---|---|---|---|",
    ...seed.rows.map((row) => `| ${row.seconds.toFixed(0)} | ${row.groups} | ${row.strayShare.toFixed(3)} | ${row.agreement.toFixed(3)} | ${row.oneGroup ? "yes" : "no"} |`),
    "",
  ].join("\n");
}
