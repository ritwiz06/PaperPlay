import type { ModelSpec } from "@paperplay/contracts";
import { describe, expect, it } from "vitest";
import { checkClaim, decideReviews, definitionalProblem, describeDirectEffect, directEffectOf, isSystemWide, termHolds, type ModelClaim } from "../src/rule/direct.ts";

// What counts as definitional (ADR-0044, corrected 2026-10-18), held by code: the direct-effect tag
// read from the equations decides it; a named term is checked against them; one reviewer's
// unsupported block stands unless the model refutes it, any other only where two reviewers agree.

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

describe("[R10] the direct-effect tag, and what is definitional (corrected 2026-10-18)", () => {
  it("says whether a control appears in the measured compartment's own equation, and with which sign", () => {
    expect(directEffectOf(model, "delta", "cq", total)).toMatchObject({ direct: true, signs: ["+"], systemWide: true, definitional: false });
    expect(directEffectOf(model, "rho", "cq", total)).toMatchObject({ direct: true, signs: ["−"] });
    // theta takes from what delta brings: in the expansion it appears with the opposite sign.
    expect(directEffectOf(model, "theta", "cq", total)).toMatchObject({ direct: true, signs: ["−"] });
    expect(directEffectOf(model, "beta3", "cq", peak)).toMatchObject({ direct: false, signs: [], terms: [], definitional: false });
  });

  it("calls a level definitional when its control is direct and it measures that compartment's own level or peak, and no other", () => {
    expect(directEffectOf(model, "delta", "cq", peak).definitional).toBe(true);
    expect(directEffectOf(model, "delta", "cq", { summary: "at", at: 20, time: 50 }).definitional).toBe(true);
    expect(directEffectOf(model, "delta", "cq", { summary: "mean", at: null, time: 50 }).definitional).toBe(true);
    // Through other compartments, or on a system-wide summary: not definitional.
    expect(directEffectOf(model, "beta3", "cq", peak).definitional).toBe(false);
    expect(directEffectOf(model, "delta", "cq", total).definitional).toBe(false);
    expect(describeDirectEffect(directEffectOf(model, "beta3", "cq", total))).toBe("its control beta3 does not appear in dcq/dt, the measured compartment's own equation: its effect travels through other compartments, so it is not definitional");
    expect(describeDirectEffect(directEffectOf(model, "delta", "cq", peak))).toMatch(/^its control delta appears directly in dcq\/dt, the measured compartment's own equation, adding to it \(.+\), and the level measures that compartment's own level or peak, so it is definitional: its effect follows from the model's definition$/);
    expect(definitionalProblem(directEffectOf(model, "delta", "cq", peak))).toMatch(/^it is definitional: its control delta appears directly in dcq\/dt .+ and it measures cq's own level or peak/);
  });

  it("calls a time to a level, a total and a final size system-wide, and a level at a moment, a peak, a lowest value or a mean not", () => {
    expect(isSystemWide({ summary: "first-reach", at: 0.1, time: 50 })).toBe(true);
    expect(isSystemWide({ summary: "total", at: null, time: 50 })).toBe(true);
    expect(isSystemWide({ summary: "at", at: 50, time: 50 })).toBe(true);
    expect(isSystemWide({ summary: "at", at: 20, time: 50 })).toBe(false);
    expect(isSystemWide({ summary: "peak", at: null, time: 50 })).toBe(false);
    expect(isSystemWide({ summary: "lowest", at: 10, time: 50 })).toBe(false);
    expect(isSystemWide({ summary: "mean", at: null, time: 50 })).toBe(false);
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
  // Level 1 measures cq's total, system-wide; level 2 its peak, definitional.
  const plan = { levels: [{ control: { parameter: "delta" }, difference: { compartment: "cq", summary: "total", at: null, time: 50 } }, { control: { parameter: "delta" }, difference: { compartment: "cq", summary: "peak", at: null, time: 50 } }] };
  const tags = plan.levels.map((level) => directEffectOf(model, level.control.parameter, level.difference.compartment, level.difference));
  const block = (level: number, kind: "definitional" | "unsupported", term: string | null = null, claim: ModelClaim | null = null) => ({ level, severity: "blocking" as const, kind, term, claim });

  it("lets a definitional block stand where both reviewers make it on a level the code finds definitional", () => {
    const decided = decideReviews(model, plan, tags, [
      { model: "a", review: { findings: [block(2, "definitional", "delta*(1-theta)*c")] } },
      { model: "b", review: { findings: [block(2, "definitional", "delta × c")] } },
    ]);
    expect(decided.standing("definitional")).toEqual([1]);
    const alone = decideReviews(model, plan, tags, [{ model: "a", review: { findings: [block(2, "definitional", "delta*c")] } }, { model: "b", review: { findings: [] } }]);
    expect(alone.standing("definitional")).toEqual([]);
    expect(alone.records[0]).toMatchObject({ valid: true, stands: false, reason: "dcq/dt holds c × delta, which holds delta; b makes no such block" });
  });

  it("ignores a definitional block naming no valid term, or on a level the code does not find definitional, and records why", () => {
    const decided = decideReviews(model, plan, tags, [{ model: "a", review: { findings: [block(2, "definitional", null), block(1, "definitional", "delta*c")] } }]);
    expect(decided.standing("definitional")).toEqual([]);
    expect(decided.records[0]).toMatchObject({ level: 2, valid: false, reason: "it names no term; a definitional block must name a term of dcq/dt holding the control" });
    expect(decided.records[1]).toMatchObject({ level: 1, valid: false });
    expect(decided.records[1]?.reason).toMatch(/^the code finds the level is not definitional: .*but the level measures a system-wide summary/);
  });

  it("lets one reviewer's unsupported block stand, unless the model refutes what it claims", () => {
    const decided = decideReviews(model, plan, tags, [
      { model: "a", review: { findings: [block(1, "unsupported"), block(2, "unsupported", null, { parameter: "theta", compartment: null, says: "share" })] } },
      { model: "b", review: { findings: [block(2, "unsupported", null, { parameter: "theta", compartment: null, says: "rate" }), block(1, "unsupported", null, { parameter: "beta3", compartment: "cq", says: "present" })] } },
    ]);
    expect(decided.standing("unsupported")).toEqual([0, 1]);
    expect(decided.records.map((record) => [record.reviewer, record.level, record.stands, record.reason])).toEqual([
      ["a", 1, true, "one reviewer's block is enough to send words back"],
      ["a", 2, true, "the model bears it out: theta is a share, with no unit; one reviewer's block is enough to send words back"],
      ["b", 2, false, "the model refutes what it says: theta is a share, with no unit"],
      ["b", 1, false, "the model refutes what it says: beta3 does not appear in dcq/dt"],
    ]);
  });

  it("checks a claim against the model: a share or a rate by its unit, a term by the equation", () => {
    expect(checkClaim(model, { parameter: "delta", compartment: null, says: "rate" })).toEqual({ holds: true, reason: "delta is a rate, per unit of time" });
    expect(checkClaim(model, { parameter: "delta", compartment: "cq", says: "present" })).toEqual({ holds: true, reason: "delta appears in dcq/dt" });
    expect(checkClaim(model, { parameter: "nu", compartment: null, says: "rate" })).toBeNull();
  });
});
