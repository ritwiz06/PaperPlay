/**
 * Land a branch, or a stack of branches, on main (ADR-0009, and its amendment in ADR-0051): the
 * only routine way main moves.
 *
 * In order, and refusing at the first problem:
 * 0. no live pipeline is running on this machine (ADR-0039);
 * 1. the branch is a `<gate>/<topic>` branch, not main or a detached HEAD, its tree is clean,
 *    and it sits on top of origin's main; the stack is every branch from origin's main up to it,
 *    each a `<gate>/<topic>` branch, the current one its tip;
 * 2. `npm run check:gate` exits 0 on the tip, read from its own exit status, and leaves the tree
 *    as it was; given a checkout of its own, the gate runs there, at the tip, its dependencies
 *    installed only when package-lock.json changed, so work goes on where land was started;
 * 3. the tip alone is pushed, so CI runs once for the stack, and that run on that exact commit is
 *    watched to its end with `gh run watch`;
 * 4. only when that run concluded success: origin's main is fast-forwarded to the tip, then the
 *    local main, and every branch of the stack is deleted. Once origin's main has moved the land
 *    stands; a failure while tidying up locally is reported as a warning.
 *
 * Steps 2 and 3 are written to the land record, which the pre-push hook reads before it lets
 * any push move main.
 */
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { heldLocks, lockDir, whyNoGate } from "../machine/locks.ts";
import { writeRecord, type LandRecord } from "./guard.ts";

