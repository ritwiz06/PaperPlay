import { readFileSync } from "node:fs";
import { join } from "node:path";
import { registry } from "@paperplay/primitives";
import type { CompartmentModel } from "@paperplay/primitives/compartments";
import { describe, expect, it } from "vitest";
import { buildWorld } from "../src/builder/build.ts";
import { sweepLevels } from "../src/rule/sweep.ts";
import { chartTopOf, sharesOf, VISIBLE_FIGURES, VISIBLE_SHARE, visibilityOf } from "../src/rule/visibility.ts";

// The visibility rule (ADR-0037), beside the level rule: a level's difference must show on a chart
// fitted to the measured quantity, and in the town, through a labelled lens when the quantity is
// too small for 120 figures. Held to Threshold Town, which shows every difference as it is, and to
// the first generated world, kept as it was made before the rule.

const root = join(import.meta.dirname, "..", "..", "..");
const built = (file: string) => {
  const result = buildWorld(JSON.parse(readFileSync(join(root, file), "utf8")), registry);
  if (!result.ok) throw new Error(`${file} does not build`);
  return result.world;
};

describe("[R06] the visibility rule", () => {
  it("fits a chart's axis to what it draws, in round steps, and never below a threshold", () => {
    expect(chartTopOf([0, 1150])).toBe(1500);
    expect(chartTopOf([0.004, 0.017])).toBe(0.02);
    expect(chartTopOf([0, 10], 40)).toBe(50);
    expect(chartTopOf([])).toBe(1);
  });

  it("finds every one of Threshold Town's differences visible in the chart and among the 120 figures, with no lens", () => {
    for (const level of visibilityOf(built("fixtures/worldspecs/kermack-mckendrick-1927.json"))) {
      expect(level.visible, level.title).toBe(true);
      expect(level.chart.share).toBeGreaterThanOrEqual(VISIBLE_SHARE);
      expect(level.scene?.lens).toBeNull();
      expect(level.scene?.figures).toBeGreaterThanOrEqual(VISIBLE_FIGURES);
    }
  });

  it("keeps the first generated world as it was made: every level meets the level rule, three need a lens, and level 5 shows nothing", () => {
    const world = built("fixtures/worldspecs/generated/pmc-PMC12334037.json");
    expect(sweepLevels(world).map((level) => level.meets)).toEqual([true, true, true, true, true]);
    expect(sharesOf(world.levels[0]?.primitive as unknown as CompartmentModel, world.levels[0]?.params ?? {})).toBe(false);
    const seen = visibilityOf(world);
    expect(seen.map((level) => level.scene?.lens !== null)).toEqual([true, true, false, true, true]);
    expect(seen.map((level) => level.visible)).toEqual([true, true, true, true, false]);
    expect(seen[4]?.why).toMatch(/its two curves part by 2\.4% of the chart's height at most, less than 10%; in the town at most 2 figure\(s\) differ, even through a lens, fewer than 3/);
  });
});
