import type { Agent, FlockState } from "@paperplay/primitives";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAMERA,
  describeFrame,
  FLIGHT_ALTITUDE,
  MAX_BANK,
  poseOf,
  valleyDay,
  viewMatrix,
  type StageInput,
} from "../src/stage-core/index.ts";

const dt = 1 / 60;
const other: Agent = { x: 16, y: 16, vx: 1, vy: 0 };
const world = (agents: Agent[], extra: Partial<FlockState> = {}): FlockState => ({
  width: 32,
  height: 32,
  stepIndex: 0,
  agents,
  beacons: [],
  obstacles: [],
  ...extra,
});
const still = (state: FlockState): StageInput => ({ previous: state, current: state, alpha: 0, timestep: dt });
const birdAt = (x: number, y: number) => describeFrame(still(world([{ x, y, vx: 1, vy: 0 }, other])), DEFAULT_CAMERA, valleyDay).birds[0];

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

describe("frame description", () => {
  it("is a pure function of its inputs", () => {
    const input = deepFreeze(still(world([{ x: 3, y: 4, vx: 1, vy: 2 }, other])));
    expect(describeFrame(input, DEFAULT_CAMERA, valleyDay)).toEqual(describeFrame(input, DEFAULT_CAMERA, valleyDay));
  });

  it("centres the flight field on the origin and flies birds at a fixed altitude", () => {
    const frame = describeFrame(still(world([{ x: 8, y: 24, vx: 1, vy: 0 }, other])), DEFAULT_CAMERA, valleyDay);

    expect(frame.birds.map((bird) => bird.position)).toEqual([
      [-8, FLIGHT_ALTITUDE, 8],
      [0, FLIGHT_ALTITUDE, 0],
    ]);
    expect(frame.field).toEqual({ width: 32, depth: 32, altitude: FLIGHT_ALTITUDE });
  });

  it("interpolates between steps the short way across a seam, where the bird is faded out", () => {
    const previous = world([{ x: 31.8, y: 16, vx: 3, vy: 0 }, other]);
    const current = world([{ x: 0.2, y: 16, vx: 3, vy: 0 }, other]);
    const [bird] = describeFrame({ previous, current, alpha: 0.5, timestep: dt }, DEFAULT_CAMERA, valleyDay).birds;

    expect(Math.abs(Math.abs(bird?.position[0] ?? 0) - 16)).toBeLessThan(1e-9);
    expect(bird?.fade).toBeCloseTo(0, 9);
  });

  it("fades birds out over the last two world units before an edge", () => {
    expect(birdAt(16, 16)?.fade).toBe(1);
    expect(birdAt(2, 16)?.fade).toBe(1);
    expect(birdAt(1, 16)?.fade).toBeCloseTo(0.5, 12);
    expect(birdAt(16, 31)?.fade).toBeCloseTo(0.5, 12);
    expect(birdAt(0, 16)?.fade).toBe(0);
  });

  it("points each bird along its velocity", () => {
    for (const [vx, vy] of [[1, 0], [0, 1], [-2, 0], [1, -1]] as const) {
      const [bird] = describeFrame(still(world([{ x: 10, y: 10, vx, vy }, other])), DEFAULT_CAMERA, valleyDay).birds;
      const speed = Math.sqrt(vx * vx + vy * vy);
      expect(Math.cos(bird?.yaw ?? Number.NaN)).toBeCloseTo(vx / speed, 12);
      expect(-Math.sin(bird?.yaw ?? Number.NaN)).toBeCloseTo(vy / speed, 12);
    }
  });

  it("banks into a turn by an angle that grows with the turn rate, up to its limit", () => {
    const turn = (radiansPerStep: number) => {
      const previous = world([{ x: 10, y: 10, vx: 2, vy: 0 }, other]);
      const v = { vx: 2 * Math.cos(radiansPerStep), vy: 2 * Math.sin(radiansPerStep) };
      const current = world([{ x: 10, y: 10, ...v }, other]);
      return describeFrame({ previous, current, alpha: 1, timestep: dt }, DEFAULT_CAMERA, valleyDay).birds[0]?.bank ?? Number.NaN;
    };

    expect(turn(0)).toBe(0);
    expect(turn(0.02)).toBeCloseTo(Math.atan((2 * (0.02 / dt)) / 9.81), 9);
    expect(turn(-0.02)).toBeCloseTo(-turn(0.02), 12);
    expect(turn(0.05)).toBeGreaterThan(turn(0.02));
    expect(turn(0.5)).toBe(MAX_BANK);
  });

  it("lists beacons and obstacles by id, on the ground beneath their simulation points", () => {
    const state = world([other, { x: 1, y: 1, vx: 0, vy: 1 }], {
      beacons: [{ id: "beacon-1", x: 4, y: 28 }],
      obstacles: [{ id: "rock-1", x: 20, y: 10 }],
    });
    const frame = describeFrame(still(state), DEFAULT_CAMERA, valleyDay);

    expect(frame.beacons).toEqual([{ key: "beacon-1", position: [-12, 0, 12] }]);
    expect(frame.obstacles).toEqual([{ key: "rock-1", position: [4, 0, -6] }]);
  });

  it("carries the palette and the camera's pose and matrices", () => {
    const frame = describeFrame(still(world([other, { x: 1, y: 1, vx: 0, vy: 1 }])), DEFAULT_CAMERA, valleyDay);

    expect(frame.palette).toEqual(valleyDay);
    expect(frame.camera.view).toEqual(viewMatrix(poseOf(DEFAULT_CAMERA, frame.camera.target)));
    expect(frame.camera.fovDeg).toBe(DEFAULT_CAMERA.fovDeg);
    expect(frame.birds.every((bird) => bird.color === valleyDay.bird)).toBe(true);
  });
});
