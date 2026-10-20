import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { corpusMarkdown, GROUPS } from "../corpus.ts";

// The AI-papers corpus (ADR-0052): registered from arXiv by npm run corpus, each paper as arXiv gives
// it; corpus.md is what the registry writes from corpus.json, byte for byte.
const root = join(import.meta.dirname, "..", "..");
const corpus = JSON.parse(readFileSync(join(root, "fixtures", "papers", "corpus.json"), "utf8")) as { papers: { id: string; version: string; licence: string; openLicence: boolean; latexSource: boolean }[] };

describe("the AI-papers corpus", () => {
  it("registers every paper of the owner's list once, with its version, licence and source", () => {
    expect(corpus.papers.map((paper) => paper.id)).toEqual(GROUPS.flatMap((group) => group.ids));
    for (const paper of corpus.papers) expect(paper.version.startsWith(`${paper.id}v`) && /v\d+$/.test(paper.version), paper.version).toBe(true);
    // An open licence is one that lets a world keep more than anchors and short quotes.
    for (const paper of corpus.papers) expect(paper.openLicence, paper.id).toBe(/^CC (BY|BY-SA|0)( |$)/.test(paper.licence) && !/NC|ND/.test(paper.licence));
  });

  it("writes docs/papers/corpus.md from corpus.json, byte for byte", () => {
    expect(corpusMarkdown()).toBe(readFileSync(join(root, "docs", "papers", "corpus.md"), "utf8"));
  });
});
