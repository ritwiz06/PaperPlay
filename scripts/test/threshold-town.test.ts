import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Threshold Town is authored in scripts/fixtures/threshold-town.ts (ADR-0029); the fixture the app
// builds is written from it, so the two never drift apart.
const root = join(import.meta.dirname, "..", "..");

describe("[R08] Threshold Town's fixture", () => {
  it("is exactly what its source writes, byte for byte", () => {
    const fresh = execFileSync(process.execPath, [join(root, "scripts", "threshold-town.ts"), "--print"], { cwd: root, encoding: "utf8" });
    expect(fresh).toBe(readFileSync(join(root, "fixtures", "worldspecs", "kermack-mckendrick-1927.json"), "utf8"));
  });
});
