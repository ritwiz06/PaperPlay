/**
 * Land a branch on main (ADR-0009): the only routine way main moves.
 *
 * In order, and refusing at the first problem:
 * 1. the branch is a `<gate>/<topic>` branch, not main or a detached HEAD, its tree is clean,
 *    and it sits on top of origin's main;
 * 2. `npm run check:gate` exits 0, read from its own exit status, and leaves the tree as it was;
 * 3. the branch is pushed, and CI's run on that exact commit is watched to its end with
 *    `gh run watch`;
 * 4. only when that run concluded success: origin's main is fast-forwarded to the commit, then
 *    the local main, and the branch is deleted. Once origin's main has moved the land stands;
 *    a failure while tidying up locally is reported as a warning.
 *
 * Steps 2 and 3 are written to the land record, which the pre-push hook reads before it lets
 * any push move main.
 */
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { writeRecord, type LandRecord } from "./guard.ts";

export interface LandOptions {
  /** The repository's root. */
  root: string;
  /** The GitHub CLI, as a command and leading arguments. Tests pass a stand-in; the command line never can. */
  gh?: string[];
  /** How long to wait for CI to start a run for the pushed commit, and how often to ask. */
  findTimeoutMs?: number;
  findIntervalMs?: number;
  /** Hide the gate's and CI's own output (tests). Their exit statuses are read either way. */
  quiet?: boolean;
  log?: (line: string) => void;
}

export interface LandResult {
  landed: boolean;
  /** Why land refused, when it did. */
  reason?: string;
  sha?: string;
  runUrl?: string;
  /** Tidying up after origin's main moved: these failed, and the land still stands. */
  warnings?: string[];
}

interface Run {
  databaseId: number;
  headSha: string;
  status: string;
  conclusion: string;
  url: string;
}

class Refusal extends Error {}

const BRANCH = /^g[1-5]\/[a-z0-9][a-z0-9-]*$/;

