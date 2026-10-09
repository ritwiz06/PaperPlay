import type { Agent, FlockObservables, FlockState } from "./state.ts";
import { shortestOffset } from "./torus.ts";

/** L_c: birds closer than this may be linked into one group (E14). Fixed, not a parameter. */
export const CLUSTER_LINK_DISTANCE = 4.5;
/** Linked birds' headings differ by less than this, in degrees (E14). Fixed, not a parameter. */
export const CLUSTER_LINK_HEADING_DEG = 45;
/** A cluster smaller than this is strays, not a group (E14). Fixed, not a parameter. */
export const CLUSTER_MIN_SIZE = 4;

/** E12–E14. Depends on the state alone, so forked worlds with different rules compare fairly. */
export function measureFlock(state: FlockState): FlockObservables {
  const { agents, width, height } = state;
  const n = agents.length;

  // E12 directional agreement.
  let headingX = 0;
  let headingY = 0;
  for (const agent of agents) {
    const speed = Math.sqrt(agent.vx * agent.vx + agent.vy * agent.vy);
    if (speed > 0) {
      headingX += agent.vx / speed;
      headingY += agent.vy / speed;
    }
  }
  const directionalAgreement = Math.sqrt(headingX * headingX + headingY * headingY) / n;

  // E13 nearest-neighbour distance and E14 groups, both the short way round the torus.
  const parent = Array.from({ length: n }, (_, index) => index);
  const root = (index: number): number => {
    let at = index;
    while (parent[at] !== at) at = parent[at] as number;
    let walk = index;
    while (parent[walk] !== at) {
      const up = parent[walk] as number;
      parent[walk] = at;
      walk = up;
    }
    return at;
  };
  // Headings differ by less than 45° when the velocities' dot product is positive and
  // 2·(v_i·v_j)² > |v_i|²·|v_j|², since cos² 45° = 1/2. A bird at rest has no heading.
  const headed = (a: Agent, b: Agent): boolean => {
    const dot = a.vx * b.vx + a.vy * b.vy;
    return dot > 0 && 2 * dot * dot > (a.vx * a.vx + a.vy * a.vy) * (b.vx * b.vx + b.vy * b.vy);
  };
  let nearestSum = 0;
  for (let i = 0; i < n; i++) {
    const a = agents[i] as Agent;
    let nearest = Number.POSITIVE_INFINITY;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const b = agents[j] as Agent;
      const dx = shortestOffset(b.x - a.x, width);
      const dy = shortestOffset(b.y - a.y, height);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < nearest) nearest = d;
      if (j > i && d < CLUSTER_LINK_DISTANCE && headed(a, b)) parent[root(j)] = root(i);
    }
    nearestSum += nearest;
  }
  // Groups are clusters of at least CLUSTER_MIN_SIZE birds; smaller ones are strays (E14, E18).
  const sizes = new Map<number, number>();
  for (let i = 0; i < n; i++) sizes.set(root(i), (sizes.get(root(i)) ?? 0) + 1);
  let clusterCount = 0;
  let strays = 0;
  for (const size of sizes.values()) {
    if (size >= CLUSTER_MIN_SIZE) clusterCount++;
    else strays += size;
  }

  return { directionalAgreement, meanNeighbourDistance: nearestSum / n, clusterCount, strayShare: strays / n };
}

/**
 * O1: the flock reads as one group when it has exactly one group and that group holds at
 * least half the birds, so at most half are strays. A chance cluster of four amid strays is
 * one group, but not one flock (ADR-0015).
 */
export function readsAsOneGroup(observed: Pick<FlockObservables, "clusterCount" | "strayShare">): boolean {
  return observed.clusterCount === 1 && observed.strayShare <= 0.5;
}
