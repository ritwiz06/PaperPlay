import { describe, expect, it } from "vitest";
import { describeAgreement, guideLines, trendOf } from "../src/hook/guide.ts";

describe("the hook level's guide", () => {
  const base = { lastAction: null, alignment: 2, agreement: 0.42, trend: "steady", playing: true, depth: "intermediate" } as const;

  it("says what the learner did, as a teaching choice, and what was measured, as a computed observation", () => {
    const [did, saw] = guideLines({ ...base, lastAction: { from: 2, to: 3.5 }, alignment: 3.5 });
    expect(did.origin).toBe("teaching-choice");
    expect(did.text).toBe("You raised Move together to 3.50, so birds turn harder toward their neighbours' heading.");
    expect(saw.origin).toBe("computed-observation");
    expect(saw.text).toBe("Agreement 0.4 and holding: headings are only partly shared.");
  });

  it("reacts to a lower setting, to the lowest, and to none at all", () => {
    expect(guideLines({ ...base, lastAction: { from: 2, to: 1 }, alignment: 1 })[0].text).toBe(
      "You lowered Move together to 1.00, so birds care less which way their neighbours fly.",
    );
    expect(guideLines({ ...base, lastAction: { from: 1, to: 0 }, alignment: 0 })[0].text).toBe("At 0, no bird matches its neighbours' heading at all.");
    expect(guideLines(base)[0].text).toBe("No bird leads. Each one steers only by the few it can see.");
  });

  it("uses words and no numbers at Beginner, as the slider does", () => {
    const [did, saw] = guideLines({ ...base, depth: "beginner", lastAction: { from: 2, to: 3.5 }, alignment: 3.5, agreement: 0.72, trend: "rising" });
    expect(did.text).toBe("You raised Move together, so birds turn harder toward their neighbours' heading.");
    expect(saw.text).toBe("Most birds head the same way, and more are joining in.");
    expect(`${did.text} ${saw.text}`).not.toMatch(/\d/);
  });

  it("names the measure itself at Advanced", () => {
    expect(guideLines({ ...base, depth: "advanced", agreement: 0.913 })[1].text).toBe("Directional agreement 0.91 and holding: nearly every bird heads the same way.");
  });

  it("names the trend while playing, and says it is paused when it is", () => {
    expect(guideLines({ ...base, trend: "rising" })[1].text).toContain("and rising");
    expect(guideLines({ ...base, depth: "beginner", trend: "falling" })[1].text).toContain("drifting apart");
    const paused = guideLines({ ...base, trend: "rising", playing: false })[1].text;
    expect(paused).toBe("Paused. Agreement 0.4: headings are only partly shared.");
  });

  it("reads agreement in plain words, at fixed thresholds", () => {
    expect(describeAgreement(0.95)).toBe("nearly every bird heads the same way");
    expect(describeAgreement(0.7)).toBe("most birds head the same way");
    expect(describeAgreement(0.4)).toBe("headings are only partly shared");
    expect(describeAgreement(0.1)).toBe("headings are scattered");
  });

  it("calls a change of more than 0.03 across the recent readouts a trend", () => {
    expect(trendOf([0.4, 0.45, 0.5])).toBe("rising");
    expect(trendOf([0.5, 0.49, 0.45])).toBe("falling");
    expect(trendOf([0.5, 0.52, 0.51])).toBe("steady");
    expect(trendOf([0.5])).toBe("steady");
  });
});
