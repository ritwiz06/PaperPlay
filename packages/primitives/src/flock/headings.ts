import type { FlockState } from "./state.ts";

/** Each bird's heading, and the flock's mean heading, in radians in the field's coordinates. */
export interface Headings {
  /** atan2(vy, vx) for each bird in list order, or null for a bird at rest. */
  readonly angles: readonly (number | null)[];
  /** The direction of the summed unit headings (E12), or null when they cancel exactly. */
  readonly mean: number | null;
}

/**
 * Q2, a read-only query (MODEL.md): each bird's heading and the flock's mean heading. The
 * sums are E12's, in list order, so the mean's length over n is the directional agreement.
 * It changes nothing, so it adds no equation and needs no new version. The heading compass
 * shows its answer.
 */
export function headingsOf(state: FlockState): Headings {
  const angles: (number | null)[] = [];
  let headingX = 0;
  let headingY = 0;
  for (const agent of state.agents) {
    const speed = Math.sqrt(agent.vx * agent.vx + agent.vy * agent.vy);
    if (speed > 0) {
      headingX += agent.vx / speed;
      headingY += agent.vy / speed;
      angles.push(Math.atan2(agent.vy, agent.vx));
    } else {
      angles.push(null);
    }
  }
  return { angles, mean: headingX === 0 && headingY === 0 ? null : Math.atan2(headingY, headingX) };
}
