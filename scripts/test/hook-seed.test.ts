import { describe, expect, it } from "vitest";
import { flockDefaultParams } from "@paperplay/primitives";
import { HOOK_SEED } from "../../apps/web/src/world/local-world.ts";
import { BASE, SWEEP_SEEDS, WINDOW_STEPS } from "../sweep/flock-sweep.ts";
import { chooseHookSeed, holdsFrom, runSeed, summarise, toMarkdown, type SeedSummary } from "../sweep/hook-seed.ts";

function summary(overrides: Partial<SeedSummary>): SeedSummary {
  return {
    seed: 1,
    qualified: true,
    finalAgreement: 0.9,
    finalGroups: 1,
    firstSingleGroup: 100,
    singleGroupFrom: 100,
    orderedFrom: 200,
    ...overrides,
  };
}

describe("hook seed", () => {
  it("finds the first index from which a condition holds through the end", () => {
    expect(holdsFrom([false, true, false, true, true])).toBe(3);
    expect(holdsFrom([true, true])).toBe(0);
    expect(holdsFrom([true, false])).toBeNull();
    expect(holdsFrom([])).toBeNull();
  });

  it("summarises a run: the sweep's criterion at the last step, and when one group formed for good", () => {
    const run = { seed: 7, steps: 4, clusterCount: [3, 1, 2, 1, 1], agreement: [0.1, 0.5, 0.85, 0.79, 0.9] };
    expect(summarise(run)).toEqual({
      seed: 7,
      qualified: true,
      finalAgreement: 0.9,
      finalGroups: 1,
      firstSingleGroup: 1,
      singleGroupFrom: 3,
      orderedFrom: 4,
    });
  });

  it("does not qualify a seed whose flock ends in two groups, however well it agrees", () => {
    const run = { seed: 2, steps: 2, clusterCount: [1, 1, 2], agreement: [0.9, 0.95, 0.99] };
    expect(summarise(run)).toMatchObject({ qualified: false, firstSingleGroup: 0, singleGroupFrom: null, orderedFrom: null });
  });

  it("picks the qualified seed that forms one group soonest for good, then orders soonest, then the lower seed", () => {
    const pick = (summaries: SeedSummary[]) => chooseHookSeed(summaries)?.seed;
    expect(pick([summary({ seed: 1, singleGroupFrom: 300 }), summary({ seed: 2, singleGroupFrom: 200 })])).toBe(2);
    expect(pick([summary({ seed: 1, qualified: false, singleGroupFrom: 10 }), summary({ seed: 2, singleGroupFrom: 200 })])).toBe(2);
    expect(pick([summary({ seed: 3, orderedFrom: 500 }), summary({ seed: 4, orderedFrom: 400 })])).toBe(4);
    expect(pick([summary({ seed: 6 }), summary({ seed: 5 })])).toBe(5);
    expect(pick([summary({ qualified: false })])).toBeUndefined();
  });

  it("records a run at every step from step 0, the same way every time", () => {
    const run = runSeed(flockDefaultParams, 3, 30);
    expect(run.clusterCount).toHaveLength(31);
    expect(run.agreement).toHaveLength(31);
    expect(runSeed(flockDefaultParams, 3, 30)).toEqual(run);
  });

  it("writes a record that lists every seed and names the choice", () => {
    const summaries = [summary({ seed: 1, singleGroupFrom: 300 }), summary({ seed: 2, qualified: false, singleGroupFrom: null })];
    const record = toMarkdown(summaries, chooseHookSeed(summaries), { primitive: "flock.planar.weighted@9.9.9", runtime: "node 0.0.0" });
    expect(record).toContain("flock.planar.weighted@9.9.9");
    expect(record).toMatch(/^\| 1 \| yes \|/m);
    expect(record).toMatch(/^\| 2 \| no \|/m);
    expect(record).toContain("Hook seed: **1**");
  });

  it("the local world opens on the seed this rule picks from the defaults sweep's seeds", () => {
    // The hook seed is only valid for the defaults it was chosen under, which are the sweep's choice.
    expect({ ...BASE, separationWeight: 1.05, alignmentWeight: 2, cohesionWeight: 0.4, perceptionRadius: 9 }).toEqual(flockDefaultParams);
    const summaries = SWEEP_SEEDS.map((seed) => summarise(runSeed(flockDefaultParams, seed, WINDOW_STEPS)));
    // The same 14 of 20 successes eval/sweeps/flock-defaults.md records for these defaults.
    expect(summaries.filter((s) => s.qualified)).toHaveLength(14);
    expect(chooseHookSeed(summaries)?.seed).toBe(HOOK_SEED);
  }, 60_000); // 20 seeds × 1,200 steps, measured after every step: a few seconds.
});
