import { z } from "zod";
import { Id, Sha256Hex } from "./ids.ts";
import { Anchor, SourceManifest } from "./provenance.ts";

// A source map (ADR-0045): where each of a hand-authored world's claims sits in its source, for a
// source whose text may not be kept. It keeps the claims' short quotes, their character offsets
// into the text the reader extracted, and the digests of the fetched bytes and of that text, so a
// fresh fetch can show every quote is still where the map says (`npm run sources:check`).

/** One claim a world makes of its source: what it says, in our words, and the passage that says it. */
export const SourceMapClaim = z.strictObject({
  id: Id,
  paraphrase: z.string().min(1).max(300),
  anchor: Anchor,
});
export type SourceMapClaim = z.infer<typeof SourceMapClaim>;

export const SourceMap = z
  .strictObject({
    schemaVersion: z.literal("sourcemap/1"),
    sourceId: Id,
    /** Where the bytes were fetched. */
    url: z.url(),
    /** The fetched bytes' digest. */
    sha256: Sha256Hex,
    /** The extracted text's digest and length: the anchors' offsets point into that text, which is not kept. */
    textSha256: Sha256Hex,
    textLength: z.int().positive(),
    manifest: SourceManifest,
    claims: z.array(SourceMapClaim).min(1),
  })
  .check((ctx) => {
    const map = ctx.value;
    const sections = new Set(map.manifest.sections.map((section) => section.id));
    const ids = new Set<string>();
    if (map.manifest.sourceId !== map.sourceId) ctx.issues.push({ code: "custom", message: `the manifest is of ${map.manifest.sourceId}, not ${map.sourceId}`, input: map.manifest.sourceId, path: ["manifest", "sourceId"] });
    if (map.manifest.sha256 !== map.sha256) ctx.issues.push({ code: "custom", message: "the manifest's digest is not the fetched bytes'", input: map.manifest.sha256, path: ["manifest", "sha256"] });
    map.claims.forEach((claim, index) => {
      const path = ["claims", index];
      if (ids.has(claim.id)) ctx.issues.push({ code: "custom", message: `claim ${claim.id} is mapped twice`, input: claim.id, path: [...path, "id"] });
      ids.add(claim.id);
      if (claim.anchor.sourceId !== map.sourceId) ctx.issues.push({ code: "custom", message: `the anchor points at ${claim.anchor.sourceId}, not ${map.sourceId}`, input: claim.anchor.sourceId, path: [...path, "anchor", "sourceId"] });
      if (!sections.has(claim.anchor.sectionId)) ctx.issues.push({ code: "custom", message: `the source has no section ${claim.anchor.sectionId}`, input: claim.anchor.sectionId, path: [...path, "anchor", "sectionId"] });
      if (claim.anchor.charEnd > map.textLength) ctx.issues.push({ code: "custom", message: "the anchor ends past the text", input: claim.anchor.charEnd, path: [...path, "anchor", "charEnd"] });
    });
  });
export type SourceMap = z.infer<typeof SourceMap>;
