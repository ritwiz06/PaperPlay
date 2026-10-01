import { describe, expect, it } from "vitest";
import {
  chooseDefaults,
  judge,
  successesOn,
  sweep,
  toCsv,
  union,
  type SweepGrid,
  type SweepRow,
} from "../sweep/flock-sweep.ts";

const prototype = { separationWeight: 1.2, alignmentWeight: 1, cohesionWeight: 0.8, perceptionRadius: 4.5 };

function row(overrides: Partial<SweepRow>): SweepRow {
  return {
    ...prototype,
    successes: 0,
    seeds: 20,
    medianAgreement: 0.5,
    medianClusters: 2,
    medianSecondsToOrder: null,
    ...overrides,
  };
}

describe("flock defaults sweep", () => {
  it("counts a seed as a success only when the flock is ordered and in one group", () => {
    expect(judge(0.8, 1)).toBe(true);
    expect(judge(0.95, 1)).toBe(true);
    expect(judge(0.7999, 1)).toBe(false);
    expect(judge(0.95, 2)).toBe(false);
  });

  it("ranks by successes, then closeness to the prototype's defaults, then grid order", () => {
    const rows = [
      row({ separationWeight: 0.6, successes: 18 }),
      row({ separationWeight: 1.5, successes: 19 }),
      row({ separationWeight: 0.9, successes: 19 }),
      row({ separationWeight: 0.9, cohesionWeight: 1.6, successes: 19 }),
    ];
    const spans = { separationWeight: 0.9, alignmentWeight: 0.75, cohesionWeight: 1.2, perceptionRadius: 4.5 };

    // 1.5 and 0.9 are both 0.3 from 1.2; the earlier row in grid order wins the tie.
    expect(chooseDefaults(rows, prototype, spans, 11)).toBe(rows[1]);
  });

  it("chooses nothing when no configuration succeeds for the required number of seeds", () => {
    const rows = [row({ successes: 10 }), row({ separationWeight: 0.6, successes: 9 })];
    const spans = { separationWeight: 0.6, alignmentWeight: 1, cohesionWeight: 1, perceptionRadius: 1 };

    expect(chooseDefaults(rows, prototype, spans, 11)).toBeUndefined();
  });

  it("is deterministic: the same grid and seeds give identical rows and CSV", () => {
    const grid: SweepGrid = {
      separationWeight: [1.2],
      alignmentWeight: [0.75, 1.5],
      cohesionWeight: [0.8],
      perceptionRadius: [4.5],
    };
    const options = { seeds: [1, 2], steps: 120, sampleEvery: 60 };

    const first = sweep(grid, options);
    const second = sweep(grid, options);

    expect(second).toEqual(first);
    expect(toCsv(second)).toBe(toCsv(first));
    expect(first).toHaveLength(2);
    expect(first.map((r) => r.alignmentWeight)).toEqual([0.75, 1.5]);
    expect(first.every((r) => r.seeds === 2)).toBe(true);
  });

  it("keeps the first copy of a configuration that two stages both ran", () => {
    const early = row({ successes: 7 });
    const later = row({ successes: 7, medianAgreement: 0.6 });
    const other = row({ separationWeight: 0.6 });

    expect(union([[early], [later, other]])).toEqual([early, other]);
  });

  it("re-checks a configuration on other seeds with the same success rule", () => {
    const config = { separationWeight: 1.2, alignmentWeight: 1.5, cohesionWeight: 0.8, perceptionRadius: 4.5 };
    const options = { steps: 120, sampleEvery: 60 };
    const [byRow] = sweep(
      { separationWeight: [1.2], alignmentWeight: [1.5], cohesionWeight: [0.8], perceptionRadius: [4.5] },
      { ...options, seeds: [21, 22, 23] },
    );

    expect(successesOn(config, [21, 22, 23], options)).toBe(byRow?.successes);
  });

  it("re-checks a whole sweep row, using only its four rule settings", () => {
    const options = { steps: 60, sampleEvery: 60 };
    const chosen = row({ alignmentWeight: 1.5, successes: 12, medianSecondsToOrder: 9 });

    expect(successesOn(chosen, [21], options)).toBe(
      successesOn({ separationWeight: 1.2, alignmentWeight: 1.5, cohesionWeight: 0.8, perceptionRadius: 4.5 }, [21], options),
    );
  });

  it("writes one CSV line per configuration under a fixed header", () => {
    const csv = toCsv([row({ successes: 12, medianSecondsToOrder: 7.5 }), row({ separationWeight: 0.6 })]);
    const [header, ...lines] = csv.trimEnd().split("\n");

    expect(header).toBe(
      "separationWeight,alignmentWeight,cohesionWeight,perceptionRadius,successes,seeds,medianAgreement,medianClusters,medianSecondsToOrder",
    );
    expect(lines).toEqual(["1.2,1,0.8,4.5,12,20,0.5000,2,7.50", "0.6,1,0.8,4.5,0,20,0.5000,2,"]);
  });
});
