import { describe, expect, it } from "vitest";
import { Anchor, Origin, SourceManifest } from "../src/index.ts";
import { anchor, issuesOf, manifest, sha } from "./examples.ts";

describe("[R03] Origin", () => {
  it("offers exactly the four origin labels", () => {
    expect(Origin.options).toEqual(["paper-derived", "teaching-choice", "computed-observation", "generated-inference"]);
  });

  it("rejects any other label", () => {
    for (const label of ["verified", "paper", "Paper-derived", ""]) {
      expect(Origin.safeParse(label).success, label).toBe(false);
    }
  });
});

describe("[R03] Anchor", () => {
  it("accepts a well-formed anchor, with or without a page", () => {
    expect(issuesOf(Anchor, anchor())).toEqual([]);
    const { page: _page, ...withoutPage } = anchor();
    expect(issuesOf(Anchor, withoutPage)).toEqual([]);
  });

  it("rejects unknown keys", () => {
    expect(issuesOf(Anchor, { ...anchor(), confidence: 0.9 })).toEqual([{ code: "unrecognized_keys", path: "" }]);
  });

  it("accepts a 300-character quote and rejects a 301-character one", () => {
    expect(issuesOf(Anchor, { ...anchor(), quote: "q".repeat(300) })).toEqual([]);
    expect(issuesOf(Anchor, { ...anchor(), quote: "q".repeat(301) })).toEqual([{ code: "too_big", path: "quote" }]);
  });

  it("rejects an empty quote", () => {
    expect(issuesOf(Anchor, { ...anchor(), quote: "" })).toEqual([{ code: "too_small", path: "quote" }]);
  });

  it("rejects an empty or inverted character span", () => {
    expect(issuesOf(Anchor, { ...anchor(), charStart: 240, charEnd: 240 })).toEqual([{ code: "custom", path: "charEnd" }]);
    expect(issuesOf(Anchor, { ...anchor(), charStart: 241, charEnd: 240 })).toEqual([{ code: "custom", path: "charEnd" }]);
  });

  it("rejects negative or fractional character offsets", () => {
    expect(issuesOf(Anchor, { ...anchor(), charStart: -1 })).toEqual([{ code: "too_small", path: "charStart" }]);
    expect(issuesOf(Anchor, { ...anchor(), charEnd: 240.5 })).toEqual([{ code: "invalid_type", path: "charEnd" }]);
  });

  it("rejects a page that is not a positive whole number", () => {
    expect(issuesOf(Anchor, { ...anchor(), page: 0 })).toEqual([{ code: "too_small", path: "page" }]);
    expect(issuesOf(Anchor, { ...anchor(), page: 2.5 })).toEqual([{ code: "invalid_type", path: "page" }]);
  });

  it("rejects source and section ids that are not plain identifiers", () => {
    expect(issuesOf(Anchor, { ...anchor(), sourceId: "example 2026" })).toEqual([{ code: "invalid_format", path: "sourceId" }]);
    expect(issuesOf(Anchor, { ...anchor(), sectionId: "" })).toEqual([{ code: "invalid_format", path: "sectionId" }]);
  });
});

describe("[R03] SourceManifest", () => {
  it("accepts a complete manifest", () => {
    expect(issuesOf(SourceManifest, manifest())).toEqual([]);
  });

  it("requires schemaVersion sourcemanifest/1", () => {
    expect(issuesOf(SourceManifest, { ...manifest(), schemaVersion: "sourcemanifest/2" })).toEqual([
      { code: "invalid_value", path: "schemaVersion" },
    ]);
    const { schemaVersion: _version, ...unversioned } = manifest();
    expect(issuesOf(SourceManifest, unversioned)).toEqual([{ code: "invalid_value", path: "schemaVersion" }]);
  });

  it("rejects unknown keys at the top level and inside sections", () => {
    expect(issuesOf(SourceManifest, { ...manifest(), doi: "10.0/example" })).toEqual([
      { code: "unrecognized_keys", path: "" },
    ]);
    const sections = [{ id: "s1", title: "Introduction", summary: "extra" }];
    expect(issuesOf(SourceManifest, { ...manifest(), sections })).toEqual([
      { code: "unrecognized_keys", path: "sections.0" },
    ]);
  });

  it("requires sha256 as 64 lowercase hex characters", () => {
    for (const bad of [sha("a").slice(1), `${sha("a")}a`, sha("A"), sha("g")]) {
      expect(issuesOf(SourceManifest, { ...manifest(), sha256: bad }), bad).toEqual([
        { code: "invalid_format", path: "sha256" },
      ]);
    }
  });

  it("requires accessedAt as a UTC ISO date-time", () => {
    for (const bad of ["2026-09-28", "yesterday", "2026-09-28T21:00:00-07:00"]) {
      expect(issuesOf(SourceManifest, { ...manifest(), accessedAt: bad }), bad).toEqual([
        { code: "invalid_format", path: "accessedAt" },
      ]);
    }
  });

  it("rejects duplicate section ids, which would make anchors ambiguous", () => {
    const sections = [
      { id: "s1", title: "Introduction" },
      { id: "s1", title: "Introduction, again" },
    ];
    expect(issuesOf(SourceManifest, { ...manifest(), sections })).toEqual([{ code: "custom", path: "sections" }]);
  });

  it("requires at least one author and one section", () => {
    expect(issuesOf(SourceManifest, { ...manifest(), authors: [] })).toEqual([{ code: "too_small", path: "authors" }]);
    expect(issuesOf(SourceManifest, { ...manifest(), sections: [] })).toEqual([{ code: "too_small", path: "sections" }]);
  });
});