export async function land(options: LandOptions): Promise<LandResult> {
  const { root, gh: [ghCommand = "gh", ...ghPrefix] = ["gh"], findTimeoutMs = 180_000, findIntervalMs = 5_000, quiet = false } = options;
  const log = options.log ?? ((line: string) => console.log(line));
  const stdio = quiet ? "ignore" : "inherit";

  const git = (args: string[]): SpawnSyncReturns<string> => spawnSync("git", args, { cwd: root, encoding: "utf8" });
  const gitOut = (args: string[]): string => {
    const run = git(args);
    if (run.status !== 0) throw new Refusal(`git ${args.join(" ")} failed: ${(run.stderr || run.stdout).trim()}`);
    return run.stdout.trim();
  };
  const isAncestor = (ancestor: string, of: string): boolean => git(["merge-base", "--is-ancestor", ancestor, of]).status === 0;
  const ghJson = <T>(args: string[]): T => {
    const run = spawnSync(ghCommand, [...ghPrefix, ...args], { cwd: root, encoding: "utf8" });
    if (run.status !== 0) throw new Refusal(`gh ${args.join(" ")} failed: ${(run.stderr || run.stdout).trim()}`);
    return JSON.parse(run.stdout) as T;
  };
  const dirty = (): string => gitOut(["status", "--porcelain"]);

  let sha: string | undefined;
  try {
    // 1. What is being landed.
    const branch = gitOut(["rev-parse", "--abbrev-ref", "HEAD"]);
    if (branch === "HEAD") throw new Refusal("HEAD is detached: land a branch");
    if (branch === "main") throw new Refusal("you are on main: land a branch off it");
    if (!BRANCH.test(branch)) throw new Refusal(`${branch} is not a <gate>/<topic> branch, such as g2/axe-scan; work the owner must see first stays on its branch`);
    if (dirty()) throw new Refusal(`the tree is not clean; commit or remove these first:\n${dirty()}`);
    sha = gitOut(["rev-parse", "HEAD"]);
    const gitDir = gitOut(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    if (git(["config", "core.hooksPath"]).stdout.trim() !== ".githooks") {
      gitOut(["config", "core.hooksPath", ".githooks"]);
      log("land: git now runs the repository's hooks from .githooks");
    }
    gitOut(["fetch", "--quiet", "origin", "main"]);
    if (!isAncestor("origin/main", sha)) throw new Refusal(`${branch} is not on top of origin/main: rebase it onto main, then land again`);
    log(`land: ${branch} at ${sha.slice(0, 7)}, on top of origin/main`);

    // 2. The gate, read from its own exit status: no pipe stands between them.
    log("land: npm run check:gate");
    const npmCli = process.env.npm_execpath;
    const gate = npmCli
      ? spawnSync(process.execPath, [npmCli, "run", "check:gate"], { cwd: root, stdio })
      : spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "check:gate"], { cwd: root, stdio, shell: process.platform === "win32" });
    if (gate.status !== 0) throw new Refusal(`check:gate failed (exit ${String(gate.status ?? gate.signal)}); nothing was pushed`);
    if (gitOut(["rev-parse", "HEAD"]) !== sha || dirty()) throw new Refusal("check:gate changed the tree or HEAD; nothing was pushed");
    const record: LandRecord = { sha, branch, gate: { status: "passed", at: new Date().toISOString() } };
    writeRecord(gitDir, record);
    log(`land: check:gate passed on ${sha.slice(0, 7)}`);

    // 3. CI, on this exact commit.
    gitOut(["push", "--quiet", "--force-with-lease", "origin", `HEAD:refs/heads/${branch}`]);
    log(`land: pushed ${branch}; waiting for CI's run on ${sha.slice(0, 7)}`);
    const list = ["run", "list", "--commit", sha, "--branch", branch, "--event", "push", "--workflow", "check-gate.yml", "--json", "databaseId,headSha,status,conclusion,url", "--limit", "5"];
    const pushed = sha;
    const findRun = (): Run | undefined => ghJson<Run[]>(list).find((candidate) => candidate.headSha === pushed);
    const started = Date.now();
    let run = findRun();
    while (!run) {
      if (Date.now() - started > findTimeoutMs) throw new Refusal(`CI started no run for ${sha.slice(0, 7)} within ${String(findTimeoutMs / 1000)} s; main was not moved`);
      await sleep(findIntervalMs);
      run = findRun();
    }
    log(`land: watching ${run.url}`);
    const watch = spawnSync(ghCommand, [...ghPrefix, "run", "watch", String(run.databaseId), "--exit-status", "--compact", "--interval", "30"], { cwd: root, stdio });
    const done = ghJson<Run>(["run", "view", String(run.databaseId), "--json", "databaseId,headSha,status,conclusion,url"]);
    if (watch.status !== 0 || done.status !== "completed" || done.conclusion !== "success" || done.headSha !== sha) {
      throw new Refusal(`CI's run ${done.url} on ${sha.slice(0, 7)} did not succeed (${done.status}, ${done.conclusion || "no conclusion"}); main was not moved`);
    }
    writeRecord(gitDir, { ...record, ci: { status: "success", runId: done.databaseId, url: done.url, at: new Date().toISOString() } });
    log(`land: CI passed on ${sha.slice(0, 7)}`);

    // 4. Main, fast-forward only: origin's first, then the local one.
    gitOut(["fetch", "--quiet", "origin", "main"]);
    if (!isAncestor("origin/main", sha)) throw new Refusal(`origin/main moved while CI ran: rebase ${branch} onto it, then land again`);
    gitOut(["push", "--quiet", "origin", `${sha}:refs/heads/main`]);
    log(`land: origin's main is at ${sha.slice(0, 7)}`);
    // Landed. What follows only tidies up, so a failure here is a warning, never a refusal.
    const warnings: string[] = [];
    const tidy = (args: string[], what: string): boolean => {
      const step = git(args);
      if (step.status !== 0) warnings.push(`${what} failed: ${(step.stderr || step.stdout).trim()}`);
      return step.status === 0;
    };
    if (tidy(["checkout", "--quiet", "main"], "switching to main") && tidy(["merge", "--quiet", "--ff-only", sha], "fast-forwarding the local main")) {
      tidy(["branch", "--quiet", "-d", branch], `deleting ${branch}`);
    }
    tidy(["push", "--quiet", "origin", "--delete", branch], `deleting origin's ${branch}`);
    for (const warning of warnings) log(`land: warning: ${warning}`);
    if (warnings.length === 0) log(`land: the local main is at ${sha.slice(0, 7)} too; ${branch} is deleted`);
    return { landed: true, sha, runUrl: done.url, ...(warnings.length > 0 ? { warnings } : {}) };
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    return { landed: false, reason: error.message, ...(sha ? { sha } : {}) };
  }
}
