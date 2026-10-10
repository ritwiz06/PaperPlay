/**
 * npm run sweep:levels
 *
 * Checks every level's stated effect against the level rule (ADR-0018, ADR-0024) in every
 * authored world: the flocking world on skies 1 to 20, writing eval/sweeps/levels.md, and
 * Threshold Town on its 20 starts, writing eval/sweeps/levels-kermack-mckendrick-1927.md with its
 * accuracy check. With --print, it prints one world's record instead: the flocking world's, or
 * the one whose fixture is named after it. Exits non-zero if any level fails the rule.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { flockPlanarWeighted as flock } from "@paperplay/primitives/flock";
import { FIXTURES, referenceWorld, rejoinCandidate, startsOf, sweepAccuracy, sweepLevels, toMarkdown, toNeighbourhoodMarkdown, type LevelResult } from "./sweep/levels.ts";

interface Swept {
  readonly fixture: string;
  readonly record: string;
  readonly text: string;
  readonly levels: readonly LevelResult[];
  readonly accurate: boolean;
}

const runtime = `node ${process.versions.node}`;

function flocking(): Swept {
  const world = referenceWorld();
  const levels = sweepLevels(world);
  const text = toMarkdown(levels, rejoinCandidate(), { primitive: `${flock.id}@${flock.version}`, runtime, status: `a ${world.status}` });
  return { fixture: "flocking-reference.json", record: "levels.md", text, levels, accurate: true };
}

function thresholdTown(): Swept {
  const fixture = "kermack-mckendrick-1927.json";
  const world = referenceWorld(join(FIXTURES, fixture));
  const starts = startsOf(world);
  const levels = sweepLevels(world, starts);
  const accuracy = sweepAccuracy(world, starts);
  const solver = world.levels[0]?.primitiveRef;
  const text = toNeighbourhoodMarkdown(world, fixture, levels, starts, accuracy, { solver: `${solver?.id ?? "?"}@${solver?.version ?? "?"}`, runtime });
  return { fixture, record: "levels-kermack-mckendrick-1927.md", text, levels, accurate: accuracy.every((row) => row.ratio <= 1) };
}

const WORLDS: Readonly<Record<string, () => Swept>> = { "flocking-reference.json": flocking, "kermack-mckendrick-1927.json": thresholdTown };
const passes = (swept: Swept): boolean => swept.accurate && swept.levels.every((level) => level.meets);

// With --print, one record goes to standard output instead, for the test that re-runs it.
const printing = process.argv.indexOf("--print");
if (printing >= 0) {
  const name = process.argv[printing + 1] ?? "flocking-reference.json";
  const sweep = WORLDS[name];
  if (!sweep) throw new Error(`no authored world has the fixture ${name}`);
  const swept = sweep();
  process.stdout.write(swept.text);
  process.exit(passes(swept) ? 0 : 1);
}

let failed = false;
for (const sweep of Object.values(WORLDS)) {
  const swept = sweep();
  writeFileSync(join(import.meta.dirname, "..", "eval", "sweeps", swept.record), swept.text);
  console.log(swept.fixture);
  for (const level of swept.levels) console.log(`  ${String(level.order)} ${level.title.padEnd(48)} holds ${String(level.holds).padStart(2)} of 20  ${level.meets ? "meets" : "FAILS"}`);
  if (!swept.accurate) console.log("  the accuracy check FAILS on at least one run");
  failed ||= !passes(swept);
}
if (failed) {
  console.error("A level fails the rule; see its record in eval/sweeps/.");
  process.exit(1);
}
