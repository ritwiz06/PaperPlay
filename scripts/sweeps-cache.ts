/**
 * npm run sweeps:cache
 *
 * Runs every cached sweep afresh (ADR-0051) and, for each whose output matches the one committed,
 * records the hash of its inputs and of that output in eval/sweeps/cache.json. Run it after a
 * change to a sweep's inputs, and commit the cache with the change; a sweep whose output differs
 * fails its test and records nothing.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const vitest = join(root, "node_modules", "vitest", "vitest.mjs");
const result = spawnSync(process.execPath, [vitest, "run", "scripts/test/levels.test.ts", "scripts/test/bakeoff.test.ts"], { cwd: root, stdio: "inherit", env: { ...process.env, PAPERPLAY_SWEEP_CACHE: "write" } });
process.exit(result.status ?? 1);
