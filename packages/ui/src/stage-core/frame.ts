import type { FlockState } from "@paperplay/primitives";
import { FULL_WINDOW, poseOf, projectionMatrix, viewMatrix, FAR, NEAR, type OrbitCamera, type ViewWindow } from "./camera.ts";
import { headingColor, type StagePalette } from "./palettes.ts";
import type { Mat4, Vec3 } from "./vec.ts";

/** Birds fly at this height (world units) above the valley floor. */
export const FLIGHT_ALTITUDE = 3.2;
/** Birds fade out over this distance before an edge of the flight field, so a wrap never reads as a jump. */
export const FADE_BAND = 2;
/** Steepest bank drawn, in radians. */
export const MAX_BANK = 1;
/** Presentation gravity for coordinated-turn banking, world units per second². */
export const GRAVITY = 9.81;
/** A selected bird is drawn this much larger than the rest. */
export const SELECTED_SIZE = 1.6;
/** Radius of the keyboard cursor's ring on the valley floor, in world units. */
export const CURSOR_RADIUS = 1.2;
/** Wingbeats a second, in the world's own time, so a beat repeats with the run, never the frame rate. */
export const FLAP_HZ = 3;
/** How far a wing swings, in radians: gliding slowly, and at full speed. */
export const FLAP_RANGE = [0.12, 0.62] as const;
/** The speed at which wings beat their widest: the flock's default top speed (ADR-0003). */
export const FLAP_FULL_SPEED = 3.6;
/** The longest a trail may be, in world units: short enough to read as a trail, not a track. */
export const TRAIL_LENGTH = 3.5;
/** Spreads the birds' beats evenly out of step. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** The two latest simulation states and how far between them to draw. */
export interface StageInput {
  readonly previous: FlockState;
  readonly current: FlockState;
  readonly alpha: number;
  readonly timestep: number;
  /** Earlier states, oldest first, for trails; presentation only. */
  readonly trail?: readonly FlockState[];
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
  /** 1 for every bird, larger for a selected one. */
  readonly size: number;
  readonly color: string;
  /** How far the wings are raised, in radians: positive up, negative down. */
  readonly flap: number;
}

/** A short line behind a bird through where it was, oldest point first, ending where it is drawn. */
export interface TrailPose {
  readonly points: readonly Vec3[];
  readonly color: string;
  /** The bird's own fade, so a trail vanishes with its bird at an edge. */
  readonly fade: number;
}

/** How the flock looks, apart from emphasis: one colour, or a colour per heading. */
export interface FrameLook {
  readonly birdColor?: "plain" | "heading";
}

/** A flat ring: how far a selected bird sees, where the keyboard cursor is, or how far the flock spreads. */
export interface RingPose {
  readonly key: "reach" | "cursor" | "spread";
  readonly position: Vec3;
  readonly radius: number;
  readonly color: string;
}

/**
 * What to emphasise in a frame. Presentation only: it changes colours, sizes and rings,
 * never a position, and nothing in it flows back into the simulation.
 */
export interface FrameEmphasis {
  /** The bird a learner selected, by index. */
  readonly selected?: number | null;
  /** The birds it sees, as the primitive's neighbourhood query reported them. */
  readonly neighbours?: readonly number[];
  /** How far it sees, in world units: the radius of the ring drawn around it. */
  readonly reach?: number;
  /** The keyboard cursor, in simulation coordinates. */
  readonly cursor?: { readonly x: number; readonly y: number } | null;
  /** The largest group's centre and spread, as the primitive's spread query reported them (Q3). */
  readonly spread?: { readonly x: number; readonly y: number; readonly radius: number } | null;
  /** The rocks with a bird at them, by id, as the primitive's rocks query reported them (Q4). */
  readonly touched?: readonly string[];
}

export interface MarkerPose {
  readonly key: string;
  readonly position: Vec3;
  /** A rock with a bird at it lights up. Presentation only. */
  readonly touched?: boolean;
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
  /** The part of the canvas the view is framed in. */
  readonly window: ViewWindow;
}

