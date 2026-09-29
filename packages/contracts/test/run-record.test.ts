import { describe, expect, it } from "vitest";
import { RunRecord } from "../src/index.ts";
import { issuesOf, runRecord, sha } from "./examples.ts";

describe("[R03] RunRecord", () => {
  it("accepts a complete record", () => {
    expect(issuesOf(RunRecord, runRecord())).toEqual([]);
  });

  it("requires schemaVersion runrecord/1", () => {
    expect(issuesOf(RunRecord, { ...runRecord(), schemaVersion: "runrecord/0" })).toEqual([
      { code: "invalid_value", path: "schemaVersion" },
    ]);
  });

  it("rejects unknown keys at the top level, in events and in the runtime", () => {
    expect(issuesOf(RunRecord, { ...runRecord(), score: 10 })).toEqual([{ code: "unrecognized_keys", path: "" }]);
    const events = [{ step: 0, actionId: "alignment-strength", value: 1, label: "extra" }];
    expect(issuesOf(RunRecord, { ...runRecord(), events })).toEqual([{ code: "unrecognized_keys", path: "events.0" }]);
    const runtime = { engine: "node 24.21.0", os: "darwin arm64", gpu: "none" };
    expect(issuesOf(RunRecord, { ...runRecord(), runtime })).toEqual([{ code: "unrecognized_keys", path: "runtime" }]);
  });

  it("requires the full initial state, not just a seed", () => {
    const { initialState: _state, ...withoutState } = runRecord();
    expect(issuesOf(RunRecord, withoutState)).toEqual([{ code: "invalid_type", path: "initialState" }]);
    expect(issuesOf(RunRecord, { ...runRecord(), initialState: null })).toEqual([{ code: "custom", path: "initialState" }]);
  });

  it("requires the seed to be an unsigned 32-bit integer", () => {
    expect(issuesOf(RunRecord, { ...runRecord(), seed: 0 })).toEqual([]);
    expect(issuesOf(RunRecord, { ...runRecord(), seed: 4294967295 })).toEqual([]);
    expect(issuesOf(RunRecord, { ...runRecord(), seed: -1 })).toEqual([{ code: "too_small", path: "seed" }]);
    expect(issuesOf(RunRecord, { ...runRecord(), seed: 4294967296 })).toEqual([{ code: "too_big", path: "seed" }]);
    expect(issuesOf(RunRecord, { ...runRecord(), seed: 1.5 })).toEqual([{ code: "invalid_type", path: "seed" }]);
  });

  it("requires events in non-decreasing step order", () => {
    const events = [
      { step: 120, actionId: "alignment-strength", value: 0 },
      { step: 60, actionId: "alignment-strength", value: 1 },
    ];
    expect(issuesOf(RunRecord, { ...runRecord(), events })).toEqual([{ code: "custom", path: "events.1.step" }]);
  });

  it("rejects negative or fractional event steps", () => {
    const negative = [{ step: -1, actionId: "alignment-strength", value: 0 }];
    expect(issuesOf(RunRecord, { ...runRecord(), events: negative })).toEqual([{ code: "too_small", path: "events.0.step" }]);
    const fractional = [{ step: 1.5, actionId: "alignment-strength", value: 0 }];
    expect(issuesOf(RunRecord, { ...runRecord(), events: fractional })).toEqual([
      { code: "invalid_type", path: "events.0.step" },
    ]);
  });

  it("requires sha256 identity hashes for the spec, code and lockfile", () => {
    for (const key of ["worldSpecHash", "codeHash", "lockHash"] as const) {
      expect(issuesOf(RunRecord, { ...runRecord(), [key]: "abc123" }), key).toEqual([{ code: "invalid_format", path: key }]);
    }
    expect(issuesOf(RunRecord, { ...runRecord(), codeHash: sha("f") })).toEqual([]);
  });

  it("requires a positive timestep and a non-negative tolerance", () => {
    expect(issuesOf(RunRecord, { ...runRecord(), timestep: 0 })).toEqual([{ code: "too_small", path: "timestep" }]);
    expect(issuesOf(RunRecord, { ...runRecord(), tolerance: -1e-9 })).toEqual([{ code: "too_small", path: "tolerance" }]);
    expect(issuesOf(RunRecord, { ...runRecord(), tolerance: 0 })).toEqual([]);
  });

  it("requires observables to be arrays of finite numbers", () => {
    expect(issuesOf(RunRecord, { ...runRecord(), observables: { directionalAgreement: [0.1, Infinity] } })).toEqual([
      { code: "invalid_type", path: "observables.directionalAgreement.1" },
    ]);
  });
});
