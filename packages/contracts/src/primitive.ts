import { z } from "zod";
import { Id } from "./ids.ts";
import { Anchor, Origin } from "./provenance.ts";

/** Names one registered primitive at one exact version, e.g. flock.planar.weighted@1.0.0. */
export const PrimitiveRef = z.strictObject({
  id: z.string().regex(/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/, "must be dotted camelCase segments"),
  version: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, "must be an exact major.minor.patch version"),
});
export type PrimitiveRef = z.infer<typeof PrimitiveRef>;

/**
 * The one thing a learner manipulates in a level. `targetVariable` names a parameter on the
 * bound primitive; that it exists there is checked against the registry, not here.
 */
export const Action = z
  .strictObject({
    actionId: Id,
    label: z.string().min(1),
    targetVariable: z.string().regex(/^[a-z][a-zA-Z0-9]*$/, "must be a camelCase parameter name"),
    range: z.tuple([z.number(), z.number()]),
    unit: z.string().min(1),
    defaultValue: z.number(),
    origin: Origin,
    anchors: z.array(Anchor),
  })
  .refine((action) => action.range[0] < action.range[1], {
    error: "range must be [min, max] with min below max",
    path: ["range"],
  })
  .refine((action) => action.defaultValue >= action.range[0] && action.defaultValue <= action.range[1], {
    error: "defaultValue must lie within range",
    path: ["defaultValue"],
  })
  .refine((action) => action.origin !== "paper-derived" || action.anchors.length > 0, {
    error: "a paper-derived action needs at least one anchor",
    path: ["anchors"],
  });
export type Action = z.infer<typeof Action>;
