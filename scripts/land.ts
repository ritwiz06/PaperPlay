/**
 * npm run land
 *
 * Lands the current branch, and every branch stacked under it, on main: a clean tree, check:gate
 * passing on the tip in the gate's own checkout, the tip pushed and CI green on that exact commit,
 * then main fast-forwarded and pushed (ADR-0009, ADR-0051). The gate's checkout is the sibling
 * folder `<repository>-land`, kept between lands with its dependencies, so work goes on here while
 * the gate and CI run. It takes no options, so nothing can skip a step. Exits 1 when it refuses.
 */
import { basename, dirname, join } from "node:path";
import { land } from "./land/land.ts";

const root = join(import.meta.dirname, "..");
const result = await land({ root, checkout: join(dirname(root), `${basename(root)}-land`) });
if (!result.landed) {
  console.error(`\nland refused: ${result.reason ?? "unknown reason"}`);
  process.exit(1);
}
console.log(`\nlanded ${result.sha ?? ""} on main; CI: ${result.runUrl ?? ""}`);
for (const warning of result.warnings ?? []) console.warn(`warning: ${warning}`);
