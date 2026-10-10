import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RunRecord } from "@paperplay/contracts";
import { replayRecord, runEvents } from "@paperplay/primitives";
import { flockPlanarWeighted as flock, type FlockParams } from "@paperplay/primitives/flock";
import { describe, expect, it } from "vitest";
import { FLOCKING } from "../src/world/authored-world.ts";
import { forkParams } from "../src/world/fork.ts";
import { makeRecords, PARTS, serialise } from "./records/flocking.ts";

// The flocking world's records from before G3a's refactor (./records/flocking.ts). They were made
// once, on the code at RECORDED_AT, and are never made again: the code is held to them.
//
// Bit for bit on the runtime that made them. Elsewhere, the runs are the same, state for state,
// and so is every observable but E19, the largest group's spread: its circular mean calls
// Math.cos, Math.sin and Math.atan2, which ECMAScript lets each engine round its own way, while
// every other observable is arithmetic and Math.sqrt, which it does not. On Linux x86-64, E19
// once differed in its last bit (2026-10-10).

const dir = join(import.meta.dirname, "..", "..", "..", "fixtures", "records", "flocking-seed5");
const stored = (name: string): string => readFileSync(join(dir, `${name}.json`), "utf8");
const names = FLOCKING.levels.flatMap((level) => PARTS.map((part) => `${level.id}-${part}`));
const finalStates = (JSON.parse(readFileSync(join(dir, "final-states.json"), "utf8")) as { states: Record<string, string> }).states;
const runtime = `${process.platform} ${process.arch}`;
/** Observables whose functions an engine may round its own way. */
const ENGINE_ROUNDED = new Set(["groupSpread"]);
/** How far an engine's rounding may move them, away from the runtime the records were made on. */
const ELSEWHERE = 1e-12;
const sha256 = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Each observable's series equals the record's: exactly, unless an engine may round it and this is not the record's runtime. */
function expectObservables(made: Record<string, number[]>, recorded: Record<string, number[]>, native: boolean, label: string): void {
  expect(Object.keys(made), label).toEqual(Object.keys(recorded));
  for (const [metric, values] of Object.entries(recorded)) {
    const again = made[metric] ?? [];
    if (native || !ENGINE_ROUNDED.has(metric)) expect(again, `${label} ${metric}`).toEqual(values);
    else values.forEach((value, index) => expect(Math.abs((again[index] ?? Number.NaN) - value), `${label} ${metric}[${index}]`).toBeLessThanOrEqual(ELSEWHERE));
  }
}

describe("[R07] the flocking world's six levels on seed 5, recorded before G3a", () => {
  it("are three records a level, for every level, with their final states' hashes and the folder's README", () => {
    expect(readdirSync(dir).sort()).toEqual([...names.map((name) => `${name}.json`), "README.md", "final-states.json"].sort());
    expect(Object.keys(finalStates)).toEqual(names);
  });

  for (const level of FLOCKING.levels) {
    for (const part of PARTS) {
      it(`level ${level.order}, ${part}: replays bit for bit where it was recorded, and state for state everywhere`, () => {
        const name = `${level.id}-${part}`;
        const record = RunRecord.parse(JSON.parse(stored(name)));
        const native = record.runtime.os === runtime;
        // The trunk and this side of the fork run on the level's own rules; the other side on the What-if's.
        const params = part === "there" ? forkParams(level, level.params as FlockParams).there : level.params;
        const setup = { primitive: flock, params, actions: level.actions };
        const report = replayRecord({ ...record, tolerance: native ? 0 : ELSEWHERE }, setup);
        expect(report.mismatches).toEqual([]);
        if (native) expect(report.maxDeviation).toBe(0);
        const run = runEvents(setup, { ...record, initialState: flock.stateSchema.parse(record.initialState) });
        expectObservables(run.observables, record.observables, native, name);
        expect(sha256(run.finalState), `${name}'s final state`).toBe(finalStates[name]);
      });
    }
  }

  it("are made again by the app's own session and fork: byte for byte where they were recorded, and elsewhere but for engine rounding", () => {
    const made = makeRecords();
    expect(Object.keys(made)).toEqual(names);
    for (const name of names) {
      const record = made[name];
      if (!record) throw new Error(`no record ${name}`);
      const recorded = RunRecord.parse(JSON.parse(stored(name)));
      if (recorded.runtime.os === runtime) {
        expect(serialise(record), name).toBe(stored(name));
      } else {
        const { observables, ...rest } = record;
        const { observables: recordedObservables, ...recordedRest } = recorded;
        expect(rest, name).toEqual(recordedRest);
        expectObservables(observables, recordedObservables, false, name);
      }
    }
  }, 120_000);
});
