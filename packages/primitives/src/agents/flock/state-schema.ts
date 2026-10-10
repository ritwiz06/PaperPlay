import { Id } from "@paperplay/contracts";
import { z } from "zod";
import type { FlockState } from "./state.ts";

const Agent = z.strictObject({ x: z.number(), y: z.number(), vx: z.number(), vy: z.number() });
const Entity = z.strictObject({ id: Id, x: z.number(), y: z.number() });

/** The state contract of MODEL.md, for states read back from JSON. */
export const FlockStateSchema: z.ZodType<FlockState> = z
  .strictObject({
    width: z.number().positive(),
    height: z.number().positive(),
    stepIndex: z.int().nonnegative(),
    agents: z.array(Agent).min(2),
    beacons: z.array(Entity),
    obstacles: z.array(Entity),
  })
  .refine(
    (state) =>
      [...state.agents, ...state.beacons, ...state.obstacles].every(
        (point) => point.x >= 0 && point.x < state.width && point.y >= 0 && point.y < state.height,
      ),
    "every bird, beacon and obstacle must lie inside [0, width) × [0, height)",
  )
  .refine((state) => {
    const ids = [...state.beacons, ...state.obstacles].map((entity) => entity.id);
    return new Set(ids).size === ids.length;
  }, "entity ids must be unique across beacons and obstacles");
