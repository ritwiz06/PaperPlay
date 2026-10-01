import { projectToNdc, unprojectToGround } from "./camera.ts";
import type { FrameDescription } from "./frame.ts";

/** How close to a bird, in screen units (half the screen's height is 1), a pointer must land to pick it. */
export const PICK_REACH = 0.05;

/**
 * The simulation point on the valley floor under a screen point (normalised device
 * coordinates), or null when the ray misses the ground or lands outside the flight field.
 */
export function groundPointAt(frame: FrameDescription, [x, y]: readonly [number, number]): { x: number; y: number } | null {
  const hit = unprojectToGround(frame.camera, frame.camera, [x, y], 0);
  if (!hit) return null;
  const point = { x: hit[0] + frame.field.width / 2, y: hit[2] + frame.field.depth / 2 };
  const inside = point.x >= 0 && point.x < frame.field.width && point.y >= 0 && point.y < frame.field.depth;
  return inside ? point : null;
}

/** The drawn bird nearest a screen point, if one lies within `reach`; birds faded out at an edge are never picked. */
export function pickBird(frame: FrameDescription, [x, y]: readonly [number, number], reach = PICK_REACH): number | null {
  let best: number | null = null;
  let bestDistance = reach;
  frame.birds.forEach((bird, index) => {
    if (bird.fade <= 0) return;
    const [bx, by, bz] = projectToNdc(frame.camera.view, frame.camera.projection, bird.position);
    if (!(bz >= -1 && bz <= 1)) return;
    const distance = Math.hypot((bx - x) * frame.camera.aspect, by - y);
    if (distance <= bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

/** The drawn bird nearest a point on the valley floor (simulation coordinates), measured across the ground. */
export function nearestBird(frame: FrameDescription, point: { x: number; y: number }): number | null {
  const [px, pz] = [point.x - frame.field.width / 2, point.y - frame.field.depth / 2];
  let best: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  frame.birds.forEach((bird, index) => {
    if (bird.fade <= 0) return;
    const distance = Math.hypot(bird.position[0] - px, bird.position[2] - pz);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}
