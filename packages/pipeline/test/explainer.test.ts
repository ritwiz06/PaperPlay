import { describe, expect, it } from "vitest";
import { ExplainedLevel, mendTo } from "../src/stages/explainer.ts";

// The explainer's guide lines (ADR-0037): {to} marks where the learner's new value goes. A value a
// model writes there instead is mended to the placeholder; nothing else is.

describe("[R06] the explainer's guide lines", () => {
  it("mend a value written where {to} goes, and leave a line that has it", () => {
    expect(mendTo("You raise the rate to 0.1, so more people get sick.")).toBe("You raise the rate{to}, so more people get sick.");
    expect(mendTo("You lower adherence to 40%, so more quit.")).toBe("You lower adherence{to}, so more quit.");
    expect(mendTo("You raised it{to}, so it spreads.")).toBe("You raised it{to}, so it spreads.");
    expect(mendTo("You raised it, so it spreads.")).toBe("You raised it, so it spreads.");
  });

  it("still refuse a line with no place for the value", () => {
    const level = {
      beginner: { text: "Watch.", analogy: "Like a tide." },
      intermediate: { text: "Watch." },
      advanced: { text: "Equations.", equation: "dx/dt", quote: null },
      guide: { idle: "Watch.", raised: "You raised it, so it spreads.", lowered: "You lowered it to 0.2, so it slows.", readings: [{ atLeast: 1, words: "many" }, { atLeast: 0, words: "few" }], rising: "rising", falling: "falling" },
      afterwards: { text: "As measured.", quote: null, question: "Why?" },
    };
    const parsed = ExplainedLevel.safeParse(level);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path.join("."))).toEqual(["guide.raised"]);
  });
});
