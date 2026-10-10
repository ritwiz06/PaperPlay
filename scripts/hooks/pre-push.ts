/**
 * The pre-push hook, run by .githooks/pre-push. Git passes the refs being pushed on standard
 * input; a push that would move or delete main is refused unless `npm run land` recorded the
 * commit as gate-passed and CI-green (ADR-0009).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pushRefusals } from "../land/guard.ts";

const gitDir = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).trim();
const refusals = pushRefusals(readFileSync(0, "utf8"), gitDir);
if (refusals.length > 0) {
  console.error("pre-push: refused (ADR-0009)");
  for (const refusal of refusals) console.error(`  - ${refusal}`);
  process.exit(1);
}
