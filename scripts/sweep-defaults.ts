/**
 * npm run sweep:defaults
 *
 * Deterministic sweep of the flock's four rule parameters across 20 seeds, in two declared
 * stages, written to eval/sweeps/. The chosen settings are re-checked on 40 held-out seeds.
 * ADR-0003 records the defaults chosen from it. Exits non-zero when no configuration
 * succeeds for a majority of seeds, so nothing is chosen silently.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { flockPlanarWeighted as flock } from "@paperplay/primitives";
import {
  chooseDefaults,
  mergeGrids,
  PROTOTYPE,
  spansOf,
  successesOn,
  sweep,
  toCsv,
  toMarkdown,
  union,
  type StageResult,
  type SweepGrid,
} from "./sweep/flock-sweep.ts";

const STAGES: readonly { name: string; note: string; grid: SweepGrid }[] = [
  {
    name: "initial",
    note: "A bracketing grid around the prototype's settings, with alignment capped at 1.5 so a default leaves room to raise it.",
    grid: {
      separationWeight: [0.6, 0.9, 1.2, 1.5],
      alignmentWeight: [0.75, 1, 1.25, 1.5],
      cohesionWeight: [0.4, 0.8, 1.2, 1.6],
      perceptionRadius: [4.5, 6, 7.5, 9],
    },
  },
  {
    name: "extension",
    note: "Declared after the initial stage, whose best configurations sat on its boundary (alignment at its top, cohesion at its bottom, perception at its top) and of which none qualified. It extends one step past each of those boundaries and refines separation around the best value, 0.9.",
    grid: {
      separationWeight: [0.75, 0.9, 1.05],
      alignmentWeight: [1.25, 1.5, 1.75, 2],
      cohesionWeight: [0.1, 0.2, 0.3, 0.4],
      perceptionRadius: [7.5, 9, 10.5, 12],
    },
  },
];
const OPTIONS = { seeds: Array.from({ length: 20 }, (_, index) => index + 1), steps: 1200, sampleEvery: 60 };
const HELD_OUT = Array.from({ length: 40 }, (_, index) => index + 21);
const MIN_SUCCESSES = 11;

const out = join(import.meta.dirname, "..", "eval", "sweeps");
mkdirSync(out, { recursive: true });

// Each stage's table is written as soon as it is complete, so a later failure loses nothing.
const stages: StageResult[] = STAGES.map((stage) => {
  const sizes = Object.values(stage.grid).reduce((product, values) => product * values.length, 1);
  const rows = sweep(stage.grid, OPTIONS, (_row, index) => {
    if ((index + 1) % 32 === 0 || index + 1 === sizes) console.log(`${stage.name}: swept ${index + 1} of ${sizes} configurations`);
  });
  writeFileSync(join(out, `flock-defaults-${stage.name}.csv`), toCsv(rows));
  return { ...stage, rows };
});
const rows = union(stages.map((stage) => stage.rows));
const chosen = chooseDefaults(rows, PROTOTYPE, spansOf(mergeGrids(STAGES.map((stage) => stage.grid))), MIN_SUCCESSES);
const heldOut = chosen
  ? { seeds: HELD_OUT, successes: successesOn(chosen, HELD_OUT, { steps: OPTIONS.steps, sampleEvery: OPTIONS.sampleEvery }) }
  : undefined;

writeFileSync(
  join(out, "flock-defaults.md"),
  toMarkdown(chosen, {
    stages,
    options: OPTIONS,
    minSuccesses: MIN_SUCCESSES,
    ...(heldOut ? { heldOut } : {}),
    primitive: `${flock.id}@${flock.version}`,
    runtime: `node ${process.versions.node}`,
  }),
);

if (!chosen || !heldOut) {
  console.error(`No configuration reached ${MIN_SUCCESSES} of ${OPTIONS.seeds.length} successes; see eval/sweeps/flock-defaults.md.`);
  process.exit(1);
}
console.log(
  `chosen: separation ${chosen.separationWeight}, alignment ${chosen.alignmentWeight}, cohesion ${chosen.cohesionWeight}, perception ${chosen.perceptionRadius}: ${chosen.successes}/${chosen.seeds} sweep seeds, ${heldOut.successes}/${HELD_OUT.length} held-out seeds`,
);
