/**
 * npm run sweep:groups
 *
 * Validates the group measure (ADR-0015) and writes eval/sweeps/group-measure.md: random
 * scatters at the default density, and seed 4's murmuration. Exits non-zero if either of
 * the owner's criteria fails.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { flockPlanarWeighted as flock } from "@paperplay/primitives/flock";
import { CRITERION, murmuration, scatterSweep, toMarkdown } from "./sweep/group-measure.ts";

const rows = scatterSweep();
const seed = murmuration();
writeFileSync(join(import.meta.dirname, "..", "eval", "sweeps", "group-measure.md"), toMarkdown(rows, seed, { primitive: `${flock.id}@${flock.version}`, runtime: `node ${process.versions.node}` }));
for (const row of rows) console.log(`${row.variant.padEnd(36)} one group ${String(row.oneGroup).padStart(5)}  ${(row.share * 100).toFixed(2)}%  (95% upper ${(row.upper95 * 100).toFixed(3)}%)`);
console.log(`seed 4: reads as one group at 20 s: ${String(seed.rows.at(-1)?.oneGroup)}; from step ${seed.oneGroupFrom}`);
const own = rows.at(-1);
if (!own || own.upper95 >= CRITERION || seed.rows.at(-1)?.oneGroup !== true) {
  console.error("The group measure fails the owner's criteria; see eval/sweeps/group-measure.md.");
  process.exit(1);
}
