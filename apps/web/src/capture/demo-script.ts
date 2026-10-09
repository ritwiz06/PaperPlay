/**
 * The script behind `npm run capture:demo`: the hook seed forming a murmuration while a
 * beacon is dragged through it. It is framework-free, so the same script runs in Node's
 * tests and in the capture page. The world moves only when the script says so, a fixed
 * number of steps a frame, so the video never depends on how fast a machine renders.
 *
 * Every value here is a presentation choice for the video, not a claim from the paper.
 */
import { flockPlanarWeighted as flock } from "@paperplay/primitives";
import { HOOK_SEED } from "../world/local-world.ts";
import type { WorldSession } from "../world/session.ts";

/**
 * The beacon is dragged in a straight line through the flock's starting centre. Of 432
 * straight drags tried (start 2–4 s, 4–7 s long, 12 headings, 12–24 units), this one gave
 * the highest agreement at 15 s among those that left one group for the last 3 s
 * (ADR-0010). Without a beacon, seed 4 becomes one group only at 10 s.
 */
export const DEMO = Object.freeze({
  seed: HOOK_SEED,
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
const ease = (u: number): number => u * u * (3 - 2 * u);

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
}

/**
 * Plays the script on a session, frame by frame. A move is a remove and a place at the same
 * step, both recorded, so the run replays from the session's own record.
 */
export function scriptDemo(session: WorldSession): DemoRun {
  let frame = 0;
  let beacon: string | null = null;
  return {
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
      return ++frame;
    },
  };
}
