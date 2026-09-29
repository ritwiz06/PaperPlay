import { z } from "zod";
import { Id, Sha256Hex } from "./ids.ts";

/** Where a displayed statement, number or default comes from. Every displayed statement carries one. */
export const Origin = z.enum(["paper-derived", "teaching-choice", "computed-observation", "generated-inference"]);
export type Origin = z.infer<typeof Origin>;

/** A pointer into a source passage. The quote is a short display excerpt, never the whole passage. */
export const Anchor = z
  .strictObject({
    sourceId: Id,
    page: z.int().positive().optional(),
    sectionId: Id,
    charStart: z.int().nonnegative(),
    charEnd: z.int().nonnegative(),
    quote: z.string().min(1).max(300),
  })
  .refine((anchor) => anchor.charEnd > anchor.charStart, {
    error: "charEnd must be greater than charStart",
    path: ["charEnd"],
  });
export type Anchor = z.infer<typeof Anchor>;

const SourceSection = z.strictObject({
  id: Id,
  title: z.string().min(1),
  page: z.int().positive().optional(),
});

/** Identity and structure of one source document. Persisted on its own, so it carries its schema version. */
export const SourceManifest = z
  .strictObject({
    schemaVersion: z.literal("sourcemanifest/1"),
    sourceId: Id,
    title: z.string().min(1),
    authors: z.array(z.string().min(1)).min(1),
    year: z.int().min(1000).max(9999),
    venue: z.string().min(1).optional(),
    sha256: Sha256Hex,
    accessedAt: z.iso.datetime(),
    localCopyPermitted: z.boolean(),
    sections: z.array(SourceSection).min(1),
  })
  .refine((manifest) => new Set(manifest.sections.map((section) => section.id)).size === manifest.sections.length, {
    error: "section ids must be unique so anchors stay unambiguous",
    path: ["sections"],
  });
export type SourceManifest = z.infer<typeof SourceManifest>;
