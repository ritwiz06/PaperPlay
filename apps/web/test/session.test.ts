import { Action, RunRecord } from "@paperplay/contracts";
import { replayRecord, runEvents } from "@paperplay/primitives";
import { flockAtRocks, flockDefaultParams, flockHeadings, flockNeighbours, flockPlanarWeighted as flock } from "@paperplay/primitives/flock";
import { describe, expect, it } from "vitest";
import { HOOK_SEED, LOCAL_ACTIONS, LOCAL_CONTROLS, PRIMARY_ACTION } from "../src/world/local-world.ts";
import { createWorldSession, type WorldSession } from "../src/world/session.ts";

const STEP = flock.fixedTimestep;
const open = (playing = false) => createWorldSession({ seed: HOOK_SEED, params: flockDefaultParams, actions: LOCAL_ACTIONS, playing });
/** Runs `steps` whole steps, a frame of exactly one step at a time. */
const run = (session: WorldSession, steps: number) => {
  session.play();
  let taken = 0;
  while (taken < steps) taken += session.tick(STEP);
  expect(taken).toBe(steps);
};
const json = (value: unknown) => JSON.stringify(value);

describe("the local world's controls", () => {
  it("are valid actions on the primitive's own variables, inside its ranges, with the alignment control first", () => {
    const variables = flock.describe().variables;
    expect(PRIMARY_ACTION).toBe("alignment-strength");
    for (const control of LOCAL_CONTROLS) {
      expect(Action.parse(control)).toEqual(control);
      const variable = variables[control.targetVariable];
      expect(variable, control.actionId).toBeDefined();
      expect(control.range).toEqual(variable?.range);
      expect(control.defaultValue).toBe(variable?.defaultValue);
      expect(control.origin).toBe("teaching-choice");
      expect(LOCAL_ACTIONS[control.actionId as keyof typeof LOCAL_ACTIONS]).toBe(control.targetVariable);
    }
  });
});

