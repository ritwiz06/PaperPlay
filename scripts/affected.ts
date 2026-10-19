/**
 * npm run test:affected [-- --base <ref>] [-- --dry]
 *
 * The tests a change touches, for while developing (ADR-0051): Vitest's tests related to every file
 * changed since the base (origin/main by default), committed or not, through its module graph; and
 * the Playwright specs for the routes those files serve. A file of the shared shell, or one the map
 * below does not place, runs every spec, so a gap in the map costs time, never a missed test. The
 * whole gate runs only inside `npm run land`.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const at = process.argv.indexOf("--base");
const base = at >= 0 ? (process.argv[at + 1] ?? "origin/main") : "origin/main";
const dry = process.argv.includes("--dry");

const git = (args: string[]): string[] =>
  spawnSync("git", args, { cwd: root, encoding: "utf8" })
    .stdout.split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
const changed = [...new Set([...git(["diff", "--name-only", `${base}...HEAD`]), ...git(["status", "--porcelain"]).map((line) => line.slice(3).split(" -> ").at(-1) ?? "")])].filter(Boolean);
const SPECS = readdirSync(join(root, "tests", "e2e")).filter((name) => name.endsWith(".spec.ts"));

/** Each route's world or page, by the paths that build it, and the specs that visit it. */
const ROUTES: readonly { readonly paths: RegExp; readonly specs: readonly string[] }[] = [
  { paths: /^apps\/web\/src\/library\/|^apps\/web\/public\/library\/|^scripts\/library/, specs: ["library.spec.ts"] },
  { paths: /^apps\/web\/src\/create\/|^apps\/api\//, specs: ["create.spec.ts"] },
  { paths: /^apps\/web\/src\/worlds\/(GeneratedWorld|town-world)|^fixtures\/worldspecs\/(generated|retired)\//, specs: ["create.spec.ts", "own-numbers.spec.ts", "library.spec.ts"] },
  { paths: /momentum|landscape|^packages\/primitives\/src\/learning\/|sutskever/, specs: ["momentum.spec.ts", "library.spec.ts"] },
  { paths: /epidemic|kits\/town\/|^apps\/web\/src\/world\/town|^packages\/primitives\/src\/compartments\/|kermack/, specs: ["town.spec.ts", "create.spec.ts", "own-numbers.spec.ts"] },
  { paths: /^apps\/web\/src\/world\/(LocalWorld|local-world|session)|LabBench/, specs: ["world.spec.ts", "smoke.spec.ts", "stage.spec.ts", "accessibility.spec.ts"] },
  {
    paths: /flocking|kits\/valley\/|^apps\/web\/src\/world\/(valley|fork|authored-world)|^packages\/primitives\/src\/(agents|spaces)\//,
    specs: ["hook.spec.ts", "levels.spec.ts", "fork.spec.ts", "guided.spec.ts", "predictions.spec.ts", "rocks.spec.ts", "context.spec.ts", "accessibility.spec.ts"],
  },
];
/** Paths no browser test reads: changing them runs no spec. */
const NO_BROWSER = /^package\.json$|^(docs|eval|reference|captures)\/|^scripts\/(?!library|serve-dist)|^packages\/(pipeline|contracts)\/|^fixtures\/(recordings|jobs|sources|papers|oracles|bindings)\/|\.md$|^\.github\/|^apps\/api\/test\//;

const specs = new Set<string>();
for (const file of changed) {
  if (file.startsWith("tests/e2e/") && file.endsWith(".spec.ts")) specs.add(file.slice("tests/e2e/".length));
  else if (NO_BROWSER.test(file) && !ROUTES.some((route) => route.paths.test(file))) continue;
  else {
    const routes = ROUTES.filter((route) => route.paths.test(file));
    // Shared shell or unmapped code a browser loads: every spec.
    if (routes.length === 0) for (const spec of SPECS) specs.add(spec);
    for (const route of routes) for (const spec of route.specs) specs.add(spec);
  }
}

console.log(`test:affected: ${changed.length} files changed since ${base}`);
console.log(`  vitest: tests related to them (vitest run --changed ${base})`);
console.log(`  playwright: ${specs.size === 0 ? "none" : [...specs].sort().join(" ")}`);
if (dry) process.exit(0);
const node = (args: string[]) => spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" }).status ?? 1;
let status = node([join(root, "node_modules", "vitest", "vitest.mjs"), "run", "--changed", base, "--passWithNoTests"]);
if (specs.size > 0) status ||= node([join(root, "node_modules", "@playwright", "test", "cli.js"), "test", ...[...specs].sort().map((spec) => `tests/e2e/${spec}`)]);
process.exit(status);
