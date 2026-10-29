/**
 * PaperPlay's own servers on this machine (ADR-0059). Each server PaperPlay starts, and each
 * background run, writes a pid file naming its process, its command line, its port and the commit
 * it runs; `npm run stop` stops those, and only those whose process still has that command line,
 * so it never stops another app's server, nor a process that took a dead server's pid. A server
 * that finds its port taken says which process holds it, from lsof on every address, and whether
 * it looks like PaperPlay's, then exits; it never prints a stack trace for it.
 *
 * Pid files live in the repository's git directory, beside the machine's locks, shared by every
 * worktree and never committed.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { processAlive } from "./locks.ts";
import { HOST, urlOf } from "./ports.ts";

/** One process listening on a port, as lsof reports it, with what it is. */
export interface PortHolder {
  readonly pid: number;
  /** The addresses it listens on, as lsof names them: 127.0.0.1:5180, [::1]:5180, *:5180. */
  readonly addresses: readonly string[];
  readonly command: string;
  readonly cwd: string | null;
  /** Whether its command line or its folder is a PaperPlay checkout's. */
  readonly paperplay: boolean;
  /** Its pid file, when PaperPlay started it and recorded it. */
  readonly record: ServerRecord | null;
}

export interface ServerRecord {
  readonly pid: number;
  /** A watcher that restarts it, such as `node --watch`, stopped with it. */
  readonly watcher: { readonly pid: number; readonly command: string } | null;
  /** "web", "api", or "live <command>" for a background run. */
  readonly role: string;
  readonly port: number | null;
  readonly commit: string;
  readonly started: string;
  /** Its command line as ps prints it, so a later pid of the same number is never taken for it. */
  readonly command: string;
  readonly cwd: string;
}

const run = (command: string, args: readonly string[], cwd?: string): string => {
  const result = spawnSync(command, args, { encoding: "utf8", ...(cwd ? { cwd } : {}) });
  return result.status === 0 ? result.stdout : "";
};

/** A process's command line as ps prints it, or "" when it has ended. */
export const commandOf = (pid: number): string => run("ps", ["-o", "command=", "-p", String(pid)]).trim();

const cwdOf = (pid: number): string | null => {
  const named = run("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]).split("\n").find((line) => line.startsWith("n"));
  return named ? named.slice(1) : null;
};

/** The repository's root, and the folder that holds the pid files of every worktree of it. */
export function repositoryRoot(cwd: string = process.cwd()): string {
  return run("git", ["rev-parse", "--show-toplevel"], cwd).trim() || cwd;
}
export function runDir(cwd: string = process.cwd()): string {
  const common = run("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd).trim();
  return join(common || join(cwd, ".git"), "paperplay-run");
}

/** A path inside a PaperPlay checkout: this one, a sibling worktree of it, or any folder named PaperPlay. */
const inPaperPlay = (text: string, root: string): boolean => text.includes(dirname(root) + "/PaperPlay") || text.includes(root) || /\/PaperPlay(-[A-Za-z0-9-]+)?(\/|$)/.test(text);

/** Every process listening on the port, on any address, as lsof sees it. */
export function holdersOf(port: number, root: string = repositoryRoot(), dir: string = runDir(root)): PortHolder[] {
  const lines = run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpn"]).split("\n");
  const found = new Map<number, string[]>();
  let pid = 0;
  for (const line of lines) {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    else if (line.startsWith("n") && pid > 0) found.set(pid, [...(found.get(pid) ?? []), line.slice(1)]);
  }
  const records = readRecords(dir);
  return [...found].map(([holder, addresses]) => {
    const command = commandOf(holder);
    const cwd = cwdOf(holder);
    return { pid: holder, addresses: [...new Set(addresses)], command, cwd, paperplay: inPaperPlay(command, root) || (cwd !== null && inPaperPlay(cwd, root)), record: records.find((record) => record.pid === holder) ?? null };
  });
}

/** Whether the port can be bound on an address: the truth where lsof is not installed. */
export function canBind(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", (error: NodeJS.ErrnoException) => resolve(error.code === "EADDRNOTAVAIL"));
    server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(true)));
  });
}

