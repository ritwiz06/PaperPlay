import type { Agent, FlockState } from "@paperplay/primitives/flock";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAMERA,
  describeFrame,
  groundPointAt,
  nearestBird,
  orbit,
  pickBird,
  projectToNdc,
  valleyDay,
  type FrameDescription,
  type Vec3,
} from "../src/stage-core/index.ts";

const agents: Agent[] = [
  { x: 8, y: 8, vx: 1, vy: 0 },
  { x: 16, y: 16, vx: 1, vy: 0 },
  { x: 17, y: 16, vx: 1, vy: 0 },
  { x: 0, y: 20, vx: 1, vy: 0 }, // on the edge, so faded to nothing
];
const state: FlockState = { width: 32, height: 32, stepIndex: 0, agents, beacons: [], obstacles: [] };
const frame: FrameDescription = describeFrame({ previous: state, current: state, alpha: 0, timestep: 1 / 60 }, DEFAULT_CAMERA, valleyDay);
const ndcOf = (point: Vec3): [number, number] => {
  const [x, y] = projectToNdc(frame.camera.view, frame.camera.projection, point);
  return [x, y];
};

describe("stage picking: from a point on the screen to the world", () => {
  it("finds the simulation point on the ground under a screen point", () => {
    // Simulation (10, 20) is drawn at world (−6, 0, 4); projecting it and picking it back must agree.
    const back = groundPointAt(frame, ndcOf([-6, 0, 4]));
    expect(back?.x).toBeCloseTo(10, 9);
    expect(back?.y).toBeCloseTo(20, 9);
  });

  it("finds nothing off the field or above the horizon, so nothing is placed by accident", () => {
    expect(groundPointAt(frame, ndcOf([30, 0, 0]))).toBeNull();
    const low = describeFrame({ previous: state, current: state, alpha: 0, timestep: 1 / 60 }, orbit(DEFAULT_CAMERA, 0, -10), valleyDay);
    expect(groundPointAt(low, [0, 0.99])).toBeNull();
  });

  it("picks the drawn bird nearest the pointer, within reach", () => {
    const at = (index: number) => ndcOf(frame.birds[index]?.position ?? [0, 0, 0]);
    expect(pickBird(frame, at(0))).toBe(0);
    const [x, y] = at(1);
    expect(pickBird(frame, [x + 0.004, y])).toBe(1);
    expect(pickBird(frame, [x + 0.5, y + 0.5])).toBeNull();
  });

  it("never picks a bird that is faded out at an edge", () => {
    expect(pickBird(frame, ndcOf(frame.birds[3]?.position ?? [0, 0, 0]))).not.toBe(3);
  });

  it("finds the drawn bird nearest a point on the ground, for the keyboard cursor", () => {
    expect(nearestBird(frame, { x: 16.2, y: 16 })).toBe(1);
    expect(nearestBird(frame, { x: 9, y: 9 })).toBe(0);
    expect(nearestBird(frame, { x: 0.1, y: 20 })).not.toBe(3);
  });
});
