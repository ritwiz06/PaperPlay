import type { FlockParams } from "./params.ts";
import type { Agent, FlockState } from "./state.ts";
import { shortestOffset, wrap } from "./torus.ts";

export const FIXED_TIMESTEP = 1 / 60;
export const MAX_TIMESTEP = 0.05;
/** r_c: cohesion eases off within this distance of the local centre (E4). */
export const COHESION_EASE_RADIUS = 3;
/** r_b: beacon pull eases off within this distance of the beacon (E6). */
export const BEACON_EASE_RADIUS = 2.5;

/**
 * One synchronous step of MODEL.md (E1–E11). Every term reads the previous state; the
 * x and y components run through identical operations, and sums run in list order.
 */
export function stepFlock(state: FlockState, params: FlockParams, dt: number): FlockState {
  if (!(dt > 0 && dt <= MAX_TIMESTEP)) {
    throw new RangeError(`timestep must be in (0, ${MAX_TIMESTEP}] seconds, got ${dt}`);
  }
  const { width, height, agents, beacons, obstacles } = state;
  const next: Agent[] = [];

  for (let i = 0; i < agents.length; i++) {
    const self = agents[i] as Agent;
    let seen = 0;
    let sumVx = 0;
    let sumVy = 0;
    let sumDx = 0;
    let sumDy = 0;
    let pushX = 0;
    let pushY = 0;

    for (let j = 0; j < agents.length; j++) {
      if (j === i) continue;
      const other = agents[j] as Agent;
      const dx = shortestOffset(other.x - self.x, width);
      const dy = shortestOffset(other.y - self.y, height);
      const d2 = dx * dx + dy * dy;
      const d = Math.sqrt(d2);
      if (d < params.perceptionRadius) {
        seen++;
        sumVx += other.vx;
        sumVy += other.vy;
        sumDx += dx;
        sumDy += dy;
      }
      if (d > 0 && d < params.separationRadius) {
        pushX -= dx / d2;
        pushY -= dy / d2;
      }
    }

    let ax = 0;
    let ay = 0;

    // E5 separation: toward target speed, directly away from the crowding.
    const push = Math.sqrt(pushX * pushX + pushY * pushY);
    if (push > 0) {
      ax += params.separationWeight * ((params.targetSpeed * pushX) / push - self.vx);
      ay += params.separationWeight * ((params.targetSpeed * pushY) / push - self.vy);
    }

    if (seen > 0) {
      // E3 alignment: toward the neighbours' mean velocity.
      ax += params.alignmentWeight * (sumVx / seen - self.vx);
      ay += params.alignmentWeight * (sumVy / seen - self.vy);
      // E4 cohesion: toward the neighbours' centre, easing off near it.
      const cx = sumDx / seen;
      const cy = sumDy / seen;
      const ease = params.targetSpeed / Math.max(Math.sqrt(cx * cx + cy * cy), COHESION_EASE_RADIUS);
      ax += params.cohesionWeight * (ease * cx - self.vx);
      ay += params.cohesionWeight * (ease * cy - self.vy);
    }

    // E6 beacon: toward the nearest one only; ties go to the earliest in the list.
    if (beacons.length > 0) {
      let nearest = Number.POSITIVE_INFINITY;
      let bx = 0;
      let by = 0;
      for (const beacon of beacons) {
        const dx = shortestOffset(beacon.x - self.x, width);
        const dy = shortestOffset(beacon.y - self.y, height);
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < nearest) {
          nearest = d;
          bx = dx;
          by = dy;
        }
      }
      const ease = params.targetSpeed / Math.max(nearest, BEACON_EASE_RADIUS);
      ax += params.beaconWeight * (ease * bx - self.vx);
      ay += params.beaconWeight * (ease * by - self.vy);
    }

    // E7 obstacles: a linear push inside the obstacle radius, with no damping term.
    for (const obstacle of obstacles) {
      const dx = shortestOffset(obstacle.x - self.x, width);
      const dy = shortestOffset(obstacle.y - self.y, height);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0 && d < params.obstacleRadius) {
        const strength = params.obstacleWeight * (params.obstacleRadius - d);
        ax -= (strength * dx) / d;
        ay -= (strength * dy) / d;
      }
    }

    // E8 acceleration cap.
    const accel = Math.sqrt(ax * ax + ay * ay);
    if (accel > params.maxAcceleration) {
      const scale = params.maxAcceleration / accel;
      ax *= scale;
      ay *= scale;
    }

    // E9 velocity with speed limits.
    let vx = self.vx + ax * dt;
    let vy = self.vy + ay * dt;
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed > params.maxSpeed) {
      const scale = params.maxSpeed / speed;
      vx *= scale;
      vy *= scale;
    } else if (speed < params.minSpeed) {
      if (speed > 0) {
        const scale = params.minSpeed / speed;
        vx *= scale;
        vy *= scale;
      } else {
        // The update cancelled exactly: keep the previous heading at minimum speed.
        const prior = Math.sqrt(self.vx * self.vx + self.vy * self.vy);
        vx = prior > 0 ? (params.minSpeed * self.vx) / prior : params.minSpeed;
        vy = prior > 0 ? (params.minSpeed * self.vy) / prior : 0;
      }
    }

    // E10 position on the torus.
    next.push({ x: wrap(self.x + vx * dt, width), y: wrap(self.y + vy * dt, height), vx, vy });
  }

  return { width, height, stepIndex: state.stepIndex + 1, agents: next, beacons, obstacles };
}
