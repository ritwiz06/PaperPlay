import { describe, expect, it } from "vitest";
import { describeAgreement, guideLines, trendOf } from "../src/hook/guide.ts";

describe("the hook spike's guide", () => {
  const base = { lastAction: null, alignment: 2, agreement: 0.42, trend: "steady", playing: true, depth: "beginner" } as const;

  it("says two things: what the learner did, as a teaching choice, and what was measured, as a computed observation", () => {
    const [did, saw] = guideLines({ ...base, lastAction: { from: 2, to: 3.5 }, alignment: 3.5 });
    expect(did.origin).toBe("teaching-choice");
    expect(did.text).toContain("raised Move together to 3.50");
    expect(saw.origin).toBe("computed-observation");
    expect(saw.text).toContain("0.4");
  });

  it("reacts to a lower setting, and to none at all", () => {
    expect(guideLines({ ...base, lastAction: { from: 2, to: 1 }, alignment: 1 })[0].text).toContain("lowered Move together to 1.00");
    expect(guideLines({ ...base, lastAction: { from: 1, to: 0 }, alignment: 0 })[0].text).toContain("At 0, no bird");
    expect(guideLines(base)[0].text).toContain("No bird leads");
  });

  it("names the trend while playing, and says it is paused when it is", () => {
    expect(guideLines({ ...base, trend: "rising" })[1].text).toContain("rising");
    const paused = guideLines({ ...base, trend: "rising", playing: false })[1].text;
    expect(paused).toContain("Paused");
    expect(paused).not.toContain("rising");
  });

  it("puts the measure itself in the words at Advanced", () => {
    expect(guideLines({ ...base, depth: "advanced" })[1].text).toContain("Directional agreement");
    expect(guideLines({ ...base, depth: "beginner" })[1].text).not.toContain("Directional agreement");
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
