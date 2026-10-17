import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { heldLocks, whyNoGate, whyNoLive, writeLock } from "../machine/locks.ts";

// Live jobs and gates never share the machine (ADR-0039): each holds a lock the other reads.

describe("the machine's locks", () => {
  let dir: string;
  beforeEach(() => {
    dir = join(mkdtempSync(join(tmpdir(), "paperplay-locks-")), "locks");
  });
  afterEach(() => rmSync(join(dir, ".."), { recursive: true, force: true }));

  it("are held by kind, and released", () => {
    expect(heldLocks(dir, "live")).toEqual([]);
    const release = writeLock(dir, "live", "pipeline:live serve", 4242);
    writeLock(dir, "gate", "check:gate G1", 4343);
    const alive = () => true;
    expect(heldLocks(dir, "live", alive).map((lock) => [lock.kind, lock.pid, lock.command])).toEqual([["live", 4242, "pipeline:live serve"]]);
    expect(heldLocks(dir, "gate", alive).map((lock) => lock.command)).toEqual(["check:gate G1"]);
    release();
    expect(heldLocks(dir, "live", alive)).toEqual([]);
  });

  it("clear a lock whose process has ended, and one that cannot be read", () => {
    writeLock(dir, "live", "pipeline:live design", 1);
    writeFileSync(join(dir, "live-7.json"), "not json");
    expect(heldLocks(dir, "live", () => false)).toEqual([]);
    expect(readdirSync(dir)).toEqual([]);
    expect(existsSync(dir)).toBe(true);
  });

  it("refuse a gate while a live pipeline runs, and a live pipeline while a gate runs, naming each", () => {
    writeLock(dir, "live", "pipeline:live serve", 4242);
    writeLock(dir, "gate", "check:gate G1", 4343);
    expect(whyNoGate(heldLocks(dir, "live", () => true))).toMatch(/^a live pipeline is running: pipeline:live serve \(pid 4242, since \d{4}-.+\)\. Live jobs and gates never share the machine \(ADR-0039\)/);
    expect(whyNoLive(heldLocks(dir, "gate", () => true))).toMatch(/^a gate is running: check:gate G1 \(pid 4343/);
    expect(whyNoGate([])).toBeNull();
    expect(whyNoLive([])).toBeNull();
  });
});
