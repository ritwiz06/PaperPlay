import { describe, expect, it } from "vitest";
import { asPeople, claimWords, inDisplayUnits } from "../src/hook/units.ts";

// Every number in the unit the chart shows (ADR-0042): a share world's claims and readings in
// people in its town, as its chart and readout are.

const town = { factor: 10_000, unit: "people" };

describe("[R06] numbers in the chart's unit", () => {
  it("writes a share as people in the town, and leaves a world with no scale alone", () => {
    expect(asPeople(0.004, town)).toBe("40 people");
    expect(inDisplayUnits("Recovered is above 0.01.", town)).toBe("Recovered is above 100 people.");
    expect(inDisplayUnits("Peaks higher by more than .005, at 52% adherence, after 20 years.", town)).toBe("Peaks higher by more than 50 people, at 52% adherence, after 20 years.");
    expect(inDisplayUnits("Recovered is above 0.01.", null)).toBe("Recovered is above 0.01.");
  });

  it("writes a level's claim from its data, in the chart's unit", () => {
    expect(claimWords("Highest recovered within 200 years", { relation: "higher", by: 0.004 }, town)).toBe("Highest recovered within 200 years: the other world higher by more than 40 people.");
  });
});
