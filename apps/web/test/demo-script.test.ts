import { flockDefaultParams, flockPlanarWeighted as flock, runEvents } from "@paperplay/primitives";
import { describe, expect, it } from "vitest";
import { beaconAt, DEMO, scriptDemo } from "../src/capture/demo-script.ts";
import { HOOK_SEED, LOCAL_ACTIONS } from "../src/world/local-world.ts";
import { createWorldSession } from "../src/world/session.ts";

const open = () => createWorldSession({ seed: DEMO.seed, params: flockDefaultParams, actions: LOCAL_ACTIONS });

describe("the demo capture's script", () => {
  it("is 15 s of the hook seed at 30 frames a second, two fixed steps a frame", () => {
    expect(DEMO.seed).toBe(HOOK_SEED);
    expect(DEMO.frames / DEMO.fps).toBe(15);
    expect(DEMO.stepsPerFrame * flock.fixedTimestep * DEMO.fps).toBeCloseTo(1, 12);
  });

  it("drags the beacon 12 units through (25, 21) from 2 s to 8 s, and takes it away after", () => {
    const fromFrame = DEMO.beacon.fromSecond * DEMO.fps;
    const toFrame = (DEMO.beacon.fromSecond + DEMO.beacon.seconds) * DEMO.fps;
    expect(beaconAt(fromFrame - 1)).toBeNull();
    expect(beaconAt(toFrame + 1)).toBeNull();
    const start = beaconAt(fromFrame);
    const end = beaconAt(toFrame);
    if (!start || !end) throw new Error("the beacon is missing at the ends of its drag");
    expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeCloseTo(12, 9);
    expect((start.x + end.x) / 2).toBeCloseTo(25, 9);
    expect((start.y + end.y) / 2).toBeCloseTo(21, 9);
    // It eases in and out, so it moves slowest at the ends and fastest in the middle.
    const step = (frame: number) => {
      const [a, b] = [beaconAt(frame), beaconAt(frame + 1)];
      return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : NaN;
    };
    expect(step(fromFrame)).toBeLessThan(step((fromFrame + toFrame) / 2));
    expect(step(toFrame - 1)).toBeLessThan(step((fromFrame + toFrame) / 2));
  });

  it("takes exactly two steps a frame, and its run replays bit for bit from the session's own record", () => {
    const session = open();
    const demo = scriptDemo(session);
    for (let frame = 1; frame <= DEMO.frames; frame++) {
      expect(demo.next()).toBe(frame);
      expect(session.snapshot().step).toBe(frame * DEMO.stepsPerFrame);
    }
    expect(() => demo.next()).toThrow(/450 frames/);

    const snapshot = session.snapshot();
    expect(snapshot.beacons).toEqual([]);
    // One place per frame of the drag, one remove for each move and one at the end.
    const dragFrames = DEMO.beacon.seconds * DEMO.fps + 1;
    expect(snapshot.events.filter((event) => event.kind === "place")).toHaveLength(dragFrames);
    expect(snapshot.events.filter((event) => event.kind === "remove")).toHaveLength(dragFrames);

    const plan = session.plan();
    const { finalState } = runEvents({ primitive: flock, params: plan.params, actions: LOCAL_ACTIONS }, plan);
    expect(JSON.stringify(finalState)).toBe(JSON.stringify(session.state()));
  });

  it("ends on one murmuration: one group for its last 3 s, nearly all heading the same way", () => {
    // A presentation property, re-run here so a change to the primitive cannot quietly spoil
    // the video. Without the beacon, seed 4 becomes one group only at 10 s.
    const session = open();
    const demo = scriptDemo(session);
    const groups: number[] = [];
    for (let frame = 1; frame <= DEMO.frames; frame++) {
      demo.next();
      if (frame > DEMO.frames - 3 * DEMO.fps) groups.push(session.snapshot().observed.clusterCount);
    }
    expect(new Set(groups)).toEqual(new Set([1]));
    expect(session.snapshot().observed.directionalAgreement).toBeGreaterThan(0.95);
  });
});
