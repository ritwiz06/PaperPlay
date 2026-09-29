import { describe, expect, it } from "vitest";
import { Action, PrimitiveRef } from "../src/index.ts";
import { action, anchor, issuesOf } from "./examples.ts";

describe("[R03] PrimitiveRef", () => {
  it("accepts a dotted id with an exact semantic version", () => {
    expect(issuesOf(PrimitiveRef, { id: "flock.planar.weighted", version: "1.0.0" })).toEqual([]);
    expect(issuesOf(PrimitiveRef, { id: "hill.doseResponse", version: "12.4.10" })).toEqual([]);
  });

  it("rejects version ranges, tags and partial versions", () => {
    for (const version of ["^1.0.0", "~1.0.0", "1.0", "latest", "01.0.0", "1.0.0-beta.1", ""]) {
      expect(issuesOf(PrimitiveRef, { id: "flock.planar.weighted", version }), version).toEqual([
        { code: "invalid_format", path: "version" },
      ]);
    }
  });

  it("rejects ids that are not dotted camelCase segments", () => {
    for (const id of ["flock", "Flock.planar", "flock..planar", "flock.planar weighted", "flock.2d", ""]) {
      expect(issuesOf(PrimitiveRef, { id, version: "1.0.0" }), id).toEqual([{ code: "invalid_format", path: "id" }]);
    }
  });

  it("rejects unknown keys", () => {
    expect(issuesOf(PrimitiveRef, { id: "flock.planar.weighted", version: "1.0.0", latest: true })).toEqual([
      { code: "unrecognized_keys", path: "" },
    ]);
  });
});

describe("[R03] Action", () => {
  it("accepts a teaching-choice action without anchors", () => {
    expect(issuesOf(Action, action())).toEqual([]);
  });

  it("accepts a paper-derived action that carries an anchor", () => {
    expect(issuesOf(Action, { ...action(), origin: "paper-derived", anchors: [anchor()] })).toEqual([]);
  });

  it("rejects a paper-derived action without anchors", () => {
    expect(issuesOf(Action, { ...action(), origin: "paper-derived", anchors: [] })).toEqual([
      { code: "custom", path: "anchors" },
    ]);
  });

  it("rejects a range whose minimum is not below its maximum", () => {
    expect(issuesOf(Action, { ...action(), range: [2, 0] })).toEqual([
      { code: "custom", path: "range" },
      { code: "custom", path: "defaultValue" },
    ]);
    expect(issuesOf(Action, { ...action(), range: [1, 1] })).toEqual([{ code: "custom", path: "range" }]);
  });

  it("rejects a default value outside the range", () => {
    expect(issuesOf(Action, { ...action(), defaultValue: 2.5 })).toEqual([{ code: "custom", path: "defaultValue" }]);
    expect(issuesOf(Action, { ...action(), defaultValue: -0.1 })).toEqual([{ code: "custom", path: "defaultValue" }]);
  });

  it("rejects non-finite numbers", () => {
    expect(issuesOf(Action, { ...action(), range: [0, Infinity] })).toEqual([{ code: "invalid_type", path: "range.1" }]);
    expect(issuesOf(Action, { ...action(), defaultValue: Number.NaN })).toEqual([
      { code: "invalid_type", path: "defaultValue" },
    ]);
  });

  it("rejects a target variable that is not a camelCase parameter name", () => {
    for (const targetVariable of ["alignment weight", "AlignmentWeight", "alignment-weight", ""]) {
      expect(issuesOf(Action, { ...action(), targetVariable }), targetVariable).toEqual([
        { code: "invalid_format", path: "targetVariable" },
      ]);
    }
  });

  it("rejects an unknown origin and unknown keys", () => {
    expect(issuesOf(Action, { ...action(), origin: "verified" })).toEqual([{ code: "invalid_value", path: "origin" }]);
    expect(issuesOf(Action, { ...action(), scoring: true })).toEqual([{ code: "unrecognized_keys", path: "" }]);
  });

  it("requires an explicit unit", () => {
    expect(issuesOf(Action, { ...action(), unit: "" })).toEqual([{ code: "too_small", path: "unit" }]);
  });
});
