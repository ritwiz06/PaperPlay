import { z } from "zod";
import { Id, Sha256Hex } from "./ids.ts";
import { PrimitiveRef } from "./primitive.ts";

const Step = z.int().nonnegative();

/** A learner changes one parameter through a level's action, before step `step` is taken. */
export const ParamEvent = z.strictObject({
  kind: z.literal("param"),
  step: Step,
  actionId: Id,
  value: z.number(),
});
export type ParamEvent = z.infer<typeof ParamEvent>;

/** The kinds of entity a learner can place in a world. */
export const EntityKind = z.enum(["beacon", "obstacle"]);
export type EntityKind = z.infer<typeof EntityKind>;

/** A learner places a named beacon or obstacle at (x, y), before step `step` is taken. */
export const PlaceEvent = z.strictObject({
  kind: z.literal("place"),
  step: Step,
  entityId: Id,
  entity: EntityKind,
  x: z.number(),
  y: z.number(),
});
export type PlaceEvent = z.infer<typeof PlaceEvent>;

/** A learner removes a named entity, placed earlier in the run or present from the start. */
export const RemoveEvent = z.strictObject({
  kind: z.literal("remove"),
  step: Step,
  entityId: Id,
});
export type RemoveEvent = z.infer<typeof RemoveEvent>;

export const RunEvent = z.discriminatedUnion("kind", [ParamEvent, PlaceEvent, RemoveEvent]);
export type RunEvent = z.infer<typeof RunEvent>;

/** A world edit as a primitive applies it: a place or remove event, whatever its step. */
export type EntityEdit = Omit<PlaceEvent, "step"> | Omit<RemoveEvent, "step">;

/** Samples taken by a run of `totalSteps` steps sampled every `sampleInterval`, step 0 included. */
export function sampleCount(totalSteps: number, sampleInterval: number): number {
  return Math.floor(totalSteps / sampleInterval) + 1;
}

/**
 * Everything needed to replay a run: identity hashes, the full initial state (a seed alone
 * is not enough), the fixed timestep, ordered events, and observables sampled at steps
 * 0, k, 2k, … ≤ totalSteps for sampleInterval k, each measured before that step's events.
 */
export const RunRecord = z
  .strictObject({
    schemaVersion: z.literal("runrecord/2"),
    runId: Id,
    worldSpecHash: Sha256Hex,
    primitive: PrimitiveRef,
    codeHash: Sha256Hex,
    lockHash: Sha256Hex,
    seed: z.int().min(0).max(0xffff_ffff),
    initialState: z.unknown(),
    timestep: z.number().positive(),
    sampleInterval: z.int().positive(),
    totalSteps: z.int().nonnegative(),
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
    const { events, observables, sampleInterval, totalSteps } = ctx.value;
    const issue = (message: string, input: unknown, path: (string | number)[]): void => {
      ctx.issues.push({ code: "custom", message, input, path });
    };
    // Zod still runs this check after range failures such as sampleInterval 0; those
    // already carry their own issue, so derived checks wait for valid inputs.
    const stepsKnown = totalSteps >= 0;
    const samplingKnown = stepsKnown && sampleInterval > 0;

    const placed = new Set<string>();
    const removed = new Set<string>();
    events.forEach((event, index) => {
      const previous = events[index - 1];
      if (previous && event.step < previous.step) issue("events must be ordered by step", event.step, ["events", index, "step"]);
      if (stepsKnown && event.step > totalSteps) {
        issue("an event after the last step cannot have shaped this run", event.step, ["events", index, "step"]);
      }
      if (event.kind === "place") {
        if (placed.has(event.entityId) || removed.has(event.entityId)) {
          issue(`entity ${event.entityId} is placed twice or after its removal`, event.entityId, ["events", index, "entityId"]);
        }
        placed.add(event.entityId);
      }
      if (event.kind === "remove") {
        if (removed.has(event.entityId)) issue(`entity ${event.entityId} is removed twice`, event.entityId, ["events", index, "entityId"]);
        removed.add(event.entityId);
      }
    });

    const series = Object.entries(observables);
    if (series.length === 0) issue("a run must record at least one observable", observables, ["observables"]);
    const expected = samplingKnown ? sampleCount(totalSteps, sampleInterval) : undefined;
    for (const [metric, values] of series) {
      if (expected !== undefined && values.length !== expected) {
        issue(
          `${metric} holds ${values.length} samples; ${totalSteps} steps sampled every ${sampleInterval} give ${expected}`,
          values,
          ["observables", metric],
        );
      }
    }
  });
export type RunRecord = z.infer<typeof RunRecord>;
