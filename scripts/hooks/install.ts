/**
 * Run by npm on install (the prepare script): git runs the repository's own hooks from
 * .githooks, so the pre-push guard on main is in place in every checkout (ADR-0009). Outside
 * a git checkout, such as a deploy's build, there is nothing to guard.
 */
import { spawnSync } from "node:child_process";

const root = import.meta.dirname;
if (spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root, stdio: "ignore" }).status === 0) {
  const set = spawnSync("git", ["config", "core.hooksPath", ".githooks"], { cwd: root, stdio: "inherit" });
  process.exit(set.status ?? 1);
}
