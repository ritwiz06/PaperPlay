/**
 * Live jobs and gates never share the machine (ADR-0039). A gate's browser tests wait a fixed time
 * for a world's first frame, and a live job's load makes them miss it; the cure is never to run the
 * two at once, not to wait longer. `npm run pipeline:live` holds a live lock for as long as it runs,
 * `npm run check:gate` a gate lock; each refuses to start while the other's is held, and land
 * refuses while a live lock is held, before it runs anything.
 *
 * Locks live in the repository's git directory, which every worktree shares. Each names its
 * process, so a lock whose process has ended, killed or crashed, is cleared when next read.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type LockKind = "live" | "gate";

export interface Lock {
  readonly kind: LockKind;
  readonly pid: number;
  readonly command: string;
  readonly started: string;
}

/** Where the locks of the repository at `cwd` are kept: its common git directory, shared by its worktrees. */
export function lockDir(cwd: string): string {
  const run = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, encoding: "utf8" });
  if (run.status !== 0) throw new Error(`git rev-parse --git-common-dir failed: ${(run.stderr || run.stdout).trim()}`);
  return join(run.stdout.trim(), "paperplay-locks");
}

/** Whether a process is running: signal 0 tests without signalling; EPERM means it runs as another user. */
export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** The locks of one kind held now; a lock whose process has ended, or that cannot be read, is removed. */
export function heldLocks(dir: string, kind: LockKind, alive: (pid: number) => boolean = processAlive): Lock[] {
  if (!existsSync(dir)) return [];
  const held: Lock[] = [];
  for (const name of readdirSync(dir).filter((file) => file.startsWith(`${kind}-`) && file.endsWith(".json"))) {
    const path = join(dir, name);
    let lock: Lock | null;
    try {
      lock = JSON.parse(readFileSync(path, "utf8")) as Lock;
    } catch {
      lock = null;
    }
    if (lock && typeof lock.pid === "number" && alive(lock.pid)) held.push(lock);
    else rmSync(path, { force: true });
  }
  return held;
}

/** Writes a lock for a process and returns how to release it. */
export function writeLock(dir: string, kind: LockKind, command: string, pid: number = process.pid): () => void {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${kind}-${pid}.json`);
  const lock: Lock = { kind, pid, command, started: new Date().toISOString() };
  writeFileSync(path, `${JSON.stringify(lock)}\n`);
  return () => rmSync(path, { force: true });
}

/** Holds a lock for this process until it exits, however it exits short of a hard kill (which the next read clears). */
export function holdLock(dir: string, kind: LockKind, command: string): void {
  const release = writeLock(dir, kind, command);
  process.once("exit", release);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.once(signal, () => {
      release();
      process.exit(128 + (signal === "SIGINT" ? 2 : signal === "SIGTERM" ? 15 : 1));
    });
  }
}

/** The held locks in words: "pipeline:live serve (pid 4242, since 2026-10-16T22:00:00.000Z)". */
export function describeLocks(locks: readonly Lock[]): string {
  return locks.map((lock) => `${lock.command} (pid ${lock.pid}, since ${lock.started})`).join("; ");
}

/** Why a gate, or a land, may not start here now, or null when it may. */
export function whyNoGate(live: readonly Lock[]): string | null {
  return live.length === 0 ? null : `a live pipeline is running: ${describeLocks(live)}. Live jobs and gates never share the machine (ADR-0039); stop it, or wait until it ends`;
}

/** Why a live pipeline may not start here now, or null when it may. */
export function whyNoLive(gates: readonly Lock[]): string | null {
  return gates.length === 0 ? null : `a gate is running: ${describeLocks(gates)}. Live jobs and gates never share the machine (ADR-0039); wait until it ends`;
}
