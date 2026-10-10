import { describe, expect, it } from "vitest";
import { RunRecord } from "../src/index.ts";
import { issuesOf, runRecord, sha } from "./examples.ts";

const withEvents = (events: unknown[]) => ({ ...runRecord(), events });
const place = (step: number, entityId: string) => ({ kind: "place", step, entityId, entity: "beacon", x: 1, y: 1 });
const remove = (step: number, entityId: string) => ({ kind: "remove", step, entityId });

describe("[R03] RunRecord", () => {
  it("accepts a complete record with param, place and remove events", () => {
    expect(issuesOf(RunRecord, runRecord())).toEqual([]);
  });

  it("requires schemaVersion runrecord/3", () => {
    for (const schemaVersion of ["runrecord/1", "runrecord/2"]) {
      expect(issuesOf(RunRecord, { ...runRecord(), schemaVersion })).toEqual([{ code: "invalid_value", path: "schemaVersion" }]);
    }
  });

  it("keeps the learner's predictions in step order, within the run, each a choice by index and in words", () => {
    const prediction = (step: number) => ({ step, levelId: "hook", prompt: "Would it?", choice: 1, choiceText: "It would" });
    expect(issuesOf(RunRecord, { ...runRecord(), predictions: [] })).toEqual([]);
    expect(issuesOf(RunRecord, { ...runRecord(), predictions: [prediction(10), prediction(10), prediction(120)] })).toEqual([]);
    expect(issuesOf(RunRecord, { ...runRecord(), predictions: [prediction(40), prediction(20)] })).toEqual([{ code: "custom", path: "predictions.1.step" }]);
    expect(issuesOf(RunRecord, { ...runRecord(), predictions: [prediction(121)] })).toEqual([{ code: "custom", path: "predictions.0.step" }]);
    expect(issuesOf(RunRecord, { ...runRecord(), predictions: [{ ...prediction(1), choice: 0.5 }] })).toEqual([{ code: "invalid_type", path: "predictions.0.choice" }]);
    expect(issuesOf(RunRecord, { ...runRecord(), predictions: [{ ...prediction(1), correct: true }] })).toEqual([{ code: "unrecognized_keys", path: "predictions.0" }]);
    const { predictions: _predictions, ...without } = runRecord();
    expect(issuesOf(RunRecord, without)).toEqual([{ code: "invalid_type", path: "predictions" }]);
  });

  it("rejects unknown keys at the top level, in every kind of event and in the runtime", () => {
    expect(issuesOf(RunRecord, { ...runRecord(), score: 10 })).toEqual([{ code: "unrecognized_keys", path: "" }]);
    const param = { kind: "param", step: 0, actionId: "alignment-strength", value: 1, label: "extra" };
    expect(issuesOf(RunRecord, withEvents([param]))).toEqual([{ code: "unrecognized_keys", path: "events.0" }]);
    expect(issuesOf(RunRecord, withEvents([{ ...place(0, "b1"), radius: 2 }]))).toEqual([
      { code: "unrecognized_keys", path: "events.0" },
    ]);
    expect(issuesOf(RunRecord, withEvents([{ ...remove(0, "b1"), x: 1 }]))).toEqual([
      { code: "unrecognized_keys", path: "events.0" },
    ]);
    const runtime = { engine: "node 24.21.0", os: "darwin arm64", gpu: "none" };
    expect(issuesOf(RunRecord, { ...runRecord(), runtime })).toEqual([{ code: "unrecognized_keys", path: "runtime" }]);
  });

  it("rejects an event whose kind is not param, place or remove", () => {
    expect(issuesOf(RunRecord, withEvents([{ kind: "nudge", step: 0, actionId: "a", value: 1 }]))).toEqual([
      { code: "invalid_union", path: "events.0.kind" },
    ]);
    const { kind: _kind, ...unkinded } = { kind: "param", step: 0, actionId: "a", value: 1 };
    expect(issuesOf(RunRecord, withEvents([unkinded]))).toEqual([{ code: "invalid_union", path: "events.0.kind" }]);
  });

  it("places only beacons and obstacles, at finite coordinates, under an entity id", () => {
    expect(issuesOf(RunRecord, withEvents([{ ...place(0, "b1"), entity: "tree" }]))).toEqual([
      { code: "invalid_value", path: "events.0.entity" },
    ]);
    expect(issuesOf(RunRecord, withEvents([{ ...place(0, "b1"), x: Infinity }]))).toEqual([
      { code: "invalid_type", path: "events.0.x" },
    ]);
    const { entityId: _id, ...anonymous } = place(0, "b1");
    expect(issuesOf(RunRecord, withEvents([anonymous]))).toEqual([{ code: "invalid_type", path: "events.0.entityId" }]);
    expect(issuesOf(RunRecord, withEvents([remove(0, "not an id")]))).toEqual([
      { code: "invalid_format", path: "events.0.entityId" },
    ]);
  });

  it("rejects placing an entity twice, removing it twice, or removing it before it is placed", () => {
    expect(issuesOf(RunRecord, withEvents([place(0, "b1"), place(10, "b1")]))).toEqual([
      { code: "custom", path: "events.1.entityId" },
    ]);
    expect(issuesOf(RunRecord, withEvents([place(0, "b1"), remove(10, "b1"), remove(20, "b1")]))).toEqual([
      { code: "custom", path: "events.2.entityId" },
    ]);
    expect(issuesOf(RunRecord, withEvents([remove(0, "b1"), place(10, "b1")]))).toEqual([
      { code: "custom", path: "events.1.entityId" },
    ]);
  });

  it("allows removing an entity the initial state already held, which only replay can check", () => {
    expect(issuesOf(RunRecord, withEvents([remove(10, "rock-from-the-start")]))).toEqual([]);
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
      { kind: "param", step: 60, actionId: "alignment-strength", value: 0 },
      { kind: "param", step: 30, actionId: "alignment-strength", value: 1 },
    ];
    expect(issuesOf(RunRecord, withEvents(events))).toEqual([{ code: "custom", path: "events.1.step" }]);
  });

  it("rejects negative or fractional event steps, and events after the last step", () => {
    expect(issuesOf(RunRecord, withEvents([remove(-1, "b1")]))).toEqual([{ code: "too_small", path: "events.0.step" }]);
    expect(issuesOf(RunRecord, withEvents([remove(1.5, "b1")]))).toEqual([{ code: "invalid_type", path: "events.0.step" }]);
    expect(issuesOf(RunRecord, withEvents([remove(120, "b1")]))).toEqual([]);
    expect(issuesOf(RunRecord, withEvents([remove(121, "b1")]))).toEqual([{ code: "custom", path: "events.0.step" }]);
  });

  it("requires a positive whole sampleInterval and a non-negative whole totalSteps", () => {
    expect(issuesOf(RunRecord, { ...runRecord(), sampleInterval: 0 })).toEqual([{ code: "too_small", path: "sampleInterval" }]);
    expect(issuesOf(RunRecord, { ...runRecord(), sampleInterval: 1.5 })).toEqual([
      { code: "invalid_type", path: "sampleInterval" },
    ]);
    expect(issuesOf(RunRecord, { ...runRecord(), totalSteps: -1 })).toEqual([{ code: "too_small", path: "totalSteps" }]);
  });

  it("requires every observable series to hold floor(totalSteps / sampleInterval) + 1 samples", () => {
    const truncated = { directionalAgreement: [0.1, 0.4], clusterCount: [5, 3, 1] };
    expect(issuesOf(RunRecord, { ...runRecord(), observables: truncated })).toEqual([
      { code: "custom", path: "observables.directionalAgreement" },
    ]);
    const overlong = { directionalAgreement: [0.1, 0.4, 0.9, 1], clusterCount: [5, 3, 1] };
    expect(issuesOf(RunRecord, { ...runRecord(), observables: overlong })).toEqual([
      { code: "custom", path: "observables.directionalAgreement" },
    ]);
    // 130 steps sampled every 60 gives samples at steps 0, 60 and 120: still three.
    expect(issuesOf(RunRecord, { ...runRecord(), totalSteps: 130 })).toEqual([]);
  });

  it("requires at least one observable series", () => {
    expect(issuesOf(RunRecord, { ...runRecord(), observables: {} })).toEqual([{ code: "custom", path: "observables" }]);
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
    const observables = { directionalAgreement: [0.1, Infinity, 0.9], clusterCount: [5, 3, 1] };
    expect(issuesOf(RunRecord, { ...runRecord(), observables })).toEqual([
      { code: "invalid_type", path: "observables.directionalAgreement.1" },
    ]);
  });
});
