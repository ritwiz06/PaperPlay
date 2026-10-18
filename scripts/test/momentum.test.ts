import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { registry } from "@paperplay/primitives";
import { buildWorld, visibilityOf } from "@paperplay/pipeline";
import { describe, expect, it } from "vitest";

// The momentum world is authored in scripts/fixtures/momentum.ts (ADR-0047); the fixture the app
// builds is written from it, so the two never drift apart.
const root = join(import.meta.dirname, "..", "..");
const path = join(root, "fixtures", "worldspecs", "sutskever-2013-momentum.json");

describe("[R08] the momentum world's fixture", () => {
  it("is exactly what its source writes, byte for byte", () => {
    const fresh = execFileSync(process.execPath, [join(root, "scripts", "momentum.ts"), "--print"], { cwd: root, encoding: "utf8" });
    expect(fresh).toBe(readFileSync(path, "utf8"));
  });

  it("builds on learning.landscape, varied over its neighbourhood, every level's difference visible on its chart and on the landscape", () => {
    const built = buildWorld(JSON.parse(readFileSync(path, "utf8")), registry);
    if (!built.ok) throw new Error(built.problems.map((problem) => `${problem.path}: ${problem.message}`).join("; "));
    expect(built.world.family.label).toBe("miniature: the idea at toy scale");
    expect(built.world.variation).toBe("neighbourhood");
    expect(built.world.kit.id).toBe("landscape");
    for (const seen of visibilityOf(built.world)) {
      expect(seen.visible, seen.why ?? seen.title).toBe(true);
      expect(seen.balls?.visible, seen.title).toBe(true);
    }
  });
});
