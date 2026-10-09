import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RULE_HOLDS, RULE_SEEDS } from "@paperplay/contracts";
import { describe, expect, it } from "vitest";

// The level rule (ADR-0018), re-run: every level's stated effect against skies 1 to 20. The
// sweep runs in its own Node process, where the primitive runs at full speed; under Vitest's
// module transform it runs about 2.4 times slower. It exits non-zero if any level fails.
const root = join(import.meta.dirname, "..", "..");
const record = readFileSync(join(root, "eval", "sweeps", "levels.md"), "utf8");
const results = (): string[][] =>
  record
    .split("\n")
    .filter((line) => /^\| \d · /.test(line))
    .map((line) => line.split(" | "));

describe("[R06] the levels sweep (ADR-0018)", () => {
  it("re-runs on skies 1 to 20, finds every level meeting the rule, and matches eval/sweeps/levels.md byte for byte", () => {
    const fresh = execFileSync(process.execPath, [join(root, "scripts", "levels.ts"), "--print"], { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    expect(fresh).toBe(record);
  }, 240_000);

  it("records six levels, each meeting the rule", () => {
    const rows = results();
    expect(rows).toHaveLength(6);
    for (const row of rows) expect(row.at(-1), row[0]).toBe("yes |");
  });

  it("records each claim that holds sky by sky on at least 16 of 20, and level 2's count exactly", () => {
    for (const row of results()) {
      const holds = Number(/^(\d+) of 20$/.exec(row.at(-2) ?? "")?.[1]);
      if (row[0]?.includes("Each bird sees only a little")) expect(holds).toBe(6);
      else expect(holds, row[0]).toBeGreaterThanOrEqual(RULE_HOLDS);
    }
    expect(RULE_SEEDS).toBe(20);
  });
});
