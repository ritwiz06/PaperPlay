import { unprojectToGround } from "./camera.ts";
import type { BaseFrame, GroundPoint } from "./frame.ts";

/**
 * The simulation point on the ground under a screen point (normalised device coordinates), or
 * null when the ray misses the ground or lands outside the field. A kit picks its own things.
 */
export function groundPointAt(frame: BaseFrame, [x, y]: readonly [number, number]): GroundPoint | null {
  const hit = unprojectToGround(frame.camera, frame.camera, [x, y], 0);
  if (!hit) return null;
  const point = { x: hit[0] + frame.field.width / 2, y: hit[2] + frame.field.depth / 2 };
  const inside = point.x >= 0 && point.x < frame.field.width && point.y >= 0 && point.y < frame.field.depth;
  return inside ? point : null;
}
