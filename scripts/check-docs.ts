/**
 * npm run check:docs (also run by check:gate)
 *
 * Checks that the documentation system is complete and consistent with the repository:
 * required docs and headings, status.md against the newest session log and git, every
 * app and package named in architecture.md, concept paths, and progress.md's newest
 * commits. The rules live in scripts/docs/check.ts.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { checkDocs, type RepoView } from "./docs/check.ts";

const root = join(import.meta.dirname, "..");
const at = (path: string): string => join(root, path);

const repo: RepoView = {
  read: (path) => (existsSync(at(path)) ? readFileSync(at(path), "utf8") : undefined),
  exists: (path) => existsSync(at(path)),
  list: (dir) => (existsSync(at(dir)) ? readdirSync(at(dir)) : []),
  isDirectory: (path) => existsSync(at(path)) && statSync(at(path)).isDirectory(),
  commitExists: (sha) => spawnSync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd: root, stdio: "ignore" }).status === 0,
  isCurrent: (sha) => {
    const git = (args: string[]) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
    const full = git(["rev-parse", "--verify", "--quiet", `${sha}^{commit}`]).stdout.trim();
    // Main's tip, as origin knows it, or the local main where there is no origin (a fresh clone in CI has it).
    const main = (git(["rev-parse", "--verify", "--quiet", "origin/main"]).stdout || git(["rev-parse", "--verify", "--quiet", "main"]).stdout).trim();
    if (!full || !main) return false;
    if (full === main) return true;
    // On the current branch: reachable from HEAD, and not already in main.
    return git(["merge-base", "--is-ancestor", full, "HEAD"]).status === 0 && git(["merge-base", "--is-ancestor", full, main]).status !== 0;
  },
};

const problems = checkDocs(repo);
if (problems.length === 0) {
  console.log("check:docs: the documentation is complete and consistent with the repository.");
  process.exit(0);
}
console.log(`check:docs: ${problems.length} problem(s)`);
for (const problem of problems) console.log(`  - ${problem}`);
process.exit(1);
