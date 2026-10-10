import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RunRecord } from "@paperplay/contracts";
import { flockPlanarWeighted as flock, replayRecord, type FlockParams } from "@paperplay/primitives";
import { describe, expect, it } from "vitest";
import { FLOCKING } from "../src/world/authored-world.ts";
import { forkParams } from "../src/world/fork.ts";
import { makeRecords, PARTS, serialise } from "./records/flocking.ts";

// The flocking world's records from before G3a's refactor (apps/web/test/records/flocking.ts). They were
// made once, on the code at RECORDED_AT, and are never made again: the code is held to them.

const dir = join(import.meta.dirname, "..", "..", "..", "fixtures", "records", "flocking-seed5");
const stored = (name: string): string => readFileSync(join(dir, `${name}.json`), "utf8");
const names = FLOCKING.levels.flatMap((level) => PARTS.map((part) => `${level.id}-${part}`));

describe("[R07] the flocking world's six levels on seed 5, recorded before G3a", () => {
  it("are three records a level, for every level, and the folder's README", () => {
    expect(readdirSync(dir).sort()).toEqual([...names.map((name) => `${name}.json`), "README.md"].sort());
  });

  for (const level of FLOCKING.levels) {
    for (const part of PARTS) {
      it(`level ${level.order}, ${part}: replays bit for bit against the world as built today`, () => {
        const record = RunRecord.parse(JSON.parse(stored(`${level.id}-${part}`)));
        // The trunk and this side of the fork run on the level's own rules; the other side on the What-if's.
        const params = part === "there" ? forkParams(level, level.params as FlockParams).there : level.params;
        const report = replayRecord(record, { primitive: flock, params, actions: level.actions });
        expect(report.mismatches).toEqual([]);
        expect(report.maxDeviation).toBe(0);
      });
    }
  }

  it("are made again, byte for byte, by the app's own session and fork", () => {
    const made = makeRecords();
    expect(Object.keys(made)).toEqual(names);
    for (const name of names) {
      const record = made[name];
      if (!record) throw new Error(`no record ${name}`);
      expect(serialise(record), name).toBe(stored(name));
    }
  }, 120_000);
});
