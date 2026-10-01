/**
 * npm run choose:hook-seed
 *
 * Re-runs the flock's defaults on the defaults sweep's seeds, measuring every step, and
 * writes eval/sweeps/hook-seed.md: which seeds qualified, when each became one group for
 * good, and the hook seed that rule picks (ADR-0003). apps/web/src/world/local-world.ts
 * holds the pick; scripts/test/hook-seed.test.ts fails if the two disagree.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { flockDefaultParams, flockPlanarWeighted as flock } from "@paperplay/primitives";
import { SWEEP_SEEDS, WINDOW_STEPS } from "./sweep/flock-sweep.ts";
import { chooseHookSeed, runSeed, summarise, toMarkdown } from "./sweep/hook-seed.ts";

const summaries = SWEEP_SEEDS.map((seed) => summarise(runSeed(flockDefaultParams, seed, WINDOW_STEPS)));
const chosen = chooseHookSeed(summaries);
const out = join(import.meta.dirname, "..", "eval", "sweeps", "hook-seed.md");
writeFileSync(out, toMarkdown(summaries, chosen, { primitive: `${flock.id}@${flock.version}`, runtime: `node ${process.versions.node}` }));

if (!chosen) {
  console.error("No seed qualified; see eval/sweeps/hook-seed.md.");
  process.exit(1);
}
console.log(`hook seed: ${chosen.seed} (one group from step ${chosen.singleGroupFrom}, ordered from step ${chosen.orderedFrom})`);
