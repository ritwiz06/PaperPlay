import { z } from "zod";
import { FamilyId, SpaceKind } from "./families.ts";
import { Id } from "./ids.ts";

/**
 * A scene kit as data (ADR-0026, ADR-0027): what it draws, what one run of its world is called,
 * and the teaching choices it makes in drawing. The builder checks a spec's kit against this,
 * without importing any drawing code; the shell's own kits are held to it by a test.
 */
export const SceneKitManifest = z.strictObject({
  id: Id,
  version: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, "must be an exact major.minor.patch version"),
  /** The kit in words. */
  name: z.string().min(1),
  draws: z.strictObject({ families: z.array(FamilyId).min(1), spaces: z.array(SpaceKind).min(1) }),
  /** What one run of a world it draws is called: on this sky, across 20 skies. */
  run: z.strictObject({ one: z.string().min(1), many: z.string().min(1), on: z.enum(["on", "in", "from"]) }),
  /** How the kit draws what it does not measure, shown on the world's page of what it cannot show. */
  disclosures: z.array(z.string().min(1)),
});
export type SceneKitManifest = z.infer<typeof SceneKitManifest>;

/** Every scene kit the shell can draw. A kit is added by ADR, with its three halves (ADR-0026). */
export const SCENE_KITS: readonly SceneKitManifest[] = Object.freeze([
  Object.freeze({
    id: "valley",
    version: "1.0.0",
    name: "A valley, with its flock",
    draws: Object.freeze({ families: Object.freeze(["agents"]) as FamilyId[], spaces: Object.freeze(["torus2d"]) as SpaceKind[] }),
    run: Object.freeze({ one: "sky", many: "skies", on: "on" as const }),
    disclosures: Object.freeze([
      "The hills, the lake and the trees are scenery: the flock flies over the flat field in their middle, and that field wraps round at its edges.",
      "Birds are drawn in three dimensions, at one height above the field, but the model is flat.",
      "A bird fades out near the field's edge, so a wrap round the world does not look like a jump.",
    ]) as string[],
  }),
  Object.freeze({
    id: "town",
    version: "1.0.0",
    name: "A town, its people coloured by compartment",
    draws: Object.freeze({ families: Object.freeze(["compartments"]) as FamilyId[], spaces: Object.freeze(["none"]) as SpaceKind[] }),
    run: Object.freeze({ one: "town", many: "towns", on: "in" as const }),
    disclosures: Object.freeze([
      "The town's 120 figures are a picture of the model's shares, not people the model follows: each stands for one in 120 of the town, coloured by the compartment it is counted in.",
      "The figures walk a pattern set by the model's time alone. Who walks near whom plays no part in the model, which treats the town as well mixed.",
      "The houses, the plaza and the trees are scenery.",
    ]) as string[],
  }),
  Object.freeze({
    id: "landscape",
    version: "1.0.0",
    name: "A loss surface as terrain, with a ball for each optimizer",
    draws: Object.freeze({ families: Object.freeze(["learning"]) as FamilyId[], spaces: Object.freeze(["surface2d"]) as SpaceKind[] }),
    run: Object.freeze({ one: "start", many: "starts", on: "from" as const }),
    disclosures: Object.freeze([
      "A surface of two dimensions stands in for the millions a real network's loss has: the idea is the same, the scale is not.",
      "The terrain's height is the loss, drawn to the surface's own shape; its colours run from low to high and say nothing more.",
      "The ball marks where the optimizer stands after each step, and its trail where it has been. It rolls between steps only to be seen; the model moves in whole steps.",
    ]) as string[],
  }),
]);

/** The scene kit with this id, if the shell has one. */
export const sceneKit = (id: string): SceneKitManifest | undefined => SCENE_KITS.find((kit) => kit.id === id);
