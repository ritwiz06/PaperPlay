import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pushRefusals, readRecord, writeRecord } from "../land/guard.ts";
import { land, type LandOptions } from "../land/land.ts";

// Land and the pre-push hook (ADR-0009), each run against a throwaway repository with a bare
// remote. The repository carries the real hook and a planted check:gate; a stand-in for the
// GitHub CLI reports whatever CI result a test sets.
const root = join(import.meta.dirname, "..", "..");
const CARRIED = [".githooks/pre-push", "scripts/hooks/pre-push.ts", "scripts/land/guard.ts"];

interface Sandbox {
  work: string;
  remote: string;
  gitDir: string;
  ci: (state: { started: boolean; conclusion?: string; headSha?: string }) => void;
  ghCalls: () => string[];
  options: (extra?: Partial<LandOptions>) => LandOptions;
}

const run = (cwd: string, command: string, args: string[]): { status: number | null; out: string } => {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
};
const git = (cwd: string, ...args: string[]): string => {
  const result = run(cwd, "git", args);
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.out}`);
  return result.out.trim();
};
const tryGit = (cwd: string, ...args: string[]): { status: number | null; out: string } => run(cwd, "git", args);
const remoteHas = (sandbox: Sandbox, ref: string): string | undefined => {
  const result = tryGit(sandbox.remote, "rev-parse", "--verify", "--quiet", ref);
  return result.status === 0 ? result.out.trim() : undefined;
};

const FAKE_GH = `import { appendFileSync, readFileSync } from "node:fs";
const here = new URL(".", import.meta.url);
const ci = JSON.parse(readFileSync(new URL("ci.json", here), "utf8"));
const args = process.argv.slice(2);
appendFileSync(new URL("gh.log", here), args.join(" ") + "\\n");
const found = { databaseId: 7, headSha: ci.headSha, status: "completed", conclusion: ci.conclusion, url: "https://ci.test/runs/7" };
if (args[0] === "run" && args[1] === "list") process.stdout.write(JSON.stringify(ci.started ? [found] : []));
else if (args[0] === "run" && args[1] === "watch") process.exit(ci.conclusion === "success" ? 0 : 1);
else if (args[0] === "run" && args[1] === "view") process.stdout.write(JSON.stringify(found));
else process.exit(2);
`;

function sandbox(gate: string): Sandbox {
  const base = mkdtempSync(join(tmpdir(), "paperplay-land-"));
  const remote = join(base, "remote.git");
  const work = join(base, "work");
  const tools = join(base, "tools");
  mkdirSync(work);
  mkdirSync(tools);
  git(base, "init", "--quiet", "--bare", "-b", "main", remote);
  git(work, "init", "--quiet", "-b", "main");
  git(work, "config", "user.email", "land@test.invalid");
  git(work, "config", "user.name", "Land test");
  for (const path of CARRIED) {
    mkdirSync(dirname(join(work, path)), { recursive: true });
    copyFileSync(join(root, path), join(work, path));
  }
  chmodSync(join(work, ".githooks/pre-push"), 0o755);
  writeFileSync(join(work, "package.json"), JSON.stringify({ name: "land-sandbox", private: true, type: "module", scripts: { "check:gate": "node gate.mjs" } }));
  writeFileSync(join(work, "gate.mjs"), gate);
  writeFileSync(join(work, "notes.txt"), "one\n");
  git(work, "add", "-A");
  git(work, "update-index", "--chmod=+x", ".githooks/pre-push");
  git(work, "commit", "--quiet", "-m", "start");
  git(work, "remote", "add", "origin", remote);
  git(work, "push", "--quiet", "origin", "main");
  git(work, "config", "core.hooksPath", ".githooks");
  git(work, "switch", "--quiet", "-c", "g2/topic");
  writeFileSync(join(work, "notes.txt"), "one\ntwo\n");
  git(work, "commit", "--quiet", "-am", "a change");
  writeFileSync(join(tools, "gh.mjs"), FAKE_GH);
  const self: Sandbox = {
    work,
    remote,
    gitDir: join(work, ".git"),
    ci: (state) => writeFileSync(join(tools, "ci.json"), JSON.stringify({ headSha: git(work, "rev-parse", "HEAD"), ...state })),
    ghCalls: () => (existsSync(join(tools, "gh.log")) ? readFileSync(join(tools, "gh.log"), "utf8").trim().split("\n") : []),
    options: (extra) => ({ root: work, gh: [process.execPath, join(tools, "gh.mjs")], quiet: true, log: () => undefined, findTimeoutMs: 200, findIntervalMs: 20, ...extra }),
  };
  self.ci({ started: true, conclusion: "success" });
  return self;
}

const PASSING = "process.exit(0);\n";
const FAILING = "console.error('a planted failure'); process.exit(1);\n";

describe("npm run land refuses", () => {
  let box: Sandbox;
  let start: string;
  beforeEach(() => {
    box = sandbox(PASSING);
    start = git(box.remote, "rev-parse", "main");
  });
  afterEach(() => rmSync(dirname(box.work), { recursive: true, force: true }));

  const nothingMoved = (): void => {
    expect(remoteHas(box, "main")).toBe(start);
    expect(git(box.work, "rev-parse", "main")).toBe(start);
  };

  it("a dirty tree, before running the gate or pushing", async () => {
    writeFileSync(join(box.work, "notes.txt"), "uncommitted\n");
    expect((await land(box.options())).reason).toMatch(/the tree is not clean/);
    git(box.work, "checkout", "--", "notes.txt");
    writeFileSync(join(box.work, "stray.txt"), "untracked\n");
    expect((await land(box.options())).reason).toMatch(/not clean[\s\S]*stray\.txt/);
    expect(remoteHas(box, "g2/topic")).toBeUndefined();
    expect(box.ghCalls()).toEqual([]);
    nothingMoved();
  });

  it("main itself, a detached HEAD, and a branch not named <gate>/<topic>", async () => {
    git(box.work, "switch", "--quiet", "main");
    expect((await land(box.options())).reason).toMatch(/you are on main/);
    git(box.work, "switch", "--quiet", "--detach", "g2/topic");
    expect((await land(box.options())).reason).toMatch(/HEAD is detached/);
    git(box.work, "switch", "--quiet", "-c", "spike/look");
    expect((await land(box.options())).reason).toMatch(/spike\/look is not a <gate>\/<topic> branch/);
    nothingMoved();
  });

  it("a branch that is not on top of origin's main", async () => {
    git(box.work, "switch", "--quiet", "main");
    writeFileSync(join(box.work, "other.txt"), "elsewhere\n");
    git(box.work, "add", "other.txt");
    git(box.work, "commit", "--quiet", "-m", "main moved");
    git(box.work, "push", "--quiet", "--no-verify", "origin", "main");
    start = git(box.work, "rev-parse", "main");
    git(box.work, "switch", "--quiet", "g2/topic");
    expect((await land(box.options())).reason).toMatch(/not on top of origin\/main: rebase it onto main/);
    expect(remoteHas(box, "g2/topic")).toBeUndefined();
    nothingMoved();
  });

  it("a planted failing gate: nothing is pushed and nothing is recorded", async () => {
    writeFileSync(join(box.work, "gate.mjs"), FAILING);
    git(box.work, "commit", "--quiet", "-am", "plant a failing gate");
    const sha = git(box.work, "rev-parse", "HEAD");
    expect(await land(box.options())).toEqual({ landed: false, reason: "check:gate failed (exit 1); nothing was pushed", sha });
    expect(remoteHas(box, "g2/topic")).toBeUndefined();
    expect(readRecord(box.gitDir, sha)).toBeUndefined();
    expect(box.ghCalls()).toEqual([]);
    nothingMoved();
  });

  it("a gate that changes the tree", async () => {
    writeFileSync(join(box.work, "gate.mjs"), "import { appendFileSync } from 'node:fs'; appendFileSync('notes.txt', 'rewritten\\n');\n");
    git(box.work, "commit", "--quiet", "-am", "a gate that writes");
    expect((await land(box.options())).reason).toBe("check:gate changed the tree or HEAD; nothing was pushed");
    expect(remoteHas(box, "g2/topic")).toBeUndefined();
    nothingMoved();
  });

  it("red CI: the branch is pushed, main is not moved, and the hook refuses main by hand", async () => {
    box.ci({ started: true, conclusion: "failure" });
    const sha = git(box.work, "rev-parse", "HEAD");
    const result = await land(box.options());
    expect(result.reason).toBe(`CI's run https://ci.test/runs/7 on ${sha.slice(0, 7)} did not succeed (completed, failure); main was not moved`);
    expect(remoteHas(box, "g2/topic")).toBe(sha);
    expect(readRecord(box.gitDir, sha)?.gate.status).toBe("passed");
    expect(readRecord(box.gitDir, sha)?.ci).toBeUndefined();
    nothingMoved();
    const byHand = tryGit(box.work, "push", "origin", "HEAD:refs/heads/main");
    expect(byHand.status).not.toBe(0);
    expect(byHand.out).toContain(`${sha.slice(0, 7)}: land has no green CI run for it`);
    nothingMoved();
  });

  it("a CI run on another commit, which is never taken for this one", async () => {
    box.ci({ started: true, conclusion: "success", headSha: "f".repeat(40) });
    expect((await land(box.options())).reason).toMatch(/CI started no run for [0-9a-f]{7} within 0\.2 s; main was not moved/);
    nothingMoved();
  });

  it("when CI starts no run at all", async () => {
    box.ci({ started: false });
    expect((await land(box.options())).reason).toMatch(/CI started no run/);
    nothingMoved();
  });
});

