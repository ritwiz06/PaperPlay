import { describe, expect, it } from "vitest";
import { chartLabel, chartTick } from "../src/react/numbers.ts";

// The fork's chart writes a count of millions as people read one: whole, with separators, and
// its axis's ticks short enough to fit.

describe("[R06] the fork chart's numbers", () => {
  it("writes small values as before, and thousands and more whole, with separators", () => {
    expect([0, 0.5, 2.25, 40, 306.11].map(chartLabel)).toEqual(["0", "0.50", "2.3", "40", "306.1"]);
    expect(chartLabel(13568699.92)).toBe("13,568,700");
  });

  it("shortens an axis's ticks from ten thousand up, so they fit beside the chart", () => {
    expect([200, 4000, 20_000, 250_000, 20_000_000, 1_500_000].map(chartTick)).toEqual(["200", "4,000", "20K", "250K", "20M", "1.5M"]);
  });
});
