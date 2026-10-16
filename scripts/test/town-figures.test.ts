import { mulberry32 } from "@paperplay/primitives";
import { TOWN_FIGURES, townFigureCounts } from "@paperplay/pipeline";
import { FIGURES, figureCounts } from "@paperplay/ui/stage-core/town";
import { describe, expect, it } from "vitest";

// The visibility rule (ADR-0037) counts the town's figures with its own copy of the town kit's
// rule, since the stage core may not import the pipeline nor the pipeline the stage core. Held
// equal here, on the edge cases and on a thousand random sets of shares.

describe("[R06] the town's figures, as the visibility rule counts them", () => {
  it("are counted exactly as the town kit counts them", () => {
    expect(TOWN_FIGURES).toBe(FIGURES);
    const random = mulberry32(7);
    const cases: number[][] = [[1, 0, 0], [0, 0, 0], [-0.1, 1, Number.NaN], [0.334, 0.333, 0.333], [0.991, 0.004, 0.005]];
    for (let k = 0; k < 1000; k++) cases.push(Array.from({ length: 2 + Math.floor(random.next() * 5) }, () => (random.next() < 0.2 ? random.next() * 0.01 : random.next())));
    for (const shares of cases) expect(townFigureCounts(shares), JSON.stringify(shares)).toEqual(figureCounts(shares));
  });
});
