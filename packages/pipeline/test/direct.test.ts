import type { ModelSpec } from "@paperplay/contracts";
import { describe, expect, it } from "vitest";
import { decideReviews, describeDirectEffect, directEffectOf, isEmergent, termHolds } from "../src/rule/direct.ts";

// What counts as definitional (ADR-0044), held by code: the direct-effect tag read from the
// equations, a named term checked against them, emergent summaries never definitional, and a block
// standing only where two reviewers make it.

/** Hepatitis C's quit-treatment compartment, as the paper writes it: fed by delta × (1 − theta) × c. */
const model = {
  timeUnit: "year",
  compartments: [
    { id: "c", name: "Chronically infected, on treatment", unit: { people: 1 }, initial: { p: "c0" }, nonNegative: true, anchors: [] },
    { id: "cq", name: "Chronically infected, quit treatment", unit: { people: 1 }, initial: { p: "cq0" }, nonNegative: true, anchors: [] },
  ],
  parameters: [
    { id: "delta", name: "Treatment quitting rate", unit: { time: -1 }, defaultValue: 0.6, range: [0, 2], anchors: [] },
    { id: "theta", name: "Treatment adherence proportion", unit: {}, defaultValue: 0.5, range: [0, 1], anchors: [] },
    { id: "rho", name: "Recovery rate on treatment", unit: { time: -1 }, defaultValue: 0.05, range: [0, 1], anchors: [] },
    { id: "beta3", name: "Transmission rate from those who quit treatment", unit: { time: -1 }, defaultValue: 0.05, range: [0, 1], anchors: [] },
    { id: "c0", name: "On treatment at the start", unit: { people: 1 }, defaultValue: 1, range: [0, 10], anchors: [] },
    { id: "cq0", name: "Quit treatment at the start", unit: { people: 1 }, defaultValue: 0, range: [0, 10], anchors: [] },
  ],
  equations: [
    { of: "c", rate: { op: "neg", a: { op: "mul", args: [{ p: "delta" }, { op: "sub", a: { n: 1 }, b: { p: "theta" } }, { c: "c" }] } }, anchors: [] },
    {
      of: "cq",
      rate: { op: "sub", a: { op: "mul", args: [{ p: "delta" }, { op: "sub", a: { n: 1 }, b: { p: "theta" } }, { c: "c" }] }, b: { op: "mul", args: [{ p: "rho" }, { c: "cq" }] } },
      anchors: [],
    },
  ],
  solver: { method: "rk4", dt: 0.01 },
} as unknown as ModelSpec;

const total = { summary: "total", at: null, time: 50 } as const;
const peak = { summary: "peak", at: null, time: 50 } as const;

