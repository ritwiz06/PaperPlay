import type { Agent, FlockObservables, FlockState } from "./state.ts";
import { shortestOffset } from "./torus.ts";

/** L_c: birds closer than this are linked into one group (E14). Fixed, not a parameter. */
export const CLUSTER_LINK_DISTANCE = 4.5;

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
      if (j > i && d < CLUSTER_LINK_DISTANCE) parent[root(j)] = root(i);
    }
    nearestSum += nearest;
  }
  let clusterCount = 0;
  for (let i = 0; i < n; i++) if (root(i) === i) clusterCount++;

  return { directionalAgreement, meanNeighbourDistance: nearestSum / n, clusterCount };
}
