// R02: the renderer displays state; primitives compute state. Drawing the flock under any
// camera or palette, or not at all, must leave every measured observable bit-identical.
import { flockDefaultParams, flockNeighbours, flockPlanarWeighted as flock, type FlockState } from "@paperplay/primitives";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAMERA,
  describeFrame,
  dusk,
  orbit,
  valleyDay,
  zoom,
  type FrameDescription,
  type OrbitCamera,
  type StagePalette,
} from "../src/stage-core/index.ts";

const STEPS = 600;

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function run(view: { camera: OrbitCamera; palette: StagePalette; emphasise?: boolean } | null) {
  let current: FlockState = deepFreeze({
    ...flock.init(flockDefaultParams, 42),
    beacons: [{ id: "beacon-1", x: 6, y: 26 }],
    obstacles: [{ id: "rock-1", x: 22, y: 9 }],
  });
  const observables: number[][] = [];
  const frames: FrameDescription[] = [];
  for (let t = 0; t < STEPS; t++) {
    const previous = current;
    current = deepFreeze(flock.step(current, flockDefaultParams, flock.fixedTimestep));
    const measured = flock.measure(current);
    observables.push([measured.directionalAgreement, measured.meanNeighbourDistance, measured.clusterCount]);
    if (view) {
      const camera = orbit(view.camera, t * 0.01, 0);
      // The selected-neighbour view asks the primitive's read-only query, then draws its answer.
      const emphasis = view.emphasise
        ? { selected: t % 72, neighbours: flockNeighbours(current, flockDefaultParams, t % 72).seen, reach: 9, cursor: { x: t % 32, y: 16 } }
        : {};
      frames.push(describeFrame({ previous, current, alpha: (t % 4) / 4, timestep: flock.fixedTimestep }, camera, view.palette, emphasis));
    }
  }
  return { observables, frames };
}

const bitwise = (a: number[][], b: number[][]): boolean =>
  a.length === b.length && a.every((row, i) => row.length === b[i]?.length && row.every((value, k) => Object.is(value, b[i]?.[k])));

const close = run({ camera: zoom(DEFAULT_CAMERA, 0.6), palette: valleyDay });
const far = run({ camera: orbit(zoom(DEFAULT_CAMERA, 1.6), 2.2, 0.3), palette: dusk });
const selecting = run({ camera: DEFAULT_CAMERA, palette: valleyDay, emphasise: true });
const unseen = run(null);

describe("[R02] model/render separation", () => {
  it("gives bit-identical observables whatever camera or palette draws the flock, or none", () => {
    expect(close.observables).toHaveLength(STEPS);
    expect(bitwise(close.observables, unseen.observables)).toBe(true);
    expect(bitwise(far.observables, unseen.observables)).toBe(true);
  });

  it("gives bit-identical observables while a bird is selected and its neighbours are shown", () => {
    expect(selecting.frames.every((frame) => frame.rings.length === 2)).toBe(true);
    expect(bitwise(selecting.observables, unseen.observables)).toBe(true);
  });

  it("really draws each frame differently under the two cameras and palettes", () => {
    expect(close.frames).toHaveLength(STEPS);
    close.frames.forEach((frame, t) => {
      const other = far.frames[t];
      expect(frame.camera.view).not.toEqual(other?.camera.view);
      expect(frame.palette.sky).not.toBe(other?.palette.sky);
      expect(frame.birds).toHaveLength(flockDefaultParams.agentCount);
    });
  });

  it("draws the same world in both views: only the camera and colours differ", () => {
    close.frames.forEach((frame, t) => {
      const other = far.frames[t];
      expect(frame.birds.map(({ position, yaw, bank, fade }) => [position, yaw, bank, fade])).toEqual(
        other?.birds.map(({ position, yaw, bank, fade }) => [position, yaw, bank, fade]),
      );
      expect(frame.beacons).toEqual(other?.beacons);
    });
  });

  it("never writes to the states it draws, which are frozen, so any write would have thrown", () => {
    const state = deepFreeze(flock.init(flockDefaultParams, 7));
    const before = JSON.stringify(state);
    describeFrame({ previous: state, current: state, alpha: 0.5, timestep: flock.fixedTimestep }, DEFAULT_CAMERA, dusk);
    expect(JSON.stringify(state)).toBe(before);
  });
});