describe("[R04] local world session", () => {
  it("opens on the hook seed at step 0 with the default rules, and stays put until played", () => {
    const session = open();
    const now = session.snapshot();
    expect([now.seed, now.step, now.playing]).toEqual([HOOK_SEED, 0, false]);
    expect(now.params).toEqual(flockDefaultParams);
    expect(now.observed).toEqual(flock.measure(flock.init(flockDefaultParams, HOOK_SEED)));
    expect(session.tick(1)).toBe(0);
  });

  it("moves the engine parameter when a control moves, recording one event at the current step", () => {
    const session = open();
    session.setAction("alignment-strength", 3);
    session.setAction("alignment-strength", 4);
    expect(session.snapshot().params.alignmentWeight).toBe(4);
    expect(session.snapshot().events).toEqual([{ kind: "param", step: 0, actionId: "alignment-strength", value: 4 }]);
    expect(() => session.setAction("alignment-strength", 4.5)).toThrow();
    expect(() => session.setAction("no-such-control", 1)).toThrow(/no action/);
  });

  it("advances only in whole fixed steps while playing", () => {
    const session = open(true);
    expect(session.tick(STEP * 10 + STEP / 3)).toBe(10);
    session.pause();
    expect(session.tick(1)).toBe(0);
    expect(session.snapshot().step).toBe(10);
  });

  it("can always be replayed from its own record: runEvents on its plan reaches the very same state", () => {
    const session = open();
    session.setAction("alignment-strength", 4);
    run(session, 30);
    const beacon = session.place("beacon", 10, 20);
    run(session, 20);
    session.setAction("cohesion-strength", 1.1);
    session.remove(beacon);
    run(session, 10);
    session.place("obstacle", 30, 2);

    const plan = session.plan();
    expect(plan.totalSteps).toBe(60);
    const replayed = runEvents({ primitive: flock, params: plan.params, actions: LOCAL_ACTIONS }, plan);
    expect(json(replayed.finalState)).toBe(json(session.state()));
  });

  it("replays the same seed: the same events at the same steps give the same states, bit for bit", () => {
    const session = open();
    session.setAction("alignment-strength", 0.5);
    run(session, 45);
    session.place("beacon", 8, 8);
    run(session, 45);
    const first = json(session.state());
    const events = session.snapshot().events;

    session.replaySameSeed();
    // Back at step 0, where the alignment change was made: it is applied again at once.
    expect(session.snapshot().step).toBe(0);
    expect(session.snapshot().params).toEqual({ ...flockDefaultParams, alignmentWeight: 0.5 });
    expect(session.snapshot().beacons).toEqual([]);
    run(session, 90);
    expect(json(session.state())).toBe(first);
    expect(session.snapshot().events).toEqual(events);
  });

  it("drops the events not yet replayed when the learner acts during a replay", () => {
    const session = open();
    run(session, 30);
    session.setAction("alignment-strength", 1);
    run(session, 30);
    session.replaySameSeed();
    run(session, 20);
    expect(session.snapshot().replaying).toBe(true);
    session.setAction("cohesion-strength", 0.2);
    expect(session.snapshot().replaying).toBe(false);
    expect(session.snapshot().events).toEqual([{ kind: "param", step: 20, actionId: "cohesion-strength", value: 0.2 }]);
  });

  it("starts the next seed fresh, keeping the current rules, and wraps after the largest seed", () => {
    const session = open();
    session.setAction("alignment-strength", 3);
    run(session, 12);
    session.nextSeed();
    const now = session.snapshot();
    expect([now.seed, now.step, now.events.length]).toEqual([HOOK_SEED + 1, 0, 0]);
    expect(now.params.alignmentWeight).toBe(3);
    expect(json(session.state())).toBe(json(flock.init({ ...flockDefaultParams, alignmentWeight: 3 }, HOOK_SEED + 1)));

    const last = createWorldSession({ seed: 0xffff_ffff, params: flockDefaultParams, actions: LOCAL_ACTIONS });
    last.nextSeed();
    expect(last.snapshot().seed).toBe(0);
  });

  it("places and removes beacons and obstacles by name, never reusing a name within a run", () => {
    const session = open();
    expect(session.place("beacon", 10, 20)).toBe("beacon-1");
    expect(session.place("obstacle", 4, 4)).toBe("rock-1");
    session.remove("beacon-1");
    expect(session.place("beacon", 12, 12)).toBe("beacon-2");
    const now = session.snapshot();
    expect(now.beacons).toEqual([{ id: "beacon-2", x: 12, y: 12 }]);
    expect(now.obstacles).toEqual([{ id: "rock-1", x: 4, y: 4 }]);
    expect(now.events.map((event) => event.kind)).toEqual(["place", "place", "remove", "place"]);
    expect(() => session.remove("beacon-1")).toThrow();
  });

  it("reports the birds at each rock, and lights the rocks with a bird at them, exactly as the primitive's query reports them", () => {
    const rocks = [["rock-1", 8, 8], ["rock-2", 24, 8], ["rock-3", 8, 24], ["rock-4", 24, 24]] as const;
    const session = createWorldSession({
      seed: HOOK_SEED,
      params: { ...flockDefaultParams, obstacleWeight: 0 },
      actions: LOCAL_ACTIONS,
      setup: rocks.map(([entityId, x, y]) => ({ kind: "place", step: 0, entityId, entity: "obstacle", x, y })),
    });
    let lit = 0;
    for (let at = 0; at < 40; at++) {
      run(session, 30);
      const expected = flockAtRocks(session.state());
      expect(session.snapshot().rocks).toEqual(expected);
      expect(expected.birds).toBe(session.snapshot().observed.birdsAtObstacles);
      const touched = expected.rocks.filter((rock) => rock.birds.length > 0).map((rock) => rock.id);
      expect(session.emphasis().touched).toEqual(touched.length > 0 ? touched : undefined);
      if (touched.length > 0) lit++;
    }
    // With no rule for rocks, birds fly through them: some rocks light up.
    expect(lit).toBeGreaterThan(0);
  });

  it("[R07] keeps each prediction at its step in the run's record, which replays bit for bit, the predictions changing nothing", () => {
    const session = open();
    run(session, 30);
    session.predict("hook", "Would the flock still line up?", 0, "It stays scattered");
    session.setAction("alignment-strength", 0.5);
    run(session, 90);
    session.predict("hook", "Would the flock still line up?", 1, "It still lines up");
    run(session, 60);
    expect(session.snapshot().predictions.map((prediction) => [prediction.step, prediction.choice])).toEqual([[30, 0], [120, 1]]);

    const identity = { runId: "run-1", worldSpecHash: "a".repeat(64), codeHash: "b".repeat(64), lockHash: "c".repeat(64), runtime: { engine: "node", os: "test" }, tolerance: 0 };
    const record = session.record(identity);
    expect(RunRecord.parse(JSON.parse(JSON.stringify(record)))).toEqual(record);
    expect(record.schemaVersion).toBe("runrecord/3");
    expect(record.predictions).toEqual(session.snapshot().predictions);
    expect(record.totalSteps).toBe(180);
    const replayed = replayRecord(record, { primitive: flock, params: flockDefaultParams, actions: LOCAL_ACTIONS });
    expect(replayed.matches).toBe(true);
    expect(json(replayed.finalState)).toBe(json(session.state()));

    // A new run starts with no predictions.
    session.nextSeed();
    expect(session.snapshot().predictions).toEqual([]);
  });

  it("shows a selected bird's neighbourhood exactly as the primitive's query reports it", () => {
    const session = open();
    run(session, 15);
    session.select(5);
    const expected = flockNeighbours(session.state(), flockDefaultParams, 5);
    expect(session.snapshot().selected).toEqual({ index: 5, ...expected });
    expect(session.emphasis()).toEqual({ selected: 5, neighbours: expected.seen, reach: flockDefaultParams.perceptionRadius });
    session.setAction("perception-radius", 3);
    expect(session.emphasis().reach).toBe(3);
    session.select(null);
    expect(session.snapshot().selected).toBeNull();
    expect(() => session.select(72)).toThrow(RangeError);
  });

  it("shows every bird's heading and the mean heading exactly as the primitive's query reports them", () => {
    const session = open();
    run(session, 120);
    expect(session.snapshot().headings).toEqual(flockHeadings(session.state()));
  });

  it("hands the stage a short history for trails: one state in eighteen over the last 3 s, oldest first, ending just before the current one", () => {
    const session = open();
    expect(session.stageInput().trail).toEqual([]);
    run(session, 200);
    const trail = session.stageInput().trail ?? [];
    expect(trail.map((state) => state.stepIndex)).toEqual([37, 55, 73, 91, 109, 127, 145, 163, 181, 199]);
    session.replaySameSeed();
    expect(session.stageInput().trail).toEqual([]);
  });

  it("restores the default rules with one event for each rule that had moved", () => {
    const session = open();
    session.setAction("alignment-strength", 4);
    session.setAction("cohesion-strength", 1);
    run(session, 5);
    session.restoreDefaults();
    expect(session.snapshot().params).toEqual(flockDefaultParams);
    expect(session.snapshot().events.slice(2)).toEqual([
      { kind: "param", step: 5, actionId: "alignment-strength", value: 2 },
      { kind: "param", step: 5, actionId: "cohesion-strength", value: 0.4 },
    ]);
  });

  it("counts every change, so a paused stage knows when to draw again", () => {
    const session = open();
    const seen = new Set([session.version()]);
    for (const change of [
      () => session.setAction("alignment-strength", 1),
      () => session.place("beacon", 3, 3),
      () => session.select(2),
      () => session.play(),
      () => session.tick(STEP),
      () => session.pause(),
      () => session.replaySameSeed(),
      () => session.nextSeed(),
    ]) {
      change();
      seen.add(session.version());
    }
    expect(seen.size).toBe(9);
  });
});

