/**
 * The heading compass (ADR-0008, the spike's review c): one tick per bird's heading on a unit
 * ring, and an arrow along the flock's mean heading as long as the directional agreement. It
 * shows the field from above, turned to match the camera's yaw, in SVG's orientation (x
 * right, y down). Headings and agreement come from the primitive; this only places them.
 */

export interface CompassPoint {
  readonly x: number;
  readonly y: number;
}

export interface CompassMarks {
  /** On the unit ring, one per bird that has a heading, in the birds' order. */
  readonly ticks: readonly CompassPoint[];
  /** From the centre, as long as the agreement; null when the flock has no mean heading. */
  readonly arrow: CompassPoint | null;
}

/**
 * A field heading θ points at (cos θ, sin θ) on the ground. The orbit camera at yaw ψ shows
 * that direction on screen as (cos(θ + ψ), sin(θ + ψ)) in y-down coordinates, ignoring tilt.
 */
const onScreen = (angle: number, yaw: number, length = 1): CompassPoint => ({ x: Math.cos(angle + yaw) * length, y: Math.sin(angle + yaw) * length });

export function compassMarks(angles: readonly (number | null)[], mean: number | null, agreement: number, yaw: number): CompassMarks {
  return {
    ticks: angles.filter((angle): angle is number => angle !== null).map((angle) => onScreen(angle, yaw)),
    arrow: mean === null ? null : onScreen(mean, yaw, agreement),
  };
}
