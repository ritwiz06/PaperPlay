import { describe, expect, it } from "vitest";
import { DescentSpec, FAMILIES, OptimizerSpec, sceneKit, TIME_WORDS } from "../src/index.ts";

// The learning family's contracts (ADR-0046, ADR-0047): an update rule as data, held to names that
// resolve, and the family's catalogue entries.

const hyper = (id: string, value: number) => ({ id, symbol: id, name: id, unit: {}, range: [0, 10] as [number, number], defaultValue: value, origin: "teaching-choice" as const, anchors: [] });
const anchors = [{ placeholder: true as const, sourceId: "a2013", need: "Its equation." }];
const momentum = () => ({
  name: "momentum",
  state: [
    { id: "theta", symbol: "θ", name: "Position", initial: { n: 0 }, anchors: [] },
    { id: "v", symbol: "v", name: "Velocity", initial: { n: 0 }, anchors: [] },
  ],
  position: "theta",
  hyperparameters: [hyper("eps", 0.1), hyper("mu", 0.9)],
  gradientAt: { c: "theta" },
  update: [
    { of: "v", next: { op: "sub", a: { op: "mul", args: [{ p: "mu" }, { c: "v" }] }, b: { op: "mul", args: [{ p: "eps" }, { c: "g" }] } }, anchors },
    { of: "theta", next: { op: "add", args: [{ c: "theta" }, { c: "v" }] }, anchors },
  ],
});
const messages = (value: unknown): string[] => {
  const parsed = OptimizerSpec.safeParse(value);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
};

describe("[R03] an update rule as data", () => {
  it("accepts momentum written line by line, its velocity first", () => {
    expect(messages(momentum())).toEqual([]);
  });

  it("refuses a name that does not resolve, a state named for the gradient, a second update of one state, and a rule that never moves", () => {
    expect(messages({ ...momentum(), gradientAt: { op: "add", args: [{ c: "theta" }, { p: "nu" }] } })).toEqual(["where the gradient is taken names nu, which is not a hyperparameter"]);
    expect(messages({ ...momentum(), state: [...momentum().state, { id: "g", symbol: "g", name: "Gradient", initial: { n: 0 }, anchors: [] }] })[0]).toMatch(/^g is what the rule reads as the gradient/);
    expect(messages({ ...momentum(), update: [...momentum().update, momentum().update[1]] })).toEqual(["the rule updates theta twice in one step"]);
    expect(messages({ ...momentum(), update: [momentum().update[0]] })).toEqual(["the rule never moves the position"]);
    // Where the gradient is taken cannot read the gradient, and a starting value reads no state.
    expect(messages({ ...momentum(), gradientAt: { c: "g" } })).toEqual(["where the gradient is taken cannot read g"]);
    expect(messages({ ...momentum(), state: [momentum().state[0], { ...momentum().state[1], initial: { c: "theta" } }] })).toEqual(["a starting value, made of hyperparameters and numbers, cannot read theta"]);
  });

  it("keeps a surface's starting point apart from the rule's hyperparameters", () => {
    const surface = { kind: "quadratic", name: "a ravine", hx: 1, hy: 25, cx: 0, cy: 0, gx: 0, gy: 0, extent: { x: [-5, 5], y: [-2, 2] }, start: [hyper("eps", 1), hyper("y0", 1)], origin: "teaching-choice", anchors: [] };
    const parsed = DescentSpec.safeParse({ optimizer: momentum(), surface });
    expect(parsed.success ? [] : parsed.error.issues.map((issue) => issue.message)).toEqual(["the starting point's eps is also a hyperparameter"]);
  });

  it("counts a learning toy's time in steps, draws it in the landscape kit, and varies a world with no chance over its neighbourhood", () => {
    expect(TIME_WORDS.step).toEqual({ one: "step", many: "steps", short: "steps" });
    expect(sceneKit("landscape")?.draws).toEqual({ families: ["learning"], spaces: ["surface2d"] });
    expect(FAMILIES.learning).toMatchObject({ label: "miniature: the idea at toy scale", variation: "seeds", variationWithoutChance: "neighbourhood", forkFrom: "start" });
  });
});
