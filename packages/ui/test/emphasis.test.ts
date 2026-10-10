import type { Agent, FlockState } from "@paperplay/primitives/flock";
import { describe, expect, it } from "vitest";
import {
  CURSOR_RADIUS,
  DEFAULT_CAMERA,
  describeFrame,
  dusk,
  FLIGHT_ALTITUDE,
  SELECTED_SIZE,
  valleyDay,
  type StageInput,
} from "../src/stage-core/index.ts";

const dt = 1 / 60;
const agents: Agent[] = [
  { x: 4, y: 4, vx: 1, vy: 0 },
  { x: 16, y: 16, vx: 0, vy: 1 },
  { x: 18, y: 16, vx: -1, vy: 0 },
];
const world = (birds: Agent[] = agents): FlockState => ({ width: 32, height: 32, stepIndex: 0, agents: birds, beacons: [], obstacles: [] });
const still = (state: FlockState): StageInput => ({ previous: state, current: state, alpha: 0, timestep: dt });
const selection = { selected: 1, neighbours: [2], reach: 9 };

describe("frame emphasis: the selected-neighbour view and the keyboard cursor", () => {
  it("draws every bird at size 1 in the bird colour, with no rings, when nothing is emphasised", () => {
    const frame = describeFrame(still(world()), DEFAULT_CAMERA, valleyDay);
    expect(frame.birds.map((bird) => [bird.color, bird.size])).toEqual(agents.map(() => [valleyDay.bird, 1]));
    expect(frame.rings).toEqual([]);
  });

  it("enlarges the selected bird, keeps its neighbours in full colour and dims the birds it cannot see", () => {
    const frame = describeFrame(still(world()), DEFAULT_CAMERA, valleyDay, selection);
    expect(frame.birds.map((bird) => [bird.color, bird.size])).toEqual([
      [valleyDay.context, 1],
      [valleyDay.selected, SELECTED_SIZE],
      [valleyDay.neighbour, 1],
    ]);
  });

  it("rings the selected bird at its reach, centred where the bird is drawn", () => {
    const previous = world();
    const current = world(agents.map((bird, index) => (index === 1 ? { ...bird, y: 17 } : bird)));
    const frame = describeFrame({ previous, current, alpha: 0.5, timestep: dt }, DEFAULT_CAMERA, dusk, selection);
    expect(frame.rings).toEqual([{ key: "reach", position: frame.birds[1]?.position, radius: 9, color: dusk.reach }]);
    expect(frame.rings[0]?.position).toEqual([0, FLIGHT_ALTITUDE, 0.5]);
  });

  it("draws the keyboard cursor as a ring on the ground beneath its simulation point", () => {
    const frame = describeFrame(still(world()), DEFAULT_CAMERA, valleyDay, { cursor: { x: 10, y: 20 } });
    expect(frame.rings).toEqual([{ key: "cursor", position: [-6, 0, 4], radius: CURSOR_RADIUS, color: valleyDay.cursor }]);
  });

  it("changes only colours, sizes and rings: where birds are, how they face and the camera stay the same", () => {
    const plain = describeFrame(still(world()), DEFAULT_CAMERA, valleyDay);
    const emphasised = describeFrame(still(world()), DEFAULT_CAMERA, valleyDay, { ...selection, cursor: { x: 1, y: 1 } });
    const pose = (frame: typeof plain) => frame.birds.map(({ position, yaw, bank, fade }) => [position, yaw, bank, fade]);
    expect(pose(emphasised)).toEqual(pose(plain));
    expect({ ...emphasised, birds: [], rings: [] }).toEqual({ ...plain, birds: [], rings: [] });
  });

  it("lights only the rocks the emphasis names, where they stand, changing nothing else", () => {
    const rocky: FlockState = { ...world(), obstacles: [{ id: "rock-1", x: 8, y: 8 }, { id: "rock-2", x: 24, y: 24 }] };
    const plain = describeFrame(still(rocky), DEFAULT_CAMERA, valleyDay);
    const lit = describeFrame(still(rocky), DEFAULT_CAMERA, valleyDay, { touched: ["rock-2", "rock-9"] });
    expect(plain.obstacles.map((rock) => [rock.key, rock.touched])).toEqual([["rock-1", false], ["rock-2", false]]);
    expect(lit.obstacles.map((rock) => [rock.key, rock.touched])).toEqual([["rock-1", false], ["rock-2", true]]);
    expect(lit.obstacles.map((rock) => rock.position)).toEqual(plain.obstacles.map((rock) => rock.position));
    expect({ ...lit, obstacles: [] }).toEqual({ ...plain, obstacles: [] });
  });

  it("ignores a selection that names no bird, rather than failing mid-frame", () => {
    const frame = describeFrame(still(world()), DEFAULT_CAMERA, valleyDay, { selected: 7, neighbours: [], reach: 9 });
    expect(frame.rings).toEqual([]);
    expect(frame.birds.every((bird) => bird.color === valleyDay.bird && bird.size === 1)).toBe(true);
  });
});
