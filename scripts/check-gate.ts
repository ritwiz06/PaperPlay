/**
 * npm run check:gate [-- <gate id>]
 *
 * Runs every npm script the gate requires (a missing script is a failure, never a
 * skip), then reads the reports those runs just wrote and requires passing,
 * non-skipped tests for each of the gate's requirements. Exits non-zero unless all
 * of that holds on the Node version pinned in .node-version.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { evaluateGate, fromPlaywrightReport, fromVitestReport, type TestResult } from "./gate/evidence.ts";
import { reviewProblems } from "./gate/worlds.ts";

interface Gate {
  title: string;
  tag: string;
  scripts: string[];
  requires: string[];
  /** WorldSpecs that must be reviewed, not drafts, for the gate to pass. */
  reviewedWorlds?: string[];
}

interface GatesFile {
  current: string;
  requirements: Record<string, string>;
  gates: Record<string, Gate>;
}

const root = join(import.meta.dirname, "..");
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

const gates = readJson(join(root, "gates.json")) as GatesFile;
const gateId = process.argv[2] ?? gates.current;
const gate = gates.gates[gateId];
if (!gate) {
  console.error(`check:gate: unknown gate "${gateId}". Known gates: ${Object.keys(gates.gates).join(", ")}`);
  process.exit(2);
}

const scripts = (readJson(join(root, "package.json")) as { scripts: Record<string, string> }).scripts;
const reports: Record<string, { file: string; parse: (report: unknown) => TestResult[] }> = {
  test: { file: "reports/vitest.json", parse: fromVitestReport },
  "test:e2e": { file: "reports/playwright.json", parse: fromPlaywrightReport },
};

const problems: string[] = [];
const summary: string[] = [];
const pad = (text: string, width: number): string => text.padEnd(width);

// Evidence counts only when produced on the pinned runtime.
const pinned = readFileSync(join(root, ".node-version"), "utf8").trim();
const runtime = process.versions.node;
if (runtime !== pinned) problems.push(`runtime is Node ${runtime}; .node-version pins ${pinned}`);
summary.push(`  ${pad("runtime", 11)}node ${runtime} (pinned ${pinned})  ${runtime === pinned ? "ok" : "wrong version"}`);

// A stale report must never stand in for this run.
for (const { file } of Object.values(reports)) rmSync(join(root, file), { force: true });

const npmCli = process.env.npm_execpath;
for (const script of gate.scripts) {
  if (!(script in scripts)) {
    problems.push(`required script "${script}" is not defined in package.json`);
    summary.push(`  ${pad(script, 11)}missing`);
    continue;
  }
  console.log(`\n── check:gate ${gateId} · npm run ${script}\n`);
  const started = performance.now();
  const run = npmCli
    ? spawnSync(process.execPath, [npmCli, "run", script], { cwd: root, stdio: "inherit" })
    : spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", script], {
        cwd: root,
        stdio: "inherit",
        shell: process.platform === "win32",
      });
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const ok = run.status === 0;
  if (!ok) problems.push(`npm run ${script} exited with ${String(run.status ?? run.signal)}`);
  summary.push(`  ${pad(script, 11)}${pad(ok ? "ok" : "failed", 8)}${seconds} s`);
}

const results: TestResult[] = [];
for (const script of gate.scripts) {
  const report = reports[script];
  if (!report || !(script in scripts)) continue;
  const path = join(root, report.file);
  if (!existsSync(path)) {
    problems.push(`npm run ${script} left no report at ${report.file}`);
    continue;
  }
  try {
    results.push(...report.parse(readJson(path)));
  } catch (error) {
    problems.push(`${report.file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Worlds the gate requires as reviewed: a draft, or any placeholder anchor, fails it.
for (const path of gate.reviewedWorlds ?? []) {
  const full = join(root, path);
  const found = existsSync(full) ? reviewProblems(path, readJson(full)) : [`${path} does not exist`];
  problems.push(...found);
  summary.push(`  ${pad("world", 11)}${pad(found.length === 0 ? "ok" : "draft", 8)}${path}`);
}

const outcome = evaluateGate({ requires: gate.requires, known: Object.keys(gates.requirements), results });
problems.push(...outcome.problems);

const bySource = (source: TestResult["source"]): number => results.filter((result) => result.source === source).length;
const skipped = results.filter((result) => result.status === "skipped").length;
summary.push(
  `  ${pad("evidence", 11)}${results.length} tests (vitest ${bySource("vitest")}, playwright ${bySource("playwright")}), ${skipped} skipped`,
);
for (const { id, passed, failed } of outcome.evidence) {
  const state = failed > 0 ? `${failed} failing` : passed > 0 ? `${passed} passing` : "no evidence yet";
  summary.push(`    ${id}  ${pad(gates.requirements[id] ?? "unknown requirement", 46)}${state}`);
}

console.log(`\ncheck:gate ${gateId} · ${gate.title} · tag ${gate.tag}`);
console.log(summary.join("\n"));
if (problems.length === 0) {
  console.log(`\n${gateId} passed: every required check ran and every requirement has passing evidence.`);
  process.exit(0);
}
console.log(`\n${gateId} not passed: ${problems.length} problem(s)`);
for (const problem of problems) console.log(`  - ${problem}`);
process.exit(1);
