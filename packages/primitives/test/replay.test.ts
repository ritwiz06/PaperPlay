import { RunRecord, type RunEvent } from "@paperplay/contracts";
import { describe, expect, it } from "vitest";
import { replayRecord, runEvents, type RunPlan } from "../src/index.ts";
import { flockDefaultParams, flockPlanarWeighted, type FlockState } from "../src/agents/flock/index.ts";

const flock = flockPlanarWeighted;
const setup = { primitive: flock, params: flockDefaultParams, actions: { "alignment-strength": "alignmentWeight" } };
const sha = (char: string): string => char.repeat(64);

const placeThenRemove: RunEvent[] = [
  { kind: "param", step: 30, actionId: "alignment-strength", value: 0.4 },
  { kind: "place", step: 60, entityId: "beacon-1", entity: "beacon", x: 8, y: 8 },
  { kind: "place", step: 90, entityId: "rock-1", entity: "obstacle", x: 20, y: 12 },
  { kind: "remove", step: 240, entityId: "beacon-1" },
];

const plan = (events: RunEvent[], totalSteps = 600): RunPlan<FlockState> => ({
  initialState: flock.init(flockDefaultParams, 42),
  events,
  totalSteps,
  sampleInterval: 30,
  timestep: flock.fixedTimestep,
});

/** Builds a record the way an export would, then sends it through JSON and the contract. */
function recorded(events: RunEvent[], overrides: Record<string, unknown> = {}): RunRecord {
  const run = plan(events);
  const { observables } = runEvents(setup, run);
  const record = {
    schemaVersion: "runrecord/3",
    runId: "replay-test",
    worldSpecHash: sha("a"),
    primitive: { id: flock.id, version: flock.version },
    codeHash: sha("b"),
    lockHash: sha("c"),
    seed: 42,
    initialState: run.initialState,
    timestep: run.timestep,
    sampleInterval: run.sampleInterval,
    totalSteps: run.totalSteps,
    events: run.events,
    predictions: [],
    observables,
    hashes: {},
    runtime: { engine: `node ${process.versions.node}`, os: process.platform },
    tolerance: 0,
    ...overrides,
  };
  return RunRecord.parse(JSON.parse(JSON.stringify(record)));
}

describe("[R07] run replay", () => {
  it("samples every sampleInterval steps from step 0, before that step's events", () => {
    const { observables } = runEvents(setup, plan(placeThenRemove));

    expect(observables.directionalAgreement).toHaveLength(600 / 30 + 1);
    expect(observables.directionalAgreement?.[0]).toBe(flock.measure(plan([]).initialState).directionalAgreement);
  });

  it("replays a place-then-remove run bit for bit from its JSON record", () => {
    const report = replayRecord(recorded(placeThenRemove), setup);

    expect(report.mismatches).toEqual([]);
    expect(report.matches).toBe(true);
    expect(report.maxDeviation).toBe(0);
    expect(report.finalState.beacons).toEqual([]);
    expect(report.finalState.obstacles).toEqual([{ id: "rock-1", x: 20, y: 12 }]);
  });

  it("replays a record's run exactly the same whatever predictions it carries: a prediction shapes nothing", () => {
    const predictions = [
      { step: 10, levelId: "hook", prompt: "Would the flock still line up?", choice: 0, choiceText: "It stays scattered" },
      { step: 300, levelId: "hook", prompt: "Would the flock still line up?", choice: 1, choiceText: "It still lines up" },
    ];
    const plain = replayRecord(recorded(placeThenRemove), setup);
    const noted = replayRecord(recorded(placeThenRemove, { predictions }), setup);
    expect(noted.matches).toBe(true);
    expect(noted.finalState).toEqual(plain.finalState);
  });

  it("lets the placed beacon shape the run while it exists", () => {
    const withBeacon = runEvents(setup, plan(placeThenRemove)).observables;
    const without = runEvents(setup, plan(placeThenRemove.filter((e) => e.kind === "param" || e.entityId === "rock-1"))).observables;

    expect(withBeacon.meanNeighbourDistance?.slice(0, 3)).toEqual(without.meanNeighbourDistance?.slice(0, 3));
    expect(withBeacon.meanNeighbourDistance).not.toEqual(without.meanNeighbourDistance);
    const shortRun = plan(placeThenRemove.filter((e) => e.step <= 120), 120);
    expect(runEvents(setup, shortRun).finalState.beacons).toEqual([{ id: "beacon-1", x: 8, y: 8 }]);
  });

  it("refuses events that are out of order or after the last step, rather than skipping them", () => {
    expect(() => runEvents(setup, plan(placeThenRemove, 120))).toThrow(RangeError);
    expect(() => runEvents(setup, plan([...placeThenRemove].reverse()))).toThrow(RangeError);
  });

  it("applies an event at step s before step s is taken", () => {
    // Changing alignment and placing a beacon at step 0 must equal starting with both.
    const atStepZero: RunEvent[] = [
      { kind: "param", step: 0, actionId: "alignment-strength", value: 0.4 },
      { kind: "place", step: 0, entityId: "beacon-1", entity: "beacon", x: 8, y: 8 },
    ];
    const preset = {
      ...plan([]),
      initialState: { ...plan([]).initialState, beacons: [{ id: "beacon-1", x: 8, y: 8 }] },
    };

    expect(runEvents(setup, plan(atStepZero)).observables).toEqual(
      runEvents({ ...setup, params: { ...flockDefaultParams, alignmentWeight: 0.4 } }, preset).observables,
    );
  });

  it("refuses a param event that moves a parameter outside its range", () => {
    const events: RunEvent[] = [{ kind: "param", step: 10, actionId: "alignment-strength", value: 5 }];
    expect(() => runEvents(setup, plan(events))).toThrow();
  });

  it("applies an event at the last step after the final sample", () => {
    const late: RunEvent[] = [{ kind: "place", step: 600, entityId: "beacon-late", entity: "beacon", x: 3, y: 3 }];
    const lateRun = runEvents(setup, plan(late));

    expect(lateRun.observables).toEqual(runEvents(setup, plan([])).observables);
    expect(lateRun.finalState.beacons).toEqual([{ id: "beacon-late", x: 3, y: 3 }]);
  });

  it("reports a tampered observable instead of matching it, within the declared tolerance", () => {
    const record = recorded(placeThenRemove);
    const tampered = (tolerance: number): RunRecord => {
      const series = [...(record.observables.directionalAgreement ?? [])];
      series[5] = (series[5] ?? 0) + 1e-6;
      return { ...record, tolerance, observables: { ...record.observables, directionalAgreement: series } };
    };

    const strict = replayRecord(tampered(0), setup);
    expect(strict.matches).toBe(false);
    expect(strict.mismatches).toEqual([expect.stringContaining("directionalAgreement[5]")]);
    expect(replayRecord(tampered(1e-3), setup).matches).toBe(true);
  });

  it("refuses a record made by a different primitive version", () => {
    const record = recorded(placeThenRemove, { primitive: { id: flock.id, version: "1.0.0" } });
    expect(() => replayRecord(record, setup)).toThrow(/version/);
  });

  it("fails loudly when an event removes an entity the state does not hold", () => {
    const events: RunEvent[] = [{ kind: "remove", step: 10, entityId: "ghost" }];
    expect(() => runEvents(setup, plan(events))).toThrow(/ghost/);
  });

  it("fails loudly on an action the world does not define", () => {
    const events: RunEvent[] = [{ kind: "param", step: 10, actionId: "wind-strength", value: 1 }];
    expect(() => runEvents(setup, plan(events))).toThrow(/wind-strength/);
  });
});