describe("[R07] a level's setup and loading the next level", () => {
  const rock = { kind: "place", step: 0, entityId: "rock-in-path", entity: "obstacle", x: 15, y: 8.5 } as const;
  const withRock = (playing = false) => createWorldSession({ seed: HOOK_SEED, params: flockDefaultParams, actions: LOCAL_ACTIONS, setup: [rock], playing });

  it("applies the setup at step 0 as recorded place events, so the run replays from its record", () => {
    const session = withRock();
    expect(session.snapshot().obstacles).toEqual([{ id: "rock-in-path", x: 15, y: 8.5 }]);
    expect(session.snapshot().events).toEqual([rock]);
    session.setAction(PRIMARY_ACTION, 3);
    run(session, 90);
    const plan = session.plan();
    expect(plan.events[0]).toEqual(rock);
    expect(json(runEvents({ primitive: flock, params: plan.params, actions: LOCAL_ACTIONS }, plan).finalState)).toBe(json(session.state()));
  });

  it("keeps the setup on replaying the same seed and on the next seed", () => {
    const session = withRock();
    run(session, 30);
    session.replaySameSeed();
    expect(session.snapshot().obstacles).toEqual([{ id: "rock-in-path", x: 15, y: 8.5 }]);
    session.nextSeed();
    expect(session.snapshot().obstacles).toEqual([{ id: "rock-in-path", x: 15, y: 8.5 }]);
    expect(session.snapshot().events).toEqual([rock]);
  });

  it("loads another level afresh: its seed, parameters, actions and setup, at step 0", () => {
    const session = open();
    session.setAction(PRIMARY_ACTION, 3.5);
    run(session, 60);
    const params = { ...flockDefaultParams, obstacleRadius: 5 };
    session.load({ seed: HOOK_SEED, params, actions: { "obstacle-radius": "obstacleRadius" }, setup: [rock] });
    const now = session.snapshot();
    expect([now.step, now.params, now.events]).toEqual([0, params, [rock]]);
    expect(json(session.state())).toBe(json(flock.apply(flock.init(params, HOOK_SEED), rock)));
    session.setAction("obstacle-radius", 6);
    expect(session.snapshot().params.obstacleRadius).toBe(6);
    expect(() => session.setAction(PRIMARY_ACTION, 1)).toThrow(/no action alignment-strength/);
  });
});

