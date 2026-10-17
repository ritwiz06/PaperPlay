import { describe, expect, it } from "vitest";
import { narrationOf } from "../src/assemble/world.ts";
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

  it("mend a value named in a few words before the clause's comma, and nothing longer or without a comma", () => {
    expect(mendTo("You set the treatment rate to fast treatment, so the peak of infectious people lowers.")).toBe("You set the treatment rate{to}, so the peak of infectious people lowers.");
    expect(mendTo("You moved people to a place where they are safe from harm, so fewer fall ill.")).toBe("You moved people to a place where they are safe from harm, so fewer fall ill.");
    expect(mendTo("You raised it, so more people move to treatment.")).toBe("You raised it, so more people move to treatment.");
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

describe("[R05] a closing line's own words, the paper's quote taken out (ADR-0042)", () => {
  it("drops the sentence that quotes the paper, keeping the world's words and their question", () => {
    const text = "Doubling the progression rate made the infectious peak more than four million higher. The town is already above the threshold. The paper says, 'The results suggest that optimal conditions could lead to the elimination of TB.' What would happen?";
    expect(narrationOf(text, "The results suggest that optimal conditions could lead to the elimination of TB.")).toBe("Doubling the progression rate made the infectious peak more than four million higher. The town is already above the threshold. What would happen?");
    expect(narrationOf("Adherence helps. As the authors note, \"adherence matters\".", null)).toBe("Adherence helps.");
    expect(narrationOf("Adherence helps, as the model shows.", null)).toBe("Adherence helps, as the model shows.");
    expect(narrationOf("The paper finds \"adherence matters\". It helps.", null)).toBe("It helps.");
  });
});
