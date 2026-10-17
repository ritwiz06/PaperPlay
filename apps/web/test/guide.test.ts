import { describe, expect, it } from "vitest";
import { acrossWords, describeReading, explorationLines, guideLines, trendOf, type GuideInput } from "../src/hook/guide.ts";
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

  it("reads a line written with its own 'to' before the value's place as one 'to', at every depth", () => {
    const script = { ...levelOf("hook").guide, raised: "You raise treatment adherence to {to}, so fewer people quit treatment." };
    const lines = (depth: GuideInput["depth"]) => guideLines(script, { min: 0, step: 0.01 }, levelOf("hook").observable, { ...base, depth, lastAction: { from: 0.5, to: 0.61 }, value: 0.61 })[0].text;
    expect(lines("intermediate")).toBe("You raise treatment adherence to 0.61, so fewer people quit treatment.");
    expect(lines("beginner")).toBe("You raise treatment adherence, so fewer people quit treatment.");
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

describe("[R06] guided exploration, from level 2's script", () => {
  const level = levelOf("background");
  const exploration = level.exploration;
  if (!exploration) throw new Error("level 2 asks for a prediction");
  const claim = level.fork.difference.claim;
  const lines = (state: Partial<Parameters<typeof explorationLines>[2]>) =>
    explorationLines(exploration, claim, { predicted: 0, change: "How far a bird sees at 50", done: false, holdsHere: null, ...state });

  it("asks before the fork, with choices none of which is marked right", () => {
    expect(exploration.predictPrompt).toBe("If every bird could see the whole flock, would the flock come to agree faster?");
    expect(exploration.choices).toEqual(["Faster", "About the same, or slower"]);
    expect(Object.keys(exploration)).not.toContain("correct");
  });

  it("repeats the prediction and names the intervention while both worlds run", () => {
    expect(lines({}).map((line) => line.text)).toEqual(["You said: Faster.", "Now both worlds run, the other with How far a bird sees at 50. Watch the chart."]);
  });

  it("reports this sky and the 20 skies as measured, then the paper, then the question, never scoring", () => {
    const done = lines({ predicted: 0, done: true, holdsHere: false });
    expect(done.map((line) => [line.origin, line.text])).toEqual([
      ["learner", "You said: Faster."],
      ["computed-observation", "On this sky: About the same, or slower."],
      ["computed-observation", "Across 20 skies: Faster on 6, about the same, or slower on 14."],
      ["paper-derived", "The paper argues that a bird perceives only the flockmates near it, and says why that locality matters."],
      ["teaching-choice", "Why might seeing more birds not help a flock agree sooner?"],
    ]);
    expect(done[3]?.placeholder).toBe(true);
    const words = done.map((line) => line.text).join(" ");
    expect(words).not.toMatch(/\b(right|wrong|correct|incorrect|score|points?)\b/i);
  });

  it("gives the paper's own words their own line and origin, after the world's words (ADR-0042)", () => {
    const split = { ...exploration, explanation: { text: "The other world's peak was higher.", origin: "teaching-choice" as const, anchors: [] }, paperSays: { text: "“The flock forms by itself.”", origin: "paper-derived" as const, anchors: exploration.explanation.anchors } };
    const done = explorationLines(split, claim, { predicted: 0, change: "x", done: true, holdsHere: true });
    expect(done.slice(3).map((line) => [line.origin, line.text])).toEqual([
      ["teaching-choice", "The other world's peak was higher."],
      ["paper-derived", "The paper: “The flock forms by itself.”"],
      ["teaching-choice", "Why might seeing more birds not help a flock agree sooner?"],
    ]);
  });
});

describe("[R06] the guide in a share world's unit (ADR-0042)", () => {
  const level = levelOf("hook");
  it("writes the reading and its words as people in the town, never as shares", () => {
    const script = { ...level.guide, readings: [{ atLeast: 0.01, words: "recovered is above 0.01" }, { atLeast: 0, words: "hardly any" }] };
    const [, saw] = guideLines(script, { min: 0, step: 0.01 }, level.observable, { lastAction: null, value: 0.5, observed: 0.0233, trend: "steady", playing: true, depth: "intermediate", scale: { factor: 10_000, unit: "people" } });
    expect(saw.text).toMatch(/ 233 people and .*: recovered is above 100 people\.$/);
  });
});

describe("[R06] guided exploration on every level", () => {
  const SCORING = /\b(right|wrong|correct|incorrect|score|points?)\b/i;

  it("asks for a prediction before every What-if, with two choices, on the level's own control and readout", () => {
    for (const level of FLOCKING.levels) {
      const exploration = level.exploration;
      expect(exploration, level.id).not.toBeNull();
      expect(exploration?.choices, level.id).toHaveLength(2);
      expect(exploration?.interveneActionId, level.id).toBe(level.action.actionId);
      expect(exploration?.observeMetricId, level.id).toBe(level.observable.metricId);
      expect([exploration?.predictPrompt, ...(exploration?.choices ?? []), exploration?.explainPrompt].join(" "), level.id).not.toMatch(SCORING);
    }
  });

  it("reports a sky-by-sky claim as measured: this sky by the choice it bears out, then the rule across 20 skies", () => {
    for (const level of FLOCKING.levels.filter((entry) => entry.fork.difference.claim.kind === "each")) {
      const exploration = level.exploration;
      if (!exploration) throw new Error(`${level.id} asks for a prediction`);
      const [first, second] = exploration.choices;
      for (const holdsHere of [true, false]) {
        const done = explorationLines(exploration, level.fork.difference.claim, { predicted: 1, change: "x", done: true, holdsHere });
        expect(done.map((line) => line.text), level.id).toEqual([
          `You said: ${second ?? ""}.`,
          `On this sky: ${(holdsHere ? first : second) ?? ""}.`,
          "Across 20 skies, the level's statement holds on at least 16.",
          exploration.explanation.text,
          exploration.explainPrompt,
        ]);
      }
    }
  });
});

describe("[R06] where the level rule checked a statement", () => {
  it("says 20 skies for a flock, and the world's values and 19 near them for a model with no chance in it", () => {
    expect(acrossWords({ one: "sky", many: "skies", on: "on" }, "seeds")).toBe("Across 20 skies");
    expect(acrossWords({ one: "town", many: "towns", on: "in" }, "neighbourhood")).toBe("Across 20 towns, this world's values and 19 within a tenth of them");
  });
});
