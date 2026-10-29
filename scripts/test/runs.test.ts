import { describe, expect, it } from "vitest";
import { failureOf } from "../live/runs.ts";

// A run of papers sorts each job's failure into a category, by its ending's words (ADR-0058's amendment).

describe("a run's failure categories", () => {
  it("name each ending the generated tier has", () => {
    expect(failureOf("ready", "the world is built and checked", false)).toBeNull();
    expect(failureOf("unsupported", "the writer finds no mechanism a learner could play with: NO MECHANISM: agents need a language model; this paper falls back to the explainer page, tier C", true)).toBe("the writer refused: no mechanism to simulate");
    expect(failureOf("unsupported", "the module still fails its checks: the module still failed its checks after 3 rounds of fixes; this paper falls back to the explainer page, tier C", true)).toBe("the module never passed its checks");
    expect(failureOf("unsupported", "only 2 of the module's candidate levels pass the rules, and a world needs three; this paper falls back to the explainer page, tier C", true)).toBe("too few candidate levels passed the rules");
    expect(failureOf("needs_information", "the hook is still blocked after 2 rounds of repairs: … The owner decides.", false)).toBe("a reviewer blocked the hook");
    expect(failureOf("failed", "the planner call ran past its 240 s: the job stops at its deadline of 1200 s rather than run on", false)).toBe("the job's deadline");
  });
});
