import type { MeasuredDifference } from "@paperplay/contracts";
import { describe, expect, it } from "vitest";
import { claimHolds, SAMPLE_STEPS, sampleCount, summarise } from "../src/index.ts";

// Summaries and claims worked by hand. Samples every 6 steps at 1/60 s are 0.1 s apart.
const DT = 1 / 60;
const difference = (summary: MeasuredDifference["summary"], seconds = 1): MeasuredDifference => ({
  metricId: "directionalAgreement",
  label: "test",
  unit: "fraction from 0 to 1",
  summary,
  seconds,
  claim: { kind: "each", relation: "lower", by: 0 },
});
const samples = [0.1, 0.3, 0.5, 0.9, 0.95, 0.4, 0.2, 0.6, 0.7, 0.8, 0.85];

describe("[R08] the measured difference", () => {
  it("samples every 6 steps, step 0 and the last included", () => {
    expect(SAMPLE_STEPS).toBe(6);
    expect(sampleCount(1, DT)).toBe(11);
    expect(sampleCount(20, DT)).toBe(201);
  });

  it("reads the value at a time", () => {
    expect(summarise(difference({ kind: "at", seconds: 0.5 }), samples, DT)).toBe(0.4);
    expect(summarise(difference({ kind: "at", seconds: 1 }), samples, DT)).toBe(0.85);
  });

  it("reads when a threshold is first reached, and never as later than any time", () => {
    expect(summarise(difference({ kind: "first-reach", threshold: 0.9 }), samples, DT)).toBeCloseTo(0.3, 12);
    expect(summarise(difference({ kind: "first-reach", threshold: 0.99 }), samples, DT)).toBe(Number.POSITIVE_INFINITY);
  });

  it("reads the lowest value from a time on", () => {
    expect(summarise(difference({ kind: "lowest", from: 0.4 }), samples, DT)).toBe(0.2);
    expect(summarise(difference({ kind: "lowest", from: 0 }), samples, DT)).toBe(0.1);
  });

  it("totals the samples before the level's time ends, each times 0.1 s", () => {
    // 0.1 + 0.3 + 0.5 + 0.9 + 0.95 + 0.4 + 0.2 + 0.6 + 0.7 + 0.8 = 5.45, times 0.1.
    expect(summarise(difference({ kind: "total" }), samples, DT)).toBeCloseTo(0.545, 12);
  });

  it("reads the peak and the average, the average over the samples before the level's time ends (ADR-0037)", () => {
    const v3 = (summary: { kind: "peak" } | { kind: "mean" }) => ({ summary });
    expect(summarise(v3({ kind: "peak" }), samples, DT)).toBe(0.95);
    // The same ten samples as the total, averaged: 5.45 / 10.
    expect(summarise(v3({ kind: "mean" }), samples, DT)).toBeCloseTo(0.545, 12);
  });

  it("checks a claim sky by sky: by more than the margin, and more than the ratio", () => {
    expect(claimHolds({ kind: "each", relation: "lower", by: 0.5 }, 0.9, 0.3)).toBe(true);
    expect(claimHolds({ kind: "each", relation: "lower", by: 0.5 }, 0.9, 0.4)).toBe(false);
    expect(claimHolds({ kind: "each", relation: "higher", by: 0, times: 3 }, 1, 3.1)).toBe(true);
    expect(claimHolds({ kind: "each", relation: "higher", by: 0, times: 3 }, 1, 3)).toBe(false);
    expect(claimHolds({ kind: "each", relation: "higher", by: 0, times: 3 }, 0, 0.1)).toBe(true);
  });

  it("treats never reaching a threshold as later than any time", () => {
    expect(claimHolds({ kind: "each", relation: "higher", by: 10 }, 17, Number.POSITIVE_INFINITY)).toBe(true);
    expect(claimHolds({ kind: "count", relation: "lower", by: 1, holds: 6 }, Number.POSITIVE_INFINITY, 20)).toBe(true);
    expect(claimHolds({ kind: "each", relation: "higher", by: 10 }, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)).toBe(false);
  });
});
