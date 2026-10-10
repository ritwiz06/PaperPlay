/**
 * npm run sweep:levels
 *
 * Checks every level's stated effect against the level rule (ADR-0018) on skies 1 to 20, and
 * writes eval/sweeps/levels.md (or, with --print, prints it). Exits non-zero if any level fails the rule.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { flockPlanarWeighted as flock } from "@paperplay/primitives/flock";
import { referenceWorld, rejoinCandidate, sweepLevels, toMarkdown } from "./sweep/levels.ts";

const world = referenceWorld();
const levels = sweepLevels(world);
const rejoin = rejoinCandidate();
const record = toMarkdown(levels, rejoin, { primitive: `${flock.id}@${flock.version}`, runtime: `node ${process.versions.node}`, status: `a ${world.status}` });
// With --print, the record goes to standard output instead, for the test that re-runs it.
if (process.argv.includes("--print")) {
  process.stdout.write(record);
  process.exit(levels.every((level) => level.meets) ? 0 : 1);
}
writeFileSync(join(import.meta.dirname, "..", "eval", "sweeps", "levels.md"), record);
for (const level of levels) console.log(`${String(level.order)} ${level.title.padEnd(48)} holds ${String(level.holds).padStart(2)} of 20  ${level.meets ? "meets" : "FAILS"}`);
console.log(`level 4's candidate (b), rejoining: holds ${rejoin.filter((row) => row.holds).length} of 20`);
if (levels.some((level) => !level.meets)) {
  console.error("A level fails the rule; see eval/sweeps/levels.md.");
  process.exit(1);
}