describe("npm run land", () => {
  let box: Sandbox;
  beforeEach(() => {
    box = sandbox(PASSING);
  });
  afterEach(() => rmSync(dirname(box.work), { recursive: true, force: true }));

  it("on a passing gate and green CI, fast-forwards main on origin and locally, and deletes the branch", async () => {
    const sha = git(box.work, "rev-parse", "HEAD");
    expect(await land(box.options())).toEqual({ landed: true, sha, runUrl: "https://ci.test/runs/7" });
    expect(remoteHas(box, "main")).toBe(sha);
    expect(git(box.work, "rev-parse", "main")).toBe(sha);
    expect(git(box.work, "rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
    expect(tryGit(box.work, "rev-parse", "--verify", "--quiet", "g2/topic").status).not.toBe(0);
    expect(remoteHas(box, "g2/topic")).toBeUndefined();
    expect(readRecord(box.gitDir, sha)).toMatchObject({ sha, branch: "g2/topic", gate: { status: "passed" }, ci: { status: "success", runId: 7 } });
    expect(box.ghCalls()[0]).toMatch(new RegExp(`^run list --commit ${sha} --branch g2/topic --event push`));
    expect(box.ghCalls()).toContain("run watch 7 --exit-status --compact --interval 30");
  });

  it("still reports the land when tidying up locally fails, once origin's main has moved", async () => {
    const sha = git(box.work, "rev-parse", "HEAD");
    // main is checked out in another worktree, so this one cannot switch to it.
    git(box.work, "worktree", "add", "--quiet", join(dirname(box.work), "elsewhere"), "main");
    const result = await land(box.options());
    expect(result).toMatchObject({ landed: true, sha });
    expect(result.warnings?.[0]).toMatch(/^switching to main failed/);
    expect(remoteHas(box, "main")).toBe(sha);
  });

  it("sets git to run the repository's hooks when they are not set", async () => {
    git(box.work, "config", "--unset", "core.hooksPath");
    expect((await land(box.options())).landed).toBe(true);
    expect(git(box.work, "config", "core.hooksPath")).toBe(".githooks");
  });
});

describe("the pre-push hook", () => {
  let box: Sandbox;
  beforeEach(() => {
    box = sandbox(PASSING);
  });
  afterEach(() => rmSync(dirname(box.work), { recursive: true, force: true }));

  it("refuses moving main to a commit land never recorded, and deleting main", () => {
    const sha = git(box.work, "rev-parse", "HEAD");
    const push = tryGit(box.work, "push", "origin", "HEAD:refs/heads/main");
    expect(push.status).not.toBe(0);
    expect(push.out).toContain(`${sha.slice(0, 7)} was not landed: main moves only through npm run land`);
    const remove = tryGit(box.work, "push", "origin", "--delete", "main");
    expect(remove.status).not.toBe(0);
    expect(remove.out).toContain("deleting main is refused");
  });

  it("lets every other branch push, and main move to a commit recorded gate-passed and CI-green", () => {
    expect(tryGit(box.work, "push", "origin", "g2/topic").status).toBe(0);
    const sha = git(box.work, "rev-parse", "HEAD");
    writeRecord(box.gitDir, { sha, branch: "g2/topic", gate: { status: "passed", at: "now" } });
    expect(tryGit(box.work, "push", "origin", "HEAD:refs/heads/main").status).not.toBe(0);
    writeRecord(box.gitDir, { sha, branch: "g2/topic", gate: { status: "passed", at: "now" }, ci: { status: "success", runId: 1, url: "u", at: "now" } });
    expect(tryGit(box.work, "push", "origin", "HEAD:refs/heads/main").status).toBe(0);
    expect(remoteHas(box, "main")).toBe(sha);
  });

  it("reads git's ref lines, checking only those that move main", () => {
    const zero = "0".repeat(40);
    const gitDir = mkdtempSync(join(tmpdir(), "paperplay-guard-"));
    expect(pushRefusals(`refs/heads/g2/x ${"a".repeat(40)} refs/heads/g2/x ${zero}\n`, gitDir)).toEqual([]);
    expect(pushRefusals(`refs/tags/v1 ${"a".repeat(40)} refs/tags/v1 ${zero}\n`, gitDir)).toEqual([]);
    expect(pushRefusals(`refs/heads/main ${"b".repeat(40)} refs/heads/main ${"b".repeat(40)}\n`, gitDir)).toEqual([]);
    expect(pushRefusals(`(delete) ${zero} refs/heads/main ${"b".repeat(40)}\n`, gitDir)).toEqual(["deleting main is refused"]);
    expect(pushRefusals(`HEAD ${"c".repeat(40)} refs/heads/main ${"b".repeat(40)}\n`, gitDir)).toEqual(["ccccccc was not landed: main moves only through npm run land"]);
    rmSync(gitDir, { recursive: true, force: true });
  });
});

describe("the guard is wired into the repository", () => {
  it("npm run land and the prepare script that installs the hooks exist, and the hook is executable", () => {
    const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
    expect(scripts.land).toBe("node scripts/land.ts");
    expect(scripts.prepare).toBe("node scripts/hooks/install.ts");
    expect(git(root, "ls-files", "--stage", ".githooks/pre-push")).toMatch(/^100755 /);
  });
});