/** What a server says when its port is taken: which port, who holds it on which address, and what to do. */
export function busyMessage(port: number, what: string, setting: string, holders: readonly PortHolder[]): string {
  const lines = [`PaperPlay cannot start ${what}: port ${port} is in use.`];
  if (holders.length === 0) lines.push(`  Something holds ${HOST}:${port} or [::1]:${port}, and lsof could not say what.`);
  for (const holder of holders) {
    lines.push(`  pid ${holder.pid} listens on ${holder.addresses.join(" and ")}: ${holder.command.slice(0, 160) || "a process that has since ended"}`);
    if (holder.cwd) lines.push(`    in ${holder.cwd}`);
    if (holder.record) lines.push(`    PaperPlay's own ${holder.record.role}, started ${holder.record.started} from commit ${holder.record.commit}: npm run stop stops it.`);
    else if (holder.paperplay) lines.push(`    It looks like a PaperPlay server that PaperPlay did not record (started by hand, or before pid files): stop it with kill ${holder.pid}.`);
    else lines.push("    It is not a PaperPlay server; PaperPlay leaves it alone.");
  }
  lines.push(`Run PaperPlay on another port, for example ${setting}=${port + 1}, or stop the program above.`);
  return lines.join("\n");
}

/**
 * Exits with the busy message, and no stack trace, when anything listens on the port on any address
 * (so "localhost", whichever address it resolves to, never reaches another app), or the port cannot
 * be bound on 127.0.0.1.
 */
export async function ensurePortFree(port: number, what: string, setting: string): Promise<void> {
  const holders = holdersOf(port);
  if (holders.length === 0 && (await canBind(port, HOST)) && (await canBind(port, "::1"))) return;
  console.error(busyMessage(port, what, setting, holders));
  process.exit(1);
}

/** The pid files that name a running process with the command line they recorded; the rest are cleared. */
export function readRecords(dir: string = runDir()): ServerRecord[] {
  if (!existsSync(dir)) return [];
  const records: ServerRecord[] = [];
  for (const name of readdirSync(dir).filter((file) => file.endsWith(".json"))) {
    const path = join(dir, name);
    let record: ServerRecord;
    try {
      record = JSON.parse(readFileSync(path, "utf8")) as ServerRecord;
    } catch {
      rmSync(path, { force: true });
      continue;
    }
    if (processAlive(record.pid) && commandOf(record.pid) === record.command) records.push(record);
    else rmSync(path, { force: true });
  }
  return records;
}

const headOf = (cwd: string): string => run("git", ["rev-parse", "--short", "HEAD"], cwd).trim() || "unknown";

/**
 * Records this process as one of PaperPlay's, removed when it exits; a `node --watch` above it is
 * recorded as its watcher, so stopping one stops both.
 */
export function registerServer(role: string, port: number | null, dir: string = runDir()): ServerRecord {
  mkdirSync(dir, { recursive: true });
  const parent = commandOf(process.ppid);
  const record: ServerRecord = {
    pid: process.pid,
    watcher: /\snode\b.*--watch\b|^node --watch\b/.test(` ${parent}`) ? { pid: process.ppid, command: parent } : null,
    role,
    port,
    commit: headOf(process.cwd()),
    started: new Date().toISOString(),
    command: commandOf(process.pid),
    cwd: process.cwd(),
  };
  const path = join(dir, `${role.replace(/[^a-z0-9-]+/gi, "-")}-${process.pid}.json`);
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
  process.on("exit", () => rmSync(path, { force: true }));
  return record;
}

/** PaperPlay's servers still running from another commit than this checkout's, said as warnings. */
export function staleWarnings(dir: string = runDir(), cwd: string = process.cwd()): string[] {
  const head = headOf(cwd);
  return readRecords(dir)
    .filter((record) => record.pid !== process.pid && record.commit !== head)
    .map((record) => `PaperPlay: an older ${record.role} still runs, from commit ${record.commit}, started ${record.started}${record.port ? `, on ${urlOf(record.port)}` : ""} (pid ${record.pid}); npm run stop stops it.`);
}

/**
 * Stops PaperPlay's own servers and background runs: each recorded process whose command line is
 * still the one it recorded, and its watcher, asked to end and then made to; a process PaperPlay did
 * not record is never touched. Returns what it did, a line each.
 */
export async function stopServers(dir: string = runDir(), graceMs = 5_000): Promise<string[]> {
  const records = readRecords(dir);
  const said: string[] = [];
  const targets = records.flatMap((record) => [...(record.watcher && processAlive(record.watcher.pid) && commandOf(record.watcher.pid) === record.watcher.command ? [record.watcher.pid] : []), record.pid]);
  for (const pid of targets) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Ended already.
    }
  }
  const deadline = Date.now() + graceMs;
  while (targets.some(processAlive) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
  for (const pid of targets.filter(processAlive)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Ended at last.
    }
  }
  for (const record of records) {
    rmSync(join(dir, `${record.role.replace(/[^a-z0-9-]+/gi, "-")}-${record.pid}.json`), { force: true });
    said.push(`stopped PaperPlay's ${record.role}${record.port ? ` on ${urlOf(record.port)}` : ""} (pid ${record.pid}${record.watcher ? `, and its watcher ${record.watcher.pid}` : ""}), from commit ${record.commit}`);
  }
  return said;
}
