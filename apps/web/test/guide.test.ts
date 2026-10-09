import { describe, expect, it } from "vitest";
import { describeReading, guideLines, trendOf, type GuideInput } from "../src/hook/guide.ts";
import { FLOCKING } from "../src/world/authored-world.ts";

const levelOf = (id: string) => {
  const level = FLOCKING.levels.find((entry) => entry.id === id);
  if (!level) throw new Error(`no level ${id}`);
  return level;
};

/** The guide's lines for a level of the authored world, as the hook shows them. */
const linesFor = (id: string, input: GuideInput) => {
  const level = levelOf(id);
  return guideLines(level.guide, { min: level.action.range[0], step: level.action.step }, level.observable, input);
};

describe("the guide, from the hook level's script", () => {
  const base = { lastAction: null, value: 2, observed: 0.42, trend: "steady", playing: true, depth: "intermediate" } as const;

  it("says what the learner did, as a teaching choice, and what was measured, as a computed observation", () => {
    const [did, saw] = linesFor("hook", { ...base, lastAction: { from: 2, to: 3.5 }, value: 3.5 });
    expect(did.origin).toBe("teaching-choice");
    expect(did.text).toBe("You raised Move together to 3.50, so birds turn harder toward their neighbours' heading.");
    expect(saw.origin).toBe("computed-observation");
    expect(saw.text).toBe("Agreement 0.4 and holding: headings are only partly shared.");
  });

  it("reacts to a lower setting, to the lowest, and to none at all", () => {
    expect(linesFor("hook", { ...base, lastAction: { from: 2, to: 1 }, value: 1 })[0].text).toBe(
      "You lowered Move together to 1.00, so birds care less which way their neighbours fly.",
    );
    expect(linesFor("hook", { ...base, lastAction: { from: 1, to: 0 }, value: 0 })[0].text).toBe("At 0, no bird matches its neighbours' heading at all.");
    expect(linesFor("hook", base)[0].text).toBe("No bird leads. Each one steers only by the few it can see.");
  });

  it("uses words and no numbers at Beginner, as the slider does", () => {
    const [did, saw] = linesFor("hook", { ...base, depth: "beginner", lastAction: { from: 2, to: 3.5 }, value: 3.5, observed: 0.72, trend: "rising" });
    expect(did.text).toBe("You raised Move together, so birds turn harder toward their neighbours' heading.");
    expect(saw.text).toBe("Most birds head the same way, and more are joining in.");
    expect(`${did.text} ${saw.text}`).not.toMatch(/\d/);
  });

  it("names the measure itself at Advanced", () => {
    expect(linesFor("hook", { ...base, depth: "advanced", observed: 0.913 })[1].text).toBe("Directional agreement 0.91 and holding: nearly every bird heads the same way.");
  });

  it("names the trend while playing, and says it is paused when it is", () => {
    expect(linesFor("hook", { ...base, trend: "rising" })[1].text).toContain("and rising");
    expect(linesFor("hook", { ...base, depth: "beginner", trend: "falling" })[1].text).toContain("drifting apart");
    expect(linesFor("hook", { ...base, trend: "rising", playing: false })[1].text).toBe("Paused. Agreement 0.4: headings are only partly shared.");
  });
});

describe("the guide, from the other levels' scripts", () => {
  it("reads spacing in world units and its own trend words on the separation level", () => {
    const input = { lastAction: { from: 1.05, to: 0.1 }, value: 0.1, observed: 1.234, trend: "falling", playing: true, depth: "intermediate" } as const;
    const [did, saw] = linesFor("idea", input);
    expect(did.text).toBe("You shrank each bird's personal space to 0.10, so birds let others crowd in.");
    expect(saw.text).toBe("Spacing 1.2 and shrinking: birds are flying close together.");
    expect(linesFor("idea", { ...input, depth: "beginner" })[1].text).toBe("Birds are flying close together, and they are bunching up.");
  });

  it("reads the spread in world units on the cohesion level", () => {
    const input = { lastAction: { from: 0.4, to: 0 }, value: 0, observed: 12.34, trend: "rising", playing: true, depth: "advanced" } as const;
    const [did, saw] = linesFor("method", input);
    expect(did.text).toBe("At 0, nothing pulls a bird back toward the others.");
    expect(saw.text).toBe("Spread of the largest group 12.3 and widening: the flock is spread across the valley.");
    expect(linesFor("method", { ...input, depth: "intermediate", observed: 5.24, trend: "steady" })[1].text).toBe("Spread 5 and holding: the flock holds together.");
  });

  it("uses the slider's own step for the number it quotes", () => {
    const input = { lastAction: { from: 9, to: 14 }, value: 14, observed: 0.9, trend: "steady", playing: true, depth: "intermediate" } as const;
    expect(linesFor("background", input)[0].text).toBe("You let each bird see further to 14.0, so news of a turn reaches more birds at once.");
  });
});

describe("the guide's readings and trends", () => {
  const readings = levelOf("hook").guide.readings;

  it("reads a value in the words of the first threshold it reaches", () => {
    expect(describeReading(readings, 0.95)).toBe("nearly every bird heads the same way");
    expect(describeReading(readings, 0.7)).toBe("most birds head the same way");
    expect(describeReading(readings, 0.4)).toBe("headings are only partly shared");
    expect(describeReading(readings, 0.1)).toBe("headings are scattered");
  });

  it("calls a change of more than the level's threshold across the recent readouts a trend", () => {
    expect(trendOf([0.4, 0.45, 0.5], 0.03)).toBe("rising");
    expect(trendOf([0.5, 0.49, 0.45], 0.03)).toBe("falling");
    expect(trendOf([0.5, 0.52, 0.51], 0.03)).toBe("steady");
    expect(trendOf([0.5], 0.03)).toBe("steady");
    expect(trendOf([1, 1, 2], 0.5)).toBe("rising");
  });
});
