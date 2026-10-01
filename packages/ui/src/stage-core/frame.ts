import type { FlockState } from "@paperplay/primitives";
import { poseOf, projectionMatrix, viewMatrix, FAR, NEAR, type OrbitCamera } from "./camera.ts";
import type { StagePalette } from "./palettes.ts";
import type { Mat4, Vec3 } from "./vec.ts";

/** Birds fly at this height (world units) above the valley floor. */
export const FLIGHT_ALTITUDE = 3.2;
/** Birds fade out over this distance before an edge of the flight field, so a wrap never reads as a jump. */
export const FADE_BAND = 2;
/** Steepest bank drawn, in radians. */
export const MAX_BANK = 1;
/** Presentation gravity for coordinated-turn banking, world units per second². */
export const GRAVITY = 9.81;

/** The two latest simulation states and how far between them to draw. */
export interface StageInput {
  readonly previous: FlockState;
  readonly current: FlockState;
  readonly alpha: number;
  readonly timestep: number;
}

export interface BirdPose {
  /** World position, Y up; the field is centred on the origin. */
  readonly position: Vec3;
  /** Rotation about world Y that points the bird's nose (local +x) along its heading. */
  readonly yaw: number;
  /** Roll about the bird's own nose, into its turn. */
  readonly bank: number;
  /** 1 well inside the field, 0 at an edge. */
  readonly fade: number;
  readonly color: string;
}

export interface MarkerPose {
  readonly key: string;
  readonly position: Vec3;
}

export interface FrameCamera {
  readonly eye: Vec3;
  readonly target: Vec3;
  readonly up: Vec3;
  readonly fovDeg: number;
  readonly aspect: number;
  readonly near: number;
  readonly far: number;
  readonly view: Mat4;
  readonly projection: Mat4;
}

/** Everything a renderer needs for one frame, as plain data. It holds no simulation state. */
export interface FrameDescription {
  readonly camera: FrameCamera;
  readonly field: { readonly width: number; readonly depth: number; readonly altitude: number };
  readonly palette: StagePalette;
  readonly birds: readonly BirdPose[];
  readonly beacons: readonly MarkerPose[];
  readonly obstacles: readonly MarkerPose[];
}

const shortest = (offset: number, size: number): number => offset - size * Math.round(offset / size);
const wrapInto = (value: number, size: number): number => {
  const wrapped = ((value % size) + size) % size;
  return wrapped >= size ? 0 : wrapped;
};
const smoothstep = (edge: number, band: number): number => {
  const t = Math.min(Math.max(edge / band, 0), 1);
  return t * t * (3 - 2 * t);
};

/** (state, camera, palette) → frame. Pure: reads its inputs, writes nothing. */
export function describeFrame(input: StageInput, camera: OrbitCamera, palette: StagePalette): FrameDescription {
  const { previous, current, alpha, timestep } = input;
  const { width, height } = current;
  const target: Vec3 = [0, FLIGHT_ALTITUDE / 2, 0];
  const pose = poseOf(camera, target);
  const toWorld = (x: number, y: number, altitude: number): Vec3 => [x - width / 2, altitude, y - height / 2];

  const birds = current.agents.map((now, index): BirdPose => {
    const before = previous.agents[index] ?? now;
    const x = wrapInto(before.x + alpha * shortest(now.x - before.x, width), width);
    const y = wrapInto(before.y + alpha * shortest(now.y - before.y, height), height);
    const vx = before.vx + alpha * (now.vx - before.vx);
    const vy = before.vy + alpha * (now.vy - before.vy);
    const turn = Math.atan2(before.vx * now.vy - before.vy * now.vx, before.vx * now.vx + before.vy * now.vy);
    const speed = Math.sqrt(now.vx * now.vx + now.vy * now.vy);
    const bank = Math.min(Math.max(Math.atan((speed * (turn / timestep)) / GRAVITY), -MAX_BANK), MAX_BANK);
    return {
      position: toWorld(x, y, FLIGHT_ALTITUDE),
      yaw: -Math.atan2(vy, vx),
      bank,
      fade: smoothstep(Math.min(x, width - x, y, height - y), FADE_BAND),
      color: palette.bird,
    };
  });

  return {
    camera: {
      eye: pose.eye,
      target: pose.target,
      up: pose.up,
      fovDeg: camera.fovDeg,
      aspect: camera.aspect,
      near: NEAR,
      far: FAR,
      view: viewMatrix(pose),
      projection: projectionMatrix(camera),
    },
    field: { width, depth: height, altitude: FLIGHT_ALTITUDE },
    palette,
    birds,
    beacons: current.beacons.map((entity) => ({ key: entity.id, position: toWorld(entity.x, entity.y, 0) })),
    obstacles: current.obstacles.map((entity) => ({ key: entity.id, position: toWorld(entity.x, entity.y, 0) })),
  };
}
