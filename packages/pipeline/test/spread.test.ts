import { ModelSpec } from "@paperplay/contracts";
import { describe, expect, it } from "vitest";
import { sirModel } from "../../contracts/test/model-examples.ts";
import { hookSpreadProblem } from "../src/rule/spread.ts";

// The hook measures what the headline is about (the owner, 2026-10-18): a headline about spread is
// tested on an infected compartment, as the next-generation matrix identifies them.

// Mass action, beta·s·i, as the papers' models are: the matrix reads its infected compartments.
const base = sirModel();
const meet = { op: "mul", args: [{ p: "beta" }, { c: "s" }, { c: "i" }] };
const model = ModelSpec.parse({
  ...base,
  parameters: base.parameters.map((parameter) => (parameter.id === "beta" ? { ...parameter, unit: { people: -1, time: -1 }, range: [0, 0.01], defaultValue: 0.0004 } : parameter)),
  equations: [
    { of: "s", rate: { op: "neg", a: meet }, anchors: base.equations[0]?.anchors ?? [] },
    { of: "i", rate: { op: "sub", a: meet, b: { op: "mul", args: [{ p: "gamma" }, { c: "i" }] } }, anchors: base.equations[1]?.anchors ?? [] },
    { of: "r", rate: { op: "mul", args: [{ p: "gamma" }, { c: "i" }] }, anchors: base.equations[2]?.anchors ?? [] },
  ],
});
const spread = { text: "Adherence above 52% curtails the spread.", quote: "adherence above 52% curtails HCV spread" };

describe("[R10] the hook on a headline about spread", () => {
  it("must measure an infected compartment, not one downstream of infection", () => {
    expect(hookSpreadProblem(model, spread, "r")).toBe("level 1, the hook, must measure the spread the headline speaks of: an infected compartment (i), not r");
    expect(hookSpreadProblem(model, spread, "i")).toBeNull();
  });

  it("asks nothing of a headline that is not about spread, nor of a model whose infected compartments cannot be read", () => {
    expect(hookSpreadProblem(model, { text: "The epidemic ends before everyone is infected.", quote: "ends before everyone has been infected" }, "s")).toBeNull();
    // Frequency-dependent, dividing by the population: the matrix cannot tell its terms apart.
    expect(hookSpreadProblem(ModelSpec.parse(sirModel()), spread, "r")).toBeNull();
  });
});
