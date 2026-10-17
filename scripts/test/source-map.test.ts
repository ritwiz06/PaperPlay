import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isPlaceholder, SourceMap, SourceRegister, WorldSpec, type AnchorRef } from "@paperplay/contracts";
import { describe, expect, it } from "vitest";

// The flocking world's anchors, held to its source map (ADR-0045): Reynolds's paper from the
// author's own copy, whose text is not kept. `npm run sources:check` shows against a fresh fetch
// that each quote is where the map says; this test shows the world quotes only what the map holds.

const root = join(import.meta.dirname, "..", "..");
const read = (path: string): unknown => JSON.parse(readFileSync(join(root, path), "utf8"));
const sourceMap = SourceMap.parse(read("fixtures/papers/flocking/source-map.json"));
const world = WorldSpec.parse(read("fixtures/worldspecs/flocking-reference.json"));
const entry = SourceRegister.parse(read("fixtures/sources/register.json")).sources.find((source) => source.sourceId === "reynolds1987");

function anchorsIn(value: unknown, found: AnchorRef[] = []): AnchorRef[] {
  if (Array.isArray(value)) for (const item of value) anchorsIn(item, found);
  else if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      if (key === "anchors" && Array.isArray(child)) found.push(...(child as AnchorRef[]));
      else anchorsIn(child, found);
    }
  }
  return found;
}

describe("[R05] the flocking world's source map", () => {
  it("registers Reynolds's paper as the author's copy under ACM's copyright, its text not kept", () => {
    expect(entry).toMatchObject({ route: "pdf-text", licence: "other", textKept: false, sha256: sourceMap.sha256, identifiers: { doi: "10.1145/37402.37406", url: sourceMap.url } });
    expect(entry?.licenceEvidence).toMatch(/Copyright 1987 ACM\. The copy read is the author's own/);
    expect(sourceMap.manifest.localCopyPermitted).toBe(false);
  });

  it("keeps short quotes only", () => {
    for (const claim of sourceMap.claims) expect(claim.anchor.quote.length, claim.id).toBeLessThanOrEqual(200);
    expect(sourceMap.claims.reduce((sum, claim) => sum + claim.anchor.quote.length, 0)).toBeLessThan(sourceMap.textLength / 20);
  });

  it("is the reviewed world's source, and every anchor the world holds is one the map holds", () => {
    expect(world.status).toBe("reviewed");
    expect(world.source).toEqual(sourceMap.manifest);
    const anchors = anchorsIn(world);
    expect(anchors.length).toBeGreaterThanOrEqual(19);
    expect(anchors.filter(isPlaceholder)).toEqual([]);
    const mapped = sourceMap.claims.map((claim) => JSON.stringify(claim.anchor));
    for (const anchor of anchors) expect(mapped, JSON.stringify(anchor)).toContain(JSON.stringify(anchor));
  });
});
