/**
 * The script behind `npm run capture:demo`: the hook seed forming a murmuration while a
 * beacon is dragged through it. It is framework-free, so the same script runs in Node's
 * tests and in the capture page. The world moves only when the script says so, a fixed
 * number of steps a frame, so the video never depends on how fast a machine renders.
 *
 * Every value here is a presentation choice for the video, not a claim from the paper.
 */
import { flockPlanarWeighted as flock } from "@paperplay/primitives/flock";
import { FLIGHT_ALTITUDE, flockCentre, type Vec3 } from "@paperplay/ui/stage-core";
import type { WorldSession } from "../world/session.ts";

/**
 * The beacon is dragged in a straight line through the flock's starting centre. Of 432
 * straight drags tried (start 2–4 s, 4–7 s long, 12 headings, 12–24 units), this one gave
 * the highest agreement at 15 s among those that left one group for the last 3 s
 * (ADR-0010). Without a beacon, seed 4 becomes one group only at 10 s (by flock 2.x's
 * measure; under 3.0.0's, at 18.6 s, ADR-0015).
 */
export const DEMO = Object.freeze({
  /** Seed 4, as the owner asked for this capture. It was the hook seed then; since flock 3.0.0 the hook seed is 5 (ADR-0015). */
  seed: 4,
  fps: 30,
  /** The flock steps at 60 Hz, so each frame shows 1/30 s of the world. */
  stepsPerFrame: 2,
  frames: 450,
  beacon: Object.freeze({
    fromSecond: 2,
    seconds: 6,
    through: Object.freeze({ x: 25, y: 21 }),
    /** Radians, in the field's own coordinates. */
    heading: 4.5,
    length: 12,
  }),
});

/** Smoothstep: a hand that starts and stops gently. */
const ease = (u: number): number => {
  const t = Math.min(Math.max(u, 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * The camera's path (ADR-0010): open close on the flock, orbit slowly while the murmuration
 * forms, then ease out to the whole valley as its colours converge. Seconds of the video,
 * with distances in world units and angles in radians. A presentation choice.
 */
export const CAMERA_PATH = Object.freeze({
  /** Close on the flock until this second, then a slow orbit until `orbitUntil`. */
  openUntil: 3,
  orbitUntil: 10,
  distance: Object.freeze({ open: 22, orbit: 30, valley: 74 }),
  pitch: Object.freeze({ open: 0.5, orbit: 0.56, valley: 0.6 }),
  yaw: Object.freeze({ start: -1.1, orbit: 0.9, drift: 0.25 }),
  /** The camera closes most of the gap to the flock's centre in about this many seconds. */
  followSeconds: 1.2,
});

export interface DemoCamera {
  readonly yaw: number;
  readonly pitch: number;
  readonly distance: number;
  readonly target: Vec3;
}

/** The camera at this second of the video, looking at `focus` until it eases out to the field's centre. */
export function cameraAt(seconds: number, focus: Vec3): DemoCamera {
  const { openUntil, orbitUntil, distance, pitch, yaw } = CAMERA_PATH;
  const end = DEMO.frames / DEMO.fps;
  const orbit = ease((seconds - openUntil) / (orbitUntil - openUntil));
  const out = ease((seconds - orbitUntil) / (end - orbitUntil));
  const centre: Vec3 = [0, FLIGHT_ALTITUDE / 2, 0];
  const between = (a: number, b: number, t: number) => a + (b - a) * t;
  return {
    yaw: yaw.start + yaw.orbit * orbit + yaw.drift * out,
    pitch: between(between(pitch.open, pitch.orbit, orbit), pitch.valley, out),
    distance: between(between(distance.open, distance.orbit, orbit), distance.valley, out),
    target: out >= 1 ? centre : [between(focus[0], centre[0], out), centre[1], between(focus[2], centre[2], out)],
  };
}

/** Where the beacon is in this frame, or null while it is not on the field. */
export function beaconAt(frame: number): { readonly x: number; readonly y: number } | null {
  const { fromSecond, seconds, through, heading, length } = DEMO.beacon;
  const t = frame / DEMO.fps;
  if (t < fromSecond || t > fromSecond + seconds) return null;
  const along = length * (ease((t - fromSecond) / seconds) - 0.5);
  return { x: through.x + Math.cos(heading) * along, y: through.y + Math.sin(heading) * along };
}

export interface DemoRun {
  /** Moves the beacon for the next frame, takes that frame's steps, and returns how many frames have run. */
  next(): number;
  /** The camera for the frame just run. */
  camera(): DemoCamera;
}

/**
 * Plays the script on a session, frame by frame. A move is a remove and a place at the same
 * step, both recorded, so the run replays from the session's own record.
 */
export function scriptDemo(session: WorldSession): DemoRun {
  let frame = 0;
  let beacon: string | null = null;
  // The camera follows the flock's centre, eased once per video frame and taken the short way
  // round the world, so it never jumps when the flock crosses a seam.
  const toWorld = (state: ReturnType<WorldSession["state"]>): Vec3 => {
    const centre = flockCentre(state);
    return [centre.x - state.width / 2, FLIGHT_ALTITUDE / 2, centre.y - state.height / 2];
  };
  let focus: Vec3 = toWorld(session.state());
  const follow = (): void => {
    const state = session.state();
    const toward = toWorld(state);
    const nearest = (offset: number, size: number) => offset - size * Math.round(offset / size);
    // Like the live following camera, it stays over the field rather than follow a flock off its edge.
    const limit = (value: number, size: number) => Math.min(Math.max(value, -size / 2 + 5), size / 2 - 5);
    const share = 1 - Math.exp(-1 / DEMO.fps / CAMERA_PATH.followSeconds);
    focus = [
      limit(focus[0] + nearest(toward[0] - focus[0], state.width) * share, state.width),
      focus[1],
      limit(focus[2] + nearest(toward[2] - focus[2], state.height) * share, state.height),
    ];
  };
  return {
    camera: () => cameraAt(frame / DEMO.fps, focus),
    next() {
      if (frame >= DEMO.frames) throw new Error(`the demo is ${DEMO.frames} frames long`);
      const point = beaconAt(frame);
      if (beacon !== null) session.remove(beacon);
      beacon = point ? session.place("beacon", point.x, point.y) : null;
      session.play();
      let steps = 0;
      for (let i = 0; i < DEMO.stepsPerFrame; i++) steps += session.tick(flock.fixedTimestep);
      session.pause();
      if (steps !== DEMO.stepsPerFrame) throw new Error(`frame ${frame} took ${steps} steps, not ${DEMO.stepsPerFrame}`);
      follow();
      return ++frame;
    },
  };
}