describe("[R10] the direct-effect tag", () => {
  it("says whether a control appears in the measured compartment's own equation, and with which sign", () => {
    expect(directEffectOf(model, "delta", "cq", total)).toMatchObject({ direct: true, signs: ["+"], emergent: false });
    expect(directEffectOf(model, "rho", "cq", total)).toMatchObject({ direct: true, signs: ["−"] });
    // theta takes from what delta brings: in the expansion it appears with the opposite sign.
    expect(directEffectOf(model, "theta", "cq", total)).toMatchObject({ direct: true, signs: ["−"] });
    expect(directEffectOf(model, "beta3", "cq", total)).toMatchObject({ direct: false, signs: [], terms: [] });
    expect(describeDirectEffect(directEffectOf(model, "beta3", "cq", total))).toBe("its control beta3 does not appear in dcq/dt, the measured compartment's own equation");
    expect(describeDirectEffect(directEffectOf(model, "delta", "cq", peak))).toMatch(/^its control delta appears directly in dcq\/dt, the measured compartment's own equation, adding to it \(.+\); the level measures an emergent summary of it, which is never definitional$/);
  });

  it("calls a peak, a lowest value, a time to a level and a final size emergent, and a level at a moment or a total not", () => {
    expect(isEmergent({ summary: "peak", at: null, time: 50 })).toBe(true);
    expect(isEmergent({ summary: "lowest", at: 10, time: 50 })).toBe(true);
    expect(isEmergent({ summary: "first-reach", at: 0.1, time: 50 })).toBe(true);
    expect(isEmergent({ summary: "at", at: 50, time: 50 })).toBe(true);
    expect(isEmergent({ summary: "at", at: 20, time: 50 })).toBe(false);
    expect(isEmergent({ summary: "total", at: null, time: 50 })).toBe(false);
    expect(isEmergent({ summary: "mean", at: null, time: 50 })).toBe(false);
  });
});

describe("[R10] a named term", () => {
  it("holds when every monomial is the equation's and one holds the control, written as the equations are or as formulas", () => {
    expect(termHolds(model, "cq", "delta", "delta × (1 − theta) × c").valid).toBe(true);
    expect(termHolds(model, "cq", "delta", "delta*(1-theta)*c").valid).toBe(true);
    expect(termHolds(model, "cq", "delta", "delta*c").valid).toBe(true);
  });

  it("does not hold when it names nothing, a term the equation lacks, one without the control, or ids the model lacks", () => {
    expect(termHolds(model, "cq", "delta", null)).toEqual({ valid: false, reason: "it names no term" });
    expect(termHolds(model, "cq", "delta", "beta3 * cq").reason).toMatch(/^dcq\/dt holds no cq × beta3/);
    expect(termHolds(model, "cq", "delta", "rho*cq")).toEqual({ valid: false, reason: `its term "rho*cq" does not hold the control, delta` });
    expect(termHolds(model, "cq", "delta", "δ(1 − θ)C").valid).toBe(false);
  });
});

describe("[R10] which reviewers' blocks stand", () => {
  const plan = { levels: [{ control: { parameter: "delta" }, difference: { compartment: "cq", summary: "total", at: null, time: 50 } }, { control: { parameter: "delta" }, difference: { compartment: "cq", summary: "peak", at: null, time: 50 } }] };
  const tags = plan.levels.map((level) => directEffectOf(model, level.control.parameter, level.difference.compartment, level.difference));
  const block = (level: number, kind: "definitional" | "unsupported", term: string | null = null) => ({ level, severity: "blocking" as const, kind, term });

  it("stands where both reviewers make a valid block of the same kind on the same level", () => {
    const decided = decideReviews(model, plan, tags, [
      { model: "a", review: { findings: [block(1, "definitional", "delta*(1-theta)*c"), block(1, "unsupported")] } },
      { model: "b", review: { findings: [block(1, "definitional", "delta × c")] } },
    ]);
    expect(decided.standing("definitional")).toEqual([0]);
    expect(decided.standing("unsupported")).toEqual([]);
    expect(decided.records.find((record) => record.reviewer === "a" && record.kind === "unsupported")).toMatchObject({ valid: true, stands: false, reason: "b makes no such block" });
  });

  it("ignores a definitional block naming no valid term, or on an emergent summary, and records why", () => {
    const decided = decideReviews(model, plan, tags, [
      { model: "a", review: { findings: [block(1, "definitional", null), block(2, "definitional", "delta*c")] } },
      { model: "b", review: { findings: [block(1, "definitional", "delta*c"), block(2, "definitional", "delta*c")] } },
    ]);
    expect(decided.standing("definitional")).toEqual([]);
    expect(decided.records[0]).toMatchObject({ reviewer: "a", level: 1, valid: false, stands: false, reason: "it names no term; a definitional block must name a term of dcq/dt holding the control" });
    expect(decided.records[1]).toMatchObject({ reviewer: "a", level: 2, valid: false, reason: "the level measures the peak of cq, an emergent summary, which is never definitional" });
    expect(decided.records[2]).toMatchObject({ reviewer: "b", level: 1, valid: true, stands: false });
  });

  it("lets a lone reviewer's valid block stand where no second reviewer is chosen", () => {
    const decided = decideReviews(model, plan, tags, [{ model: "a", review: { findings: [block(1, "definitional", "delta*c"), { level: 2, severity: "advice", kind: "other", term: null }] } }]);
    expect(decided.standing("definitional")).toEqual([0]);
    expect(decided.records.map((record) => record.reason)).toEqual(["dcq/dt holds c × delta, which holds delta; one reviewer only", "advice"]);
  });
});
