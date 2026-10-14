import { describe, expect, it } from "vitest";
import { contrastRatio, DEFAULT_CAMERA, portraitFit, viewAspect } from "../src/stage-core/index.ts";
import { describeTown, FIGURES, figureCompartments, figureCounts, shareInWords, townCamera, townDay, townStage, type TownInput } from "../src/stage-core/kits/town/index.ts";

// The town kit's pure half (ADR-0029): a compartment model's shares as 120 figures. The figures
// are a picture of the shares, never a second model: their counts come from the shares alone,
// a figure only ever moves forward through the compartments as an epidemic moves people
// forward, and describing a frame changes nothing it is given.

const input = (shares: readonly number[], time = 3): TownInput => ({ previous: shares, current: shares, alpha: 1, timeBefore: time, timeNow: time });

describe("the town kit's figures", () => {
  it("count each share's figures by largest remainder, so they always add up to 120", () => {
    expect(figureCounts([1, 0, 0])).toEqual([120, 0, 0]);
    expect(figureCounts([0.5, 0.25, 0.25])).toEqual([60, 30, 30]);
    // 120 × (0.334, 0.333, 0.333) = 40.08, 39.96, 39.96: the remainders give the two left over to the larger fractions.
    expect(figureCounts([0.334, 0.333, 0.333])).toEqual([40, 40, 40]);
    for (const shares of [[0.991, 0.004, 0.005], [0.059, 0.002, 0.939], [1 / 3, 1 / 3, 1 / 3], [0.2, 0.3, 0.1, 0.4]]) {
      expect(figureCounts(shares).reduce((sum, count) => sum + count, 0), JSON.stringify(shares)).toBe(FIGURES);
    }
  });

  it("count a share below zero or not a number as none, and with nothing at all, put every figure in the first compartment", () => {
    expect(figureCounts([-0.1, 1, Number.NaN])).toEqual([0, 120, 0]);
    expect(figureCounts([0, 0, 0])).toEqual([120, 0, 0]);
  });

  it("move each figure only forward through the compartments as people move from the first to the last", () => {
    // An epidemic's shares: still well falls, the removed rise, the ill rise and fall.
    let previous = figureCompartments(figureCounts([1, 0, 0]));
    for (let t = 1; t <= 200; t++) {
      const removed = Math.min(1, t / 160);
      const ill = Math.max(0, Math.sin((Math.PI * t) / 200) * 0.3 * (1 - removed));
      const now = figureCompartments(figureCounts([Math.max(0, 1 - ill - removed), ill, removed]));
      for (let figure = 0; figure < FIGURES; figure++) expect(now[figure], `figure ${figure} at step ${t}`).toBeGreaterThanOrEqual(previous[figure] ?? 0);
      previous = now;
    }
  });

  it("colour each figure by its compartment, and ring the ill, so illness never shows by colour alone", () => {
    const frame = describeTown(input([0.5, 0.25, 0.25]), DEFAULT_CAMERA, townDay);
    expect(frame.figures).toHaveLength(FIGURES);
    for (const figure of frame.figures) {
      expect(figure.color).toBe(townDay.figures[figure.compartment]);
      expect(figure.ring).toBe(figure.compartment === 1);
    }
    expect(townStage.marks?.(frame).figuresByCompartment).toBe("60 30 30");
  });
});

describe("the town kit's colours and words", () => {
  it("keeps every figure's colour, and the ill figures' ring, at 3:1 against the ground and the plaza", () => {
    for (const colour of [...townDay.figures, townDay.ring]) {
      for (const behind of [townDay.ground, townDay.plaza]) expect(contrastRatio(colour, behind), `${colour} on ${behind}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("paints the ill warm orange and the recovered or removed soft blue-grey, apart from the still well (owner, 2026-10-14)", () => {
    expect(townDay.figures.slice(0, 3)).toEqual(["#f8faee", "#f6ae66", "#b3c4d2"]);
  });

  it("says a share in words at Beginner, from none to all", () => {
    expect([0, 0.01, 0.1, 0.3, 0.5, 0.8, 0.95, 1].map(shareInWords)).toEqual(["none", "hardly any", "a few", "some", "about half", "most", "nearly all", "all"]);
  });
});

describe("the town kit's frames", () => {
  it("frame the town closer than the stage's back-off on a narrow screen, and leave a wide one as it is", () => {
    const wide = { ...DEFAULT_CAMERA, aspect: 16 / 9 };
    expect(townCamera(wide)).toEqual(wide);
    const phone = { ...DEFAULT_CAMERA, aspect: 390 / 844 };
    const backOff = portraitFit(viewAspect(phone));
    expect(backOff).toBeGreaterThan(1);
    expect(townCamera(phone).distance).toBeLessThan(phone.distance);
    expect(townCamera(phone).distance * backOff).toBeGreaterThan(phone.distance);
  });

  it("are pure: the same input gives the same frame, and the input is left as it was", () => {
    const given = input([0.7, 0.2, 0.1], 12.5);
    const copy = structuredClone(given);
    expect(JSON.stringify(describeTown(given, DEFAULT_CAMERA, townDay))).toBe(JSON.stringify(describeTown(given, DEFAULT_CAMERA, townDay)));
    expect(given).toEqual(copy);
  });

  it("walk the figures by the model's time alone: the shares change their colours, never where they stand", () => {
    const early = describeTown(input([0.9, 0.1, 0], 7), DEFAULT_CAMERA, townDay);
    const later = describeTown(input([0.1, 0.1, 0.8], 7), DEFAULT_CAMERA, townDay);
    expect(later.figures.map((figure) => figure.position)).toEqual(early.figures.map((figure) => figure.position));
    expect(later.figures.map((figure) => figure.compartment)).not.toEqual(early.figures.map((figure) => figure.compartment));
  });

  it("blend the shares between two states as the stage draws between steps", () => {
    const between = describeTown({ previous: [1, 0, 0], current: [0, 0, 1], alpha: 0.5, timeBefore: 0, timeNow: 1 }, DEFAULT_CAMERA, townDay);
    expect(townStage.marks?.(between).figuresByCompartment).toBe("60 0 60");
  });
});