export interface LandOptions {
  /** The repository's root. */
  root: string;
  /** The GitHub CLI, as a command and leading arguments. Tests pass a stand-in; the command line never can. */
  gh?: string[];
  /** How long to wait for CI to start a run for the pushed commit, and how often to ask. */
  findTimeoutMs?: number;
  findIntervalMs?: number;
  /**
   * A checkout of its own for the gate, kept between lands: created as a worktree when missing, set
   * to the tip each time. Without it the gate runs in `root`, as tests do.
   */
  checkout?: string;
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
  const npm = (args: string[], cwd: string): SpawnSyncReturns<Buffer> => {
    const npmCli = process.env.npm_execpath;
    return npmCli ? spawnSync(process.execPath, [npmCli, ...args], { cwd, stdio }) : spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args, { cwd, stdio, shell: process.platform === "win32" });
  };
  /** The worktree a branch is checked out in, if any. */
  const worktreeOf = (name: string): string | undefined => {
    let path: string | undefined;
    for (const line of gitOut(["worktree", "list", "--porcelain"]).split("\n")) {
      if (line.startsWith("worktree ")) path = line.slice("worktree ".length);
      if (line === `branch refs/heads/${name}`) return path;
    }
    return undefined;
  };
  /**
   * The gate's own checkout at the tip: a worktree of this repository, created when missing, its
   * untracked files cleared but its ignored ones, node_modules among them, kept; dependencies
   * installed only when package-lock.json differs from the one they were installed from; the API's
   * .env linked, so the bundle's secret check knows the key's value, which stays in one file.
   */
  const prepareCheckout = (dir: string, at: string): string => {
    if (!existsSync(dir)) gitOut(["worktree", "add", "--quiet", "--detach", dir, at]);
    const common = (path: string): string => realpathSync(gitOut(["-C", path, "rev-parse", "--path-format=absolute", "--git-common-dir"]));
    if (common(dir) !== common(root)) throw new Refusal(`${dir} is not a checkout of this repository`);
    gitOut(["-C", dir, "checkout", "--quiet", "--force", "--detach", at]);
    gitOut(["-C", dir, "clean", "--quiet", "-fd"]);
    const env = join(root, "apps", "api", ".env");
    if (existsSync(env) && existsSync(join(dir, "apps", "api")) && !existsSync(join(dir, "apps", "api", ".env"))) symlinkSync(env, join(dir, "apps", "api", ".env"));
    const lock = join(dir, "package-lock.json");
    if (existsSync(lock)) {
      const hash = createHash("sha256").update(readFileSync(lock)).digest("hex");
      const stamp = join(dir, "node_modules", ".paperplay-lock-sha256");
      if (existsSync(stamp) && readFileSync(stamp, "utf8").trim() === hash) log("land: the gate's checkout keeps its dependencies; package-lock.json is unchanged");
      else {
        log("land: npm ci in the gate's checkout, as package-lock.json changed");
        const install = npm(["ci"], dir);
        if (install.status !== 0) throw new Refusal(`npm ci failed in ${dir} (exit ${String(install.status ?? install.signal)}); nothing was pushed`);
        writeFileSync(stamp, `${hash}\n`);
      }
    }
    return dir;
  };

  let sha: string | undefined;
  try {
    // 0. Live jobs and gates never share the machine (ADR-0039): nothing runs while a live pipeline does.
    const refusal = whyNoGate(heldLocks(lockDir(root), "live"));
    if (refusal !== null) throw new Refusal(refusal);

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
    // The stack: the branches whose tips lie between origin's main and this one, oldest first.
    const commits = gitOut(["rev-list", "--reverse", "origin/main..HEAD"]).split("\n").filter(Boolean);
    const heads = gitOut(["for-each-ref", "--format=%(refname:short) %(objectname)", "refs/heads"])
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split(" ") as [string, string])
      .filter(([name, at]) => name !== "main" && commits.includes(at));
    const stack = [...heads.filter(([name]) => name !== branch).sort((a, b) => commits.indexOf(a[1]) - commits.indexOf(b[1])).map(([name]) => name), branch];
    const strays = stack.filter((name) => !BRANCH.test(name));
    if (strays.length > 0) throw new Refusal(`the stack holds ${strays.join(", ")}, not a <gate>/<topic> branch; move it off the stack or rename it`);
    log(stack.length > 1 ? `land: the stack ${stack.join(" < ")}, tip ${sha.slice(0, 7)}, on top of origin/main` : `land: ${branch} at ${sha.slice(0, 7)}, on top of origin/main`);

    // 2. The gate, read from its own exit status: no pipe stands between them.
    const where = options.checkout ? prepareCheckout(resolve(options.checkout), sha) : root;
    log(`land: npm run check:gate${where === root ? "" : ` in ${where}`}`);
    const gate = npm(["run", "check:gate"], where);
    if (gate.status !== 0) throw new Refusal(`check:gate failed (exit ${String(gate.status ?? gate.signal)}); nothing was pushed`);
    const gateGit = (args: string[]): string => gitOut(["-C", where, ...args]);
    if (gateGit(["rev-parse", "HEAD"]) !== sha || gateGit(["status", "--porcelain"])) throw new Refusal("check:gate changed the tree or HEAD; nothing was pushed");
    const record: LandRecord = { sha, branch, ...(stack.length > 1 ? { stack } : {}), gate: { status: "passed", at: new Date().toISOString() } };
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
    // The local main, where it is checked out or as a ref; this checkout moves to main only if it
    // is still on the tip: work begun on another branch while CI ran is left where it is.
    const mainAt = worktreeOf("main");
    const here = gitOut(["rev-parse", "--abbrev-ref", "HEAD"]);
    if (mainAt && realpathSync(mainAt) !== realpathSync(gitOut(["rev-parse", "--show-toplevel"]))) {
      tidy(["-C", mainAt, "merge", "--quiet", "--ff-only", sha], `fast-forwarding main in ${mainAt}`);
      if (here === branch) tidy(["checkout", "--quiet", "--detach", sha], "leaving the tip, as main is checked out elsewhere");
    } else if (here === branch) {
      if (tidy(["checkout", "--quiet", "main"], "switching to main")) tidy(["merge", "--quiet", "--ff-only", sha], "fast-forwarding the local main");
    } else tidy(["update-ref", "refs/heads/main", sha], "moving the local main");
    for (const name of stack) tidy(["branch", "--quiet", "-D", name], `deleting ${name}`);
    tidy(["push", "--quiet", "origin", "--delete", branch], `deleting origin's ${branch}`);
    for (const warning of warnings) log(`land: warning: ${warning}`);
    if (warnings.length === 0) log(`land: the local main is at ${sha.slice(0, 7)} too; ${stack.join(", ")} ${stack.length === 1 ? "is" : "are"} deleted`);
    return { landed: true, sha, runUrl: done.url, ...(warnings.length > 0 ? { warnings } : {}) };
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    return { landed: false, reason: error.message, ...(sha ? { sha } : {}) };
  }
}
