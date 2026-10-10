import { mulberry32 } from "../../prng.ts";
import type { FlockParams } from "./params.ts";
import type { Agent, FlockState } from "./state.ts";

/** E15: seeded positions and uniform headings, drawn without trigonometry. */
export function initFlock(params: FlockParams, seed: number): FlockState {
  const prng = mulberry32(seed);
  const speed = Math.min(Math.max(params.targetSpeed, params.minSpeed), params.maxSpeed);
  const agents: Agent[] = [];
  for (let i = 0; i < params.agentCount; i++) {
    const x = params.worldWidth * prng.next();
    const y = params.worldHeight * prng.next();
    // Rejection sampling in the unit disc gives a uniform heading using only sqrt.
    let a: number;
    let b: number;
    let r2: number;
    do {
      a = 2 * prng.next() - 1;
      b = 2 * prng.next() - 1;
      r2 = a * a + b * b;
    } while (r2 === 0 || r2 > 1);
    const r = Math.sqrt(r2);
    agents.push({ x, y, vx: (speed * a) / r, vy: (speed * b) / r });
  }
  return { width: params.worldWidth, height: params.worldHeight, stepIndex: 0, agents, beacons: [], obstacles: [] };
}
