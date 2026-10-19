/**
 * Deterministic sweeps, cached by a hash of every input (ADR-0051). A sweep (the level rule over
 * its 20 starts, the bake-off replayed from its recordings) gives the same output whenever its
 * inputs are the same: the primitives', pipeline's and contracts' code, the fixtures, the
 * recordings, the rule's code, the lockfile. `eval/sweeps/cache.json` keeps, for each sweep, the
 * hash of its inputs and the hash of the output it gave.
 *
 * A hit is checked, not skipped: the inputs are hashed afresh from the files, and the committed
 * output the test holds is hashed and must be the one recorded. Only then is the run left out.
 * PAPERPLAY_SWEEP_CACHE=off runs every sweep from scratch (the nightly CI job); =write runs them
 * and records the hashes of those whose output matches (`npm run sweeps:cache`).
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..", "..");
export const CACHE_PATH = join(root, "eval", "sweeps", "cache.json");
const SKIP = new Set(["node_modules", "dist", ".vite", "reports", "test-results"]);

interface Cache {
  readonly schemaVersion: "sweep-cache/1";
  readonly entries: Record<string, { readonly inputs: string; readonly output: string }>;
}

const sha256 = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex");

function files(path: string): string[] {
  const full = join(root, path);
  if (!existsSync(full)) throw new Error(`a sweep's input ${path} does not exist`);
  if (statSync(full).isFile()) return [path];
  return readdirSync(full)
    .filter((name) => !SKIP.has(name) && !name.endsWith(".tsbuildinfo"))
    .flatMap((name) => files(relative(root, join(full, name))));
}

/** The hash of every file under the given repository paths: each one's path and bytes, in path order. */
export function inputHash(paths: readonly string[]): string {
  const hash = createHash("sha256");
  for (const file of [...new Set(paths.flatMap(files))].sort()) hash.update(`${file}\0`).update(readFileSync(join(root, file))).update("\0");
  return hash.digest("hex");
}

const readCache = (): Cache => (existsSync(CACHE_PATH) ? (JSON.parse(readFileSync(CACHE_PATH, "utf8")) as Cache) : { schemaVersion: "sweep-cache/1", entries: {} });

export type SweepMode = "use" | "off" | "write";
export const sweepMode = (): SweepMode => {
  const mode = process.env["PAPERPLAY_SWEEP_CACHE"];
  return mode === "off" || mode === "write" ? mode : "use";
};

/**
 * A sweep's output: the committed one, when the cache vouches for these inputs and that output;
 * otherwise the sweep run afresh. The caller compares it with the committed output either way.
 */
export async function sweep(name: string, inputs: readonly string[], expected: string, run: () => string | Promise<string>): Promise<{ readonly output: string; readonly cached: boolean }> {
  const mode = sweepMode();
  const entry = readCache().entries[name];
  if (mode === "use" && entry && entry.inputs === inputHash(inputs) && entry.output === sha256(expected)) return { output: expected, cached: true };
  const output = await run();
  if (mode === "write" && output === expected) {
    const cache = readCache();
    const entries = { ...cache.entries, [name]: { inputs: inputHash(inputs), output: sha256(output) } };
    const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(CACHE_PATH, `${JSON.stringify({ schemaVersion: "sweep-cache/1", entries: sorted }, null, 2)}\n`);
  }
  return { output, cached: false };
}

/** The inputs every sweep shares: the code the primitives, pipeline and contracts run, and the lockfile. */
export const CODE = ["packages/primitives/src", "packages/pipeline/src", "packages/contracts/src", "package-lock.json"] as const;
