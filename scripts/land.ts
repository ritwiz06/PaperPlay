/**
 * npm run land
 *
 * Lands the current branch on main: a clean tree, check:gate passing, the branch pushed and
 * CI green on that exact commit, then main fast-forwarded and pushed (ADR-0009). It takes
 * no options, so nothing can skip a step. Exits 1 when it refuses, saying why.
 */
import { join } from "node:path";
import { land } from "./land/land.ts";

const result = await land({ root: join(import.meta.dirname, "..") });
if (!result.landed) {
  console.error(`\nland refused: ${result.reason ?? "unknown reason"}`);
  process.exit(1);
}
console.log(`\nlanded ${result.sha ?? ""} on main; CI: ${result.runUrl ?? ""}`);
for (const warning of result.warnings ?? []) console.warn(`warning: ${warning}`);
