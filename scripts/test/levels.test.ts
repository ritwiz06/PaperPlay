import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RULE_HOLDS, RULE_SEEDS } from "@paperplay/contracts";
import { describe, expect, it } from "vitest";
import { CODE, sweep } from "../cache/sweeps.ts";

// The level rule (ADR-0018), re-run: every level's stated effect against skies 1 to 20. The
// sweep runs in its own Node process, where the primitive runs at full speed; under Vitest's
// module transform it runs about 2.4 times slower. It exits non-zero if any level fails. Each
// sweep is cached by the hash of its inputs, checked before its committed record is trusted
// (ADR-0051); the nightly run and `PAPERPLAY_SWEEP_CACHE=off` run it from scratch.
const SWEEP_INPUTS = [...CODE, "scripts/levels.ts", "scripts/sweep", "fixtures/worldspecs"];
const root = join(import.meta.dirname, "..", "..");
const record = readFileSync(join(root, "eval", "sweeps", "levels.md"), "utf8");
const results = (): string[][] =>
  record
    .split("\n")
    .filter((line) => /^\| \d · /.test(line))
    .map((line) => line.split(" | "));

describe("[R06] the levels sweep (ADR-0018)", () => {
  it("re-runs on skies 1 to 20, finds every level meeting the rule, and matches eval/sweeps/levels.md byte for byte", async () => {
    const { output } = await sweep("levels-flocking", SWEEP_INPUTS, record, () => execFileSync(process.execPath, [join(root, "scripts", "levels.ts"), "--print"], { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }));
    expect(output).toBe(record);
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

// Threshold Town (ADR-0024, ADR-0028): no chance in the model, so the rule's 20 starts are the
// world's own values and 19 within a tenth of them, and every run is held to the accuracy check.
const town = readFileSync(join(root, "eval", "sweeps", "levels-kermack-mckendrick-1927.md"), "utf8");
const townRows = (heading: string): string[][] =>
  (town.split(`## ${heading}`)[1]?.split("\n## ")[0] ?? "")
    .split("\n")
    .filter((line) => /^\| \d · /.test(line))
    .map((line) => line.split(" | "));

describe("[R06] Threshold Town's levels sweep (ADR-0024)", () => {
  it("re-runs on its 20 starts and matches eval/sweeps/levels-kermack-mckendrick-1927.md byte for byte", async () => {
    const { output } = await sweep("levels-kermack-mckendrick-1927", SWEEP_INPUTS, town, () => execFileSync(process.execPath, [join(root, "scripts", "levels.ts"), "--print", "kermack-mckendrick-1927.json"], { cwd: root, encoding: "utf8" }));
    expect(output).toBe(town);
  }, 120_000);

  it("records five levels, each meeting the rule, and level 4's count of none exactly", () => {
    const rows = townRows("Results");
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.at(-1), row[0]).toBe("yes |");
      const holds = Number(/^(\d+) of 20$/.exec(row.at(-2) ?? "")?.[1]);
      if (row[0]?.includes("Where it starts hardly matters")) expect(holds).toBe(0);
      else expect(holds, row[0]).toBeGreaterThanOrEqual(RULE_HOLDS);
    }
  });

  it("records every level's runs passing the accuracy check, at both steps, on all 20 starts", () => {
    const rows = townRows("The accuracy check");
    expect(rows).toHaveLength(5);
    for (const row of rows) expect(row.at(-1), row[0]).toBe("yes |");
  });
});

// The momentum world (ADR-0047): no chance in the toy, so the rule's 20 starts are the world's own
// settings and starting point and 19 within a tenth of them.
const momentum = readFileSync(join(root, "eval", "sweeps", "levels-sutskever-2013.md"), "utf8");

describe("[R06] the momentum world's levels sweep (ADR-0047)", () => {
  it("re-runs on its 20 starts and matches eval/sweeps/levels-sutskever-2013.md byte for byte", () => {
    const fresh = execFileSync(process.execPath, [join(root, "scripts", "levels.ts"), "--print", "sutskever-2013-momentum.json"], { cwd: root, encoding: "utf8" });
    expect(fresh).toBe(momentum);
  }, 120_000);

  it("records five levels, each holding on at least 16 of 20 starts", () => {
    const rows = (momentum.split("## Results")[1]?.split("\n## ")[0] ?? "").split("\n").filter((line) => /^\| \d · /.test(line)).map((line) => line.split(" | "));
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.at(-1), row[0]).toBe("yes |");
      expect(Number(/^(\d+) of 20$/.exec(row.at(-2) ?? "")?.[1]), row[0]).toBeGreaterThanOrEqual(RULE_HOLDS);
    }
  });
});
