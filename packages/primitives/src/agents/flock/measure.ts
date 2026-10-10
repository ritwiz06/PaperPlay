import type { Agent, FlockObservables, FlockState } from "./state.ts";
import { shortestOffset, wrap } from "../../spaces/torus.ts";

/** L_c: birds closer than this may be linked into one group (E14). Fixed, not a parameter. */
export const CLUSTER_LINK_DISTANCE = 4.5;
/** Linked birds' headings differ by less than this, in degrees (E14). Fixed, not a parameter. */
export const CLUSTER_LINK_HEADING_DEG = 45;
/** A cluster smaller than this is strays, not a group (E14). Fixed, not a parameter. */
export const CLUSTER_MIN_SIZE = 4;

/** r_rock: a bird closer than this to an obstacle is at it (E20). The drawn rock's size; fixed, not a parameter. */
export const OBSTACLE_TOUCH_DISTANCE = 1;

const TAU = 2 * Math.PI;

/** E20's test: a bird is at a rock when it is closer than r_rock, the short way round the torus. */
function atRock(bird: Agent, rock: { readonly x: number; readonly y: number }, width: number, height: number): boolean {
  const dx = shortestOffset(rock.x - bird.x, width);
  const dy = shortestOffset(rock.y - bird.y, height);
  return Math.sqrt(dx * dx + dy * dy) < OBSTACLE_TOUCH_DISTANCE;
}

/** Each rock, and the birds at it. */
export interface AtRocks {
  /** For each obstacle in list order, its id and the birds at it, by index in index order. */
  readonly rocks: readonly { readonly id: string; readonly birds: readonly number[] }[];
  /** Birds at one rock or more, each counted once: E20, birdsAtObstacles. */
  readonly birds: number;
}

/**
 * Q4, a read-only query (MODEL.md): which birds are at which rock, by E20's test. A bird near
 * two rocks is listed at both and counted once, so `birds` equals E20. It changes nothing, so it
 * adds no equation and needs no new version. The rocks counter and the rocks on the stage show it.
 */
export function atRocksOf(state: FlockState): AtRocks {
  const { agents, width, height, obstacles } = state;
  const at = new Set<number>();
  const rocks = obstacles.map((rock) => {
    const birds: number[] = [];
    agents.forEach((bird, index) => {
      if (atRock(bird, rock, width, height)) {
        birds.push(index);
        at.add(index);
      }
    });
    return { id: rock.id, birds };
  });
  return { rocks, birds: at.size };
}

// Headings differ by less than 45° when the velocities' dot product is positive and
// 2·(v_i·v_j)² > |v_i|²·|v_j|², since cos² 45° = 1/2. A bird at rest has no heading.
const headed = (a: Agent, b: Agent): boolean => {
  const dot = a.vx * b.vx + a.vy * b.vy;
  return dot > 0 && 2 * dot * dot > (a.vx * a.vx + a.vy * a.vy) * (b.vx * b.vx + b.vy * b.vy);
};

/** E14's links joined into clusters: each cluster's birds in index order, clusters ordered by their first bird. */
export function clustersOf(state: FlockState): number[][] {
  const { agents, width, height } = state;
  const parent = agents.map((_, index) => index);
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
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i] as Agent;
    for (let j = i + 1; j < agents.length; j++) {
      const b = agents[j] as Agent;
      const dx = shortestOffset(b.x - a.x, width);
      const dy = shortestOffset(b.y - a.y, height);
      if (Math.sqrt(dx * dx + dy * dy) < CLUSTER_LINK_DISTANCE && headed(a, b)) parent[root(j)] = root(i);
    }
  }
  const byRoot = new Map<number, number[]>();
  agents.forEach((_, index) => {
    const members = byRoot.get(root(index));
    if (members) members.push(index);
    else byRoot.set(root(index), [index]);
  });
  // Map order is the order each cluster's first bird appeared: ascending.
  return [...byRoot.values()];
}

/** The largest group and how far it spreads (E19). */
export interface Spread {
  /** The group's birds in index order; empty when there is no group. */
  readonly members: readonly number[];
  /** Its circular-mean centre in [0, W) × [0, H), or null when there is no group. */
  readonly centre: { readonly x: number; readonly y: number } | null;
  /** The root-mean-square distance of its birds from the centre, the short way round; 0 with no group. */
  readonly radius: number;
}

/** The circular mean of coordinates on a ring of circumference `size`; 0 when they cancel exactly (E19). */
function circularMean(values: readonly number[], size: number): number {
  let cos = 0;
  let sin = 0;
  for (const value of values) {
    cos += Math.cos((TAU * value) / size);
    sin += Math.sin((TAU * value) / size);
  }
  return wrap((size * Math.atan2(sin, cos)) / TAU, size);
}

/** E19: the largest group, ties going to the one holding the lowest-numbered bird, and its spread. */
export function spreadOf(state: FlockState, clusters: readonly (readonly number[])[] = clustersOf(state)): Spread {
  let members: readonly number[] = [];
  for (const cluster of clusters) if (cluster.length >= CLUSTER_MIN_SIZE && cluster.length > members.length) members = cluster;
  if (members.length === 0) return { members, centre: null, radius: 0 };
  const birds = members.map((index) => state.agents[index] as Agent);
  const centre = { x: circularMean(birds.map((bird) => bird.x), state.width), y: circularMean(birds.map((bird) => bird.y), state.height) };
  let squares = 0;
  for (const bird of birds) {
    const dx = shortestOffset(bird.x - centre.x, state.width);
    const dy = shortestOffset(bird.y - centre.y, state.height);
    squares += dx * dx + dy * dy;
  }
  return { members, centre, radius: Math.sqrt(squares / birds.length) };
}

/** E12–E14 and E18–E20. Depends on the state alone, so forked worlds with different rules compare fairly. */
export function measureFlock(state: FlockState): FlockObservables {
  const { agents, width, height, obstacles } = state;
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

  // E13 nearest-neighbour distance, and E20 birds at an obstacle, both the short way round the torus.
  let nearestSum = 0;
  let atObstacles = 0;
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
    }
    nearestSum += nearest;
    if (obstacles.some((rock) => atRock(a, rock, width, height))) atObstacles++;
  }

  // E14 groups are clusters of at least CLUSTER_MIN_SIZE birds; smaller ones are strays (E18).
  const clusters = clustersOf(state);
  let clusterCount = 0;
  let strays = 0;
  for (const cluster of clusters) {
    if (cluster.length >= CLUSTER_MIN_SIZE) clusterCount++;
    else strays += cluster.length;
  }

  return {
    directionalAgreement,
    meanNeighbourDistance: nearestSum / n,
    clusterCount,
    strayShare: strays / n,
    groupSpread: spreadOf(state, clusters).radius,
    birdsAtObstacles: atObstacles,
  };
}

/**
 * O1: the flock reads as one group when it has exactly one group and that group holds at
 * least half the birds, so at most half are strays. A chance cluster of four amid strays is
 * one group, but not one flock (ADR-0015).
 */
export function readsAsOneGroup(observed: Pick<FlockObservables, "clusterCount" | "strayShare">): boolean {
  return observed.clusterCount === 1 && observed.strayShare <= 0.5;
}
