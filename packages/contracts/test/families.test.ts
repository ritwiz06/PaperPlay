import { describe, expect, it } from "vitest";
import { FAMILIES, FamilyId, SpaceKind, TimeUnit, Variation } from "../src/index.ts";

describe("[R03] the primitive families' catalogue", () => {
  it("describes every family once, under its own id, and nothing else", () => {
    expect(Object.keys(FAMILIES).sort()).toEqual([...FamilyId.options].sort());
    for (const id of FamilyId.options) expect(FAMILIES[id].id).toBe(id);
  });

  it("labels the learning toys and a study's design, and no other family", () => {
    const labelled = Object.values(FAMILIES).filter((family) => family.label !== undefined);
    expect(labelled.map((family) => [family.id, family.label])).toEqual([
      ["learning", "miniature: the idea at toy scale"],
      ["study-design", "a model of how the study was designed, not its data"],
    ]);
  });

  it("varies a run by seeds, a neighbourhood of the paper's values, or cohorts, as the level rule says (ADR-0024)", () => {
    expect(Variation.options).toEqual(["seeds", "neighbourhood", "cohorts"]);
    expect(FAMILIES.agents.variation).toBe("seeds");
    expect(FAMILIES.compartments.variation).toBe("neighbourhood");
    expect(FAMILIES["study-design"].variation).toBe("cohorts");
  });

  it("is frozen, so no caller can change a family's label", () => {
    expect(Object.isFrozen(FAMILIES)).toBe(true);
    expect(Object.values(FAMILIES).every((family) => Object.isFrozen(family))).toBe(true);
  });

  it("names time units and spaces from closed lists", () => {
    expect(TimeUnit.safeParse("day").success).toBe(true);
    expect(TimeUnit.safeParse("fortnight").success).toBe(false);
    expect(SpaceKind.safeParse("torus2d").success).toBe(true);
    expect(SpaceKind.safeParse("sphere").success).toBe(false);
  });
});
