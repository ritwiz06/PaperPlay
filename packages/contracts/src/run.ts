import { z } from "zod";
import { Id, Sha256Hex } from "./ids.ts";
import { PrimitiveRef } from "./primitive.ts";

/** One learner intervention, applied before the step with this index is taken. */
export const RunEvent = z.strictObject({
  step: z.int().nonnegative(),
  actionId: Id,
  value: z.number(),
});
export type RunEvent = z.infer<typeof RunEvent>;

/**
 * Everything needed to replay a run: identity hashes, the full initial state (a seed alone
 * is not enough), the fixed timestep, ordered events and the observables to compare.
 */
export const RunRecord = z
  .strictObject({
    schemaVersion: z.literal("runrecord/1"),
    runId: Id,
    worldSpecHash: Sha256Hex,
    primitive: PrimitiveRef,
    codeHash: Sha256Hex,
    lockHash: Sha256Hex,
    seed: z.int().min(0).max(0xffff_ffff),
    initialState: z.unknown(),
    timestep: z.number().positive(),
    events: z.array(RunEvent),
    observables: z.record(z.string().min(1), z.array(z.number())),
    hashes: z.record(z.string().min(1), z.string().min(1)),
    runtime: z.strictObject({
      engine: z.string().min(1),
      browser: z.string().min(1).optional(),
      os: z.string().min(1),
    }),
    tolerance: z.number().nonnegative(),
  })
  .refine((record) => record.initialState !== undefined && record.initialState !== null, {
    error: "initialState must hold the full initial state",
    path: ["initialState"],
  })
  .check((ctx) => {
    const { events } = ctx.value;
    for (let index = 1; index < events.length; index++) {
      const previous = events[index - 1];
      const current = events[index];
      if (previous && current && current.step < previous.step) {
        ctx.issues.push({
          code: "custom",
          message: "events must be ordered by step",
          input: current.step,
          path: ["events", index, "step"],
        });
      }
    }
  });
export type RunRecord = z.infer<typeof RunRecord>;
