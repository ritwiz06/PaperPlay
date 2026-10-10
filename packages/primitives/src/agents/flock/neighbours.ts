import type { FlockParams } from "./params.ts";
import type { Agent, FlockState } from "./state.ts";
import { shortestOffset } from "../../spaces/torus.ts";

/** Which birds one bird sees (N_i, used by alignment and cohesion) and which crowd it (S_i, used by separation). */
export interface Neighbourhood {
  readonly seen: readonly number[];
  readonly crowding: readonly number[];
}

/**
 * Q1, a read-only query (MODEL.md): bird `index`'s neighbourhoods N_i and S_i (E2), with the
 * step's own comparisons, the short way round the torus. It changes nothing, so it adds no
 * equation and needs no new version. The selected-neighbour view shows its answer.
 */
export function neighboursOf(state: FlockState, params: FlockParams, index: number): Neighbourhood {
  const { agents, width, height } = state;
  if (!Number.isInteger(index) || index < 0 || index >= agents.length) {
    throw new RangeError(`there is no bird ${index}; this flock has birds 0 to ${agents.length - 1}`);
  }
  const self = agents[index] as Agent;
  const seen: number[] = [];
  const crowding: number[] = [];
  for (let j = 0; j < agents.length; j++) {
    if (j === index) continue;
    const other = agents[j] as Agent;
    const dx = shortestOffset(other.x - self.x, width);
    const dy = shortestOffset(other.y - self.y, height);
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < params.perceptionRadius) seen.push(j);
    if (d > 0 && d < params.separationRadius) crowding.push(j);
  }
  return { seen, crowding };
}