/** Everything a renderer needs for one frame, as plain data. It holds no simulation state. */
export interface FrameDescription {
  readonly camera: FrameCamera;
  readonly field: { readonly width: number; readonly depth: number; readonly altitude: number };
  readonly palette: StagePalette;
  readonly birds: readonly BirdPose[];
  /** One per bird that has a history to draw, in the birds' order. */
  readonly trails: readonly TrailPose[];
  readonly beacons: readonly MarkerPose[];
  readonly obstacles: readonly MarkerPose[];
  readonly rings: readonly RingPose[];
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

/**
 * The flock's centre, in simulation coordinates, measured the short way round the world: each
 * axis's circular mean, so a flock across a seam centres on the seam. For a following camera.
 */
export function flockCentre(state: FlockState): { readonly x: number; readonly y: number } {
  const turn = 2 * Math.PI;
  const axis = (values: readonly number[], size: number): number => {
    let [sin, cos] = [0, 0];
    for (const value of values) {
      sin += Math.sin((value / size) * turn);
      cos += Math.cos((value / size) * turn);
    }
    if (sin === 0 && cos === 0) return size / 2;
    return ((((Math.atan2(sin, cos) / turn) * size) % size) + size) % size;
  };
  return { x: axis(state.agents.map((agent) => agent.x), state.width), y: axis(state.agents.map((agent) => agent.y), state.height) };
}

/** (state, camera, palette, emphasis, look) → frame. Pure: reads its inputs, writes nothing. */
export function describeFrame(input: StageInput, camera: OrbitCamera, palette: StagePalette, emphasis: FrameEmphasis = {}, look: FrameLook = {}): FrameDescription {
  const { previous, current, alpha, timestep } = input;
  // A selection that names no bird is ignored rather than failing in the middle of a frame.
  const selected =
    typeof emphasis.selected === "number" && emphasis.selected >= 0 && emphasis.selected < current.agents.length ? emphasis.selected : null;
  const neighbours = new Set(selected === null ? [] : (emphasis.neighbours ?? []));
  const touched = new Set(emphasis.touched ?? []);
  const colorOf = (index: number, vx: number, vy: number): string => {
    if (selected === null) return look.birdColor === "heading" ? headingColor(palette, Math.atan2(vy, vx)) : palette.bird;
    if (index === selected) return palette.selected;
    return neighbours.has(index) ? palette.neighbour : palette.context;
  };
  const { width, height } = current;
  const target: Vec3 = camera.target ?? [0, FLIGHT_ALTITUDE / 2, 0];
  // The world's own time, between the two states drawn, for wingbeats.
  const seconds = (previous.stepIndex + alpha * (current.stepIndex - previous.stepIndex)) * timestep;
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
    const swing = FLAP_RANGE[0] + (FLAP_RANGE[1] - FLAP_RANGE[0]) * Math.min(speed / FLAP_FULL_SPEED, 1);
    return {
      position: toWorld(x, y, FLIGHT_ALTITUDE),
      yaw: -Math.atan2(vy, vx),
      bank,
      fade: smoothstep(Math.min(x, width - x, y, height - y), FADE_BAND),
      size: index === selected ? SELECTED_SIZE : 1,
      color: colorOf(index, vx, vy),
      flap: swing * Math.sin(2 * Math.PI * FLAP_HZ * seconds + index * GOLDEN_ANGLE),
    };
  });

  // Trails run back through the history until the bird wrapped round the world, never across it.
  const trails: TrailPose[] = [];
  const history = input.trail ?? [];
  if (history.length > 0) {
    birds.forEach((bird, index) => {
      const points: Vec3[] = [bird.position];
      let [lastX, lastY] = [bird.position[0] + width / 2, bird.position[2] + height / 2];
      let length = 0;
      for (let k = history.length - 1; k >= 0; k--) {
        const agent = history[k]?.agents[index];
        if (!agent || Math.abs(agent.x - lastX) > width / 2 || Math.abs(agent.y - lastY) > height / 2) break;
        const step = Math.hypot(agent.x - lastX, agent.y - lastY);
        if (length + step > TRAIL_LENGTH) {
          // The last piece is cut where the trail reaches its full length.
          const share = (TRAIL_LENGTH - length) / step;
          points.unshift(toWorld(lastX + (agent.x - lastX) * share, lastY + (agent.y - lastY) * share, FLIGHT_ALTITUDE));
          break;
        }
        length += step;
        points.unshift(toWorld(agent.x, agent.y, FLIGHT_ALTITUDE));
        [lastX, lastY] = [agent.x, agent.y];
      }
      if (points.length > 1) trails.push({ points, color: bird.color, fade: bird.fade });
    });
  }

  const rings: RingPose[] = [];
  const chosen = selected === null ? undefined : birds[selected];
  if (chosen && emphasis.reach !== undefined) rings.push({ key: "reach", position: chosen.position, radius: emphasis.reach, color: palette.reach });
  if (emphasis.cursor) {
    rings.push({ key: "cursor", position: toWorld(emphasis.cursor.x, emphasis.cursor.y, 0), radius: CURSOR_RADIUS, color: palette.cursor });
  }
  // Drawn to the nearest tenth of a unit, so the ring is not rebuilt on every step.
  if (emphasis.spread && emphasis.spread.radius > 0) {
    const radius = Math.max(Math.round(emphasis.spread.radius * 10) / 10, 0.1);
    rings.push({ key: "spread", position: toWorld(emphasis.spread.x, emphasis.spread.y, 0), radius, color: palette.reach });
  }

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
      window: camera.window ?? FULL_WINDOW,
    },
    field: { width, depth: height, altitude: FLIGHT_ALTITUDE },
    palette,
    birds,
    trails,
    beacons: current.beacons.map((entity) => ({ key: entity.id, position: toWorld(entity.x, entity.y, 0) })),
    obstacles: current.obstacles.map((entity) => ({ key: entity.id, position: toWorld(entity.x, entity.y, 0), touched: touched.has(entity.id) })),
    rings,
  };
}
