import { describe, expect, it } from "vitest";
import { JobState } from "../src/index.ts";

describe("[R03] JobState", () => {
  it("lists exactly the lifecycle and branch states, in order", () => {
    expect(JobState.options).toEqual([
      "received",
      "parsing",
      "planning",
      "building",
      "running",
      "checking",
      "ready",
      "needs_information",
      "unsupported",
      "repairing",
      "failed",
      "cancelled",
    ]);
  });

  it("rejects states outside the lifecycle", () => {
    for (const state of ["done", "verified", "success", "Ready", ""]) {
      expect(JobState.safeParse(state).success, state).toBe(false);
    }
  });
});
