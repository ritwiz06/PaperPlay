import { readFileSync } from "node:fs";
import { join } from "node:path";
import { flockDefaultParams, flockPlanarWeighted as flock } from "@paperplay/primitives";
import { describe, expect, it } from "vitest";
import { CRITERION, groupsBy, murmuration, scatterSweep, toMarkdown } from "../sweep/group-measure.ts";

describe("the group measure's sweep (ADR-0015)", () => {
  it("compares against an evaluation copy of the owner's measure that agrees with the primitive's E14", () => {
    for (let seed = 0; seed < 500; seed++) {
      const state = flock.init(flockDefaultParams, seed);
      expect(groupsBy(state, "the owner's measure (flock 3.0.0)"), `seed ${seed}`).toBe(flock.measure(state).clusterCount);
    }
    let state = flock.init(flockDefaultParams, 4);
    for (let t = 1; t <= 1200; t++) {
      state = flock.step(state, flockDefaultParams, flock.fixedTimestep);
      if (t % 60 === 0) expect(groupsBy(state, "the owner's measure (flock 3.0.0)"), `step ${t}`).toBe(flock.measure(state).clusterCount);
    }
  });

  const rows = scatterSweep();
  const seed = murmuration();

  it("meets the owner's criteria: scatters read as one group in under 1% of seeds, and seed 4's murmuration does", () => {
    const adopted = rows.find((row) => row.variant === "one group holding at least half the birds (O1, adopted)");
    expect(adopted?.upper95).toBeLessThan(CRITERION);
    expect(seed.rows.at(-1)?.oneGroup).toBe(true);
  });

  it("records why O1 was adopted: the bare count of one group failed the first criterion", () => {
    const bare = rows.find((row) => row.variant === "the owner's measure (flock 3.0.0)");
    expect(bare?.oneGroup).toBe(128);
    expect(bare?.upper95).toBeGreaterThan(CRITERION);
  });

  it("matches eval/sweeps/group-measure.md byte for byte, so the record cannot drift from the code", () => {
    const fresh = toMarkdown(rows, seed, { primitive: `${flock.id}@${flock.version}`, runtime: `node ${process.versions.node}` });
    expect(readFileSync(join(import.meta.dirname, "..", "..", "eval", "sweeps", "group-measure.md"), "utf8")).toBe(fresh);
  });
}, 120_000);
