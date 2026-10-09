import { Action } from "@paperplay/contracts";
import { flockDefaultParams, flockHeadings, flockNeighbours, flockPlanarWeighted as flock, runEvents } from "@paperplay/primitives";
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