describe("[R07] a branch, as a fork opens one", () => {
  it("starts from the given state, counts its events from there, and replays from its own plan", () => {
    const trunk = open();
    run(trunk, 90);
    const branch = createWorldSession({ seed: HOOK_SEED, params: flockDefaultParams, actions: LOCAL_ACTIONS, start: trunk.state() });
    expect(json(branch.state())).toBe(json(trunk.state()));
    branch.stepBy(30);
    branch.setAction(PRIMARY_ACTION, 0);
    branch.stepBy(30);
    const plan = branch.plan();
    expect(plan.initialState).toBe(trunk.state());
    expect(plan.totalSteps).toBe(60);
    expect(plan.events).toEqual([{ kind: "param", step: 30, actionId: PRIMARY_ACTION, value: 0 }]);
    expect(json(runEvents({ primitive: flock, params: plan.params, actions: LOCAL_ACTIONS }, plan).finalState)).toBe(json(branch.state()));
  });

  it("takes exactly the steps it is told to, playing or not", () => {
    const session = open(false);
    session.stepBy(7);
    expect(session.snapshot().step).toBe(7);
    let state = flock.init(flockDefaultParams, HOOK_SEED);
    for (let i = 0; i < 7; i++) state = flock.step(state, flockDefaultParams, STEP);
    expect(json(session.state())).toBe(json(state));
  });
});

describe("[R07] the speed control", () => {
  /** Plays a session frame by frame at 60 frames a second, moving the control at step 120. */
  function played(speed: 1 | 2 | 4, steps: number): WorldSession {
    const session = open();
    session.setSpeed(speed);
    session.play();
    let moved = false;
    while (session.snapshot().step < steps) {
      if (!moved && session.snapshot().step >= 120) {
        session.setAction(PRIMARY_ACTION, 0.5);
        moved = true;
      }
      session.tick(1 / 60);
    }
    return session;
  }

  it("takes speed times as many fixed steps per frame", () => {
    const session = open();
    session.setSpeed(4);
    session.play();
    expect(session.tick(1 / 60)).toBe(4);
    expect(session.snapshot().speed).toBe(4);
  });

  it("gives a run at 4x that matches the same run at 1x bit for bit, and replays from its record", () => {
    const slow = played(1, 480);
    const fast = played(4, 480);
    expect(fast.snapshot().step).toBe(480);
    expect(json(fast.state())).toBe(json(slow.state()));
    expect(fast.plan().events).toEqual(slow.plan().events);
    const plan = fast.plan();
    expect(json(runEvents({ primitive: flock, params: plan.params, actions: LOCAL_ACTIONS }, plan).finalState)).toBe(json(slow.state()));
  });
});
