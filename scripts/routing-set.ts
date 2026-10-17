/**
 * npm run routing-set
 *
 * Writes eval/routing/papers.json: the router's test papers, each with its title, abstract and the
 * family and tier a careful reader would route it to. The gold papers come from their kept texts;
 * the rest are arXiv abstracts, whose metadata arXiv publishes under CC0. Calls no model. arXiv's
 * OAI-PMH service rate-limits, so requests are spaced and a refusal is retried.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SourceText } from "@paperplay/contracts";
import { fetchArxivAbstract } from "@paperplay/pipeline/ingest";
import { outboundFetch } from "../apps/api/src/contact.ts";

const root = join(import.meta.dirname, "..");
interface Expected {
  readonly family: string;
  readonly tier: "A" | "B" | "C";
  readonly why: string;
}
const GOLD: readonly (readonly [string, Expected])[] = [
  ["arxiv-2506.19869v1", { family: "compartments", tier: "A", why: "a well-mixed epidemic of six compartments" }],
  ["arxiv-2203.01434v2", { family: "compartments", tier: "A", why: "four interacting cell populations as ordinary differential equations" }],
  ["pmc-PMC12334037", { family: "compartments", tier: "A", why: "a well-mixed epidemic of five compartments" }],
];
const ARXIV: readonly (readonly [string, Expected])[] = [
  ["1412.6980", { family: "learning", tier: "B", why: "an optimiser for training models; the learning family is not released" }],
  ["1207.0580", { family: "learning", tier: "B", why: "a training technique for neural networks; the learning family is not released" }],
  ["cond-mat/0611743", { family: "agents", tier: "A", why: "self-driven particles aligning with their neighbours, as the flock does" }],
  ["cond-mat/0010317", { family: "networks", tier: "B", why: "an epidemic spreading on a scale-free contact network" }],
  ["patt-sol/9304003", { family: "grids", tier: "B", why: "reaction and diffusion on a two-dimensional grid" }],
];

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const papers: { id: string; title: string; abstract: string; equations: string[]; expected: Expected }[] = [];
for (const [id, expected] of GOLD) {
  const source = SourceText.parse(JSON.parse(readFileSync(join(root, "fixtures", "sources", `${id}.json`), "utf8")));
  const section = (name: string) => source.sections.find((candidate) => candidate.id === name || candidate.title === name);
  const title = section("front");
  const abstract = section("Abstract");
  papers.push({
    id,
    title: title ? source.text.slice(title.start, title.end).trim() : id,
    abstract: abstract ? source.text.slice(abstract.start, abstract.end).replace(/^Abstract\s*/, "").trim() : "",
    equations: source.equations.slice(0, 4).map((equation) => equation.latex.slice(0, 400)),
    expected,
  });
}
for (const [id, expected] of ARXIV) {
  for (let attempt = 1; ; attempt++) {
    try {
      const paper = await fetchArxivAbstract(outboundFetch(), id);
      papers.push({ id: `arxiv-${id.replace("/", "-")}`, title: paper.title, abstract: paper.abstract, equations: [], expected });
      break;
    } catch (error) {
      if (attempt >= 5) throw error;
      console.log(`${id}: ${error instanceof Error ? error.message : String(error)}; waiting`);
      await pause(10_000 * attempt);
    }
  }
  await pause(5000);
}
writeFileSync(join(root, "eval", "routing", "papers.json"), `${JSON.stringify({ schemaVersion: "routingset/1", papers }, null, 2)}\n`);
console.log(`wrote ${papers.length} papers`);
