/**
 * The flocking world's six levels on seed 5, as run records made before G3a's refactor
 * (owner, 2026-10-10): the refactor must leave every one of them replaying bit for bit, and the
 * app's own session and fork must make them again byte for byte.
 *
 * For each level, three records:
 * - `trunk`: the level as the learner plays it, from its start on seed 5: its control moved to
 *   the top of its range, then the bottom, then back to its default, with the level's prediction
 *   made along the way, 10 s in all;
 * - `here` and `there`: the level's fork, opened 2 s into a fresh run of the level, played to the
 *   end of the level's time: this world, and the world with the What-if applied.
 *
 * The identity is fixed: these records were made with the code at RECORDED_AT, against the
 * WorldSpec and lockfile that commit held, on the runtime named. The records live in
 * fixtures/records/flocking-seed5/, and apps/web/test/records.test.ts holds the code to them.
 */
import type { RunRecord } from "@paperplay/contracts";
import { FLOCKING, sessionOptionsFor } from "../../src/world/authored-world.ts";
import { openFork } from "../../src/world/fork.ts";
import type { RunIdentity } from "../../src/world/session.ts";
import { createWorldSession, type FlockSession as WorldSession } from "../../src/world/valley.ts";

/** The commit whose code made the records: main before G3a.1. */
export const RECORDED_AT = "f0bc31ceaf22e8e8378cbffdb1fab37b3116cb97";
/** SHA-256 of that commit's id, as the record's code hash. */
const CODE_HASH = "38de8dfe77c5cc57829b47580f966db8da89061fa43b15ef6324ad3f4e0e6b60";
/** SHA-256 of fixtures/worldspecs/flocking-reference.json at RECORDED_AT, worldspec/2. */
export const WORLDSPEC_HASH = "d1b87d998db7a39a21c105c1ed3977014f9465637090e835664cb6f544077af6";
/** SHA-256 of package-lock.json at RECORDED_AT. */
const LOCK_HASH = "5c44e02a20b6df52593a92eb29c45b26736b9855cd9025d949fb5658aa35b338";

export type Part = "trunk" | "here" | "there";
export const PARTS: readonly Part[] = ["trunk", "here", "there"];

const identity = (levelId: string, part: Part): RunIdentity => ({
  runId: `flocking-seed5-${levelId}-${part}`,
  worldSpecHash: WORLDSPEC_HASH,
  codeHash: CODE_HASH,
  lockHash: LOCK_HASH,
  runtime: { engine: "node 24.21.0", os: "darwin arm64" },
  tolerance: 0,
});

/** The trunk's script, in steps: where the control moves, and where the prediction is made. */
const TRUNK = { top: 90, bottom: 240, back: 390, predict: 450, end: 600 } as const;
/** The fork opens this many steps into a fresh run of the level. */
const FORK_AT = 120;

function trunkOf(levelId: string): RunRecord {
  const level = FLOCKING.levels.find((entry) => entry.id === levelId);
  if (!level) throw new Error(`the flocking world has no level ${levelId}`);
  const session = createWorldSession(sessionOptionsFor(level, false));
  const to = (step: number) => session.stepBy(step - session.snapshot().step);
  const [min, max] = level.action.range;
  to(TRUNK.top);
  session.setAction(level.action.actionId, max);
  to(TRUNK.bottom);
  session.setAction(level.action.actionId, min);
  to(TRUNK.back);
  session.setAction(level.action.actionId, level.action.defaultValue);
  to(TRUNK.predict);
  if (level.exploration) session.predict(level.id, level.exploration.predictPrompt, 0, level.exploration.choices[0] ?? "");
  to(TRUNK.end);
  return session.record(identity(level.id, "trunk"));
}

function forkOf(levelId: string): { here: RunRecord; there: RunRecord } {
  const level = FLOCKING.levels.find((entry) => entry.id === levelId);
  if (!level) throw new Error(`the flocking world has no level ${levelId}`);
  const from: WorldSession = createWorldSession(sessionOptionsFor(level, false));
  from.stepBy(FORK_AT);
  const fork = openFork(level, from, { playing: true });
  for (let frame = 0; !fork.snapshot().done; frame++) {
    if (frame > 100_000) throw new Error(`level ${levelId}'s fork never finished`);
    fork.tick(0.2);
  }
  return { here: fork.here.record(identity(level.id, "here")), there: fork.there.record(identity(level.id, "there")) };
}

/** Every record, by `<level>-<part>`, in level order. */
export function makeRecords(): Record<string, RunRecord> {
  const records: Record<string, RunRecord> = {};
  for (const level of FLOCKING.levels) {
    records[`${level.id}-trunk`] = trunkOf(level.id);
    const { here, there } = forkOf(level.id);
    records[`${level.id}-here`] = here;
    records[`${level.id}-there`] = there;
  }
  return records;
}

/** A record as it is stored: two-space JSON with a final newline. */
export const serialise = (record: RunRecord): string => `${JSON.stringify(record, null, 2)}\n`;
