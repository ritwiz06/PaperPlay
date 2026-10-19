import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// CI's minutes (ADR-0048): a push to main runs check:gate only when the same commit has not already
// passed on its branch, as npm run land guarantees it has; the capture job runs on demand only.

const workflow = readFileSync(join(import.meta.dirname, "..", "..", ".github", "workflows", "check-gate.yml"), "utf8");
/** A job's block, from its key to the next job's. */
const job = (key: string): string => workflow.split(`\n  ${key}:\n`)[1]?.split(/\n {2}[a-z-]+:\n/)[0] ?? "";

describe("[R03] CI's workflow", () => {
  it("asks, on a push to main only, whether the commit already passed on a branch, reading the Actions API", () => {
    const passed = job("passed");
    expect(passed).toMatch(/if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
    expect(passed).toMatch(/runs\?head_sha=\$\{\{ github\.sha \}\}&status=success/);
    expect(passed).toMatch(/select\(\.head_branch != "main"\)/);
    expect(workflow).toMatch(/permissions:\n {2}contents: read\n {2}actions: read\n/);
  });

  it("runs the gate on every branch push and pull request, and on main unless the branch run passed", () => {
    const gate = job("gate");
    expect(gate).toMatch(/needs: passed/);
    expect(gate).toMatch(/if: always\(\) && github\.event_name != 'schedule' && needs\.passed\.outputs\.passed != 'true'/);
    expect(gate).toMatch(/run: npm run check:gate/);
  });

  it("runs nothing for a pushed tag, and restores node_modules and the browsers from the cache by the lockfile (ADR-0051)", () => {
    expect(workflow).toMatch(/\non:\n {2}push:\n {4}branches: \["\*\*"\]\n/);
    const gate = job("gate");
    expect(gate).toMatch(/key: modules-\$\{\{ runner\.os \}\}-\$\{\{ hashFiles\('\.node-version'\) \}\}-\$\{\{ hashFiles\('package-lock\.json'\) \}\}/);
    expect(gate).toMatch(/- if: steps\.modules\.outputs\.cache-hit != 'true'\n {8}run: npm ci/);
    expect(gate).toMatch(/path: ~\/\.cache\/ms-playwright/);
  });

  it("each night, if main moved, runs the cached sweeps from scratch, and never the gate", () => {
    expect(workflow).toMatch(/schedule:\n {4}- cron: "17 9 \* \* \*"/);
    const sweeps = job("sweeps");
    expect(sweeps).toMatch(/if: github\.event_name == 'schedule'/);
    expect(sweeps).toMatch(/run: npx vitest run scripts\/test\/levels\.test\.ts scripts\/test\/bakeoff\.test\.ts\n {8}env:\n {10}PAPERPLAY_SWEEP_CACHE: "off"/);
    expect(job("gate")).toMatch(/github\.event_name != 'schedule'/);
  });

  it("runs the capture job on demand only, never on a push", () => {
    expect(job("capture")).toMatch(/\n {4}if: github\.event_name == 'workflow_dispatch'\n/);
    expect(job("capture")).not.toMatch(/refs\/heads\/main/);
  });
});
