/**
 * npm run corpus
 *
 * Registers the AI and ML papers PaperPlay teaches (ADR-0052): for each arXiv id, its title,
 * authors, year and latest version as arXiv gives them (its Atom API, in one request), its licence
 * (its OAI-PMH record), and whether arXiv holds LaTeX source for it or a PDF alone (the first bytes of
 * its source). Writes fixtures/papers/corpus.json and docs/papers/corpus.md. No paper text is kept:
 * most of these papers carry arXiv's non-exclusive licence, so a world quotes them in anchors and
 * short quotes only. Every request goes through outboundFetch, so none carries an address unless the
 * owner set one (ADR-0039). It calls the network, so it is not part of the gate; --markdown writes
 * corpus.md again from corpus.json, calling nothing.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { descendants, fetchArxivAbstract, firstOf, parseXml, textOf } from "@paperplay/pipeline/ingest";
import { outboundFetch } from "../apps/api/src/contact.ts";

const root = join(import.meta.dirname, "..");

/** The owner's list, in the owner's groups (2026-10-20), which the registry reports but does not trust. */
export const GROUPS: readonly { readonly name: string; readonly ids: readonly string[] }[] = [
  { name: "Transformers and their analysis", ids: ["1706.03762", "1810.04805", "1906.04341", "1905.10650"] },
  { name: "BERT's successors", ids: ["2003.10555", "1907.11692", "1910.10683", "1909.11942"] },
  { name: "Scale and systems", ids: ["2001.08361", "1909.08053", "1910.02054", "1811.06965"] },
  { name: "Diffusion and its roots", ids: ["1503.03585", "1907.05600", "1305.6663", "1306.1091", "1703.06975", "2006.11239", "2010.02502", "2102.09672", "2207.12598", "2112.10752"] },
  { name: "Reasoning and agents", ids: ["2201.11903", "2210.03629", "2303.11366", "2302.04761", "2305.14325", "2305.10601", "2308.08155", "2304.03442", "2405.15793", "2407.01489", "2310.01798", "2503.13657"] },
];

interface Paper {
  readonly id: string;
  readonly version: string;
  readonly group: string;
  readonly title: string;
  readonly authors: readonly string[];
  readonly year: number;
  readonly categories: string;
  readonly licenceUrl: string | null;
  readonly licence: string;
  readonly openLicence: boolean;
  readonly latexSource: boolean;
}

/** A licence URL in words, and whether it lets a world keep more than anchors and short quotes. */
function licenceOf(url: string | null): { readonly licence: string; readonly open: boolean } {
  if (!url || /nonexclusive-distrib/.test(url)) return { licence: "arXiv's non-exclusive licence", open: false };
  const cc = /creativecommons\.org\/(licenses|publicdomain)\/([a-z-]+)\/(\d\.\d)/.exec(url);
  if (cc) {
    const kind = cc[1] === "publicdomain" ? "CC0" : `CC ${(cc[2] ?? "").toUpperCase()}`;
    return { licence: `${kind} ${cc[1] === "publicdomain" ? "" : cc[3] ?? ""}`.trim(), open: kind === "CC BY" || kind === "CC0" || kind === "CC BY-SA" };
  }
  return { licence: url, open: false };
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function register(): Promise<Paper[]> {
  const fetch = outboundFetch();
  const ids = GROUPS.flatMap((group) => group.ids);
  // One request for every title, author list, version and first date.
  const atom = await (await fetch(`https://export.arxiv.org/api/query?id_list=${ids.join(",")}&max_results=${ids.length}`)).text();
  const entries = descendants(parseXml(atom), "entry").map((entry) => {
    const url = textOf(firstOf(entry, "id") ?? "").trim();
    const match = /abs\/(.+?)v(\d+)$/.exec(url);
    return {
      id: match?.[1] ?? "",
      version: match?.[2] ?? "1",
      title: textOf(firstOf(entry, "title") ?? "").replace(/\s+/g, " ").trim(),
      authors: descendants(entry, "author").map((author) => textOf(firstOf(author, "name") ?? "").trim()),
      year: Number(textOf(firstOf(entry, "published") ?? "").slice(0, 4)),
    };
  });
  const papers: Paper[] = [];
  for (const group of GROUPS) {
    for (const id of group.ids) {
      const entry = entries.find((candidate) => candidate.id === id);
      if (!entry) throw new Error(`arXiv's API returned no entry for ${id}`);
      await pause(3000); // arXiv asks for a pause between requests to its OAI-PMH interface.
      const record = await fetchArxivAbstract(fetch, id);
      const { licence, open } = licenceOf(record.licenceUrl);
      // The source's first bytes: a gzip or a tar is LaTeX source; "%PDF-" is a PDF alone.
      await pause(1000);
      const head = new Uint8Array(await (await fetch(`https://arxiv.org/src/${id}v${entry.version}`, { headers: { range: "bytes=0-7" } })).arrayBuffer()).slice(0, 5);
      const latexSource = new TextDecoder().decode(head) !== "%PDF-";
      papers.push({ id, version: `${id}v${entry.version}`, group: group.name, title: entry.title, authors: entry.authors, year: entry.year, categories: record.categories, licenceUrl: record.licenceUrl, licence, openLicence: open, latexSource });
      console.log(`${id}: ${entry.title.slice(0, 60)}; ${licence}; ${latexSource ? "LaTeX" : "PDF only"}`);
    }
  }
  return papers;
}

const authorsIn = (authors: readonly string[]): string => (authors.length <= 4 ? authors.join(", ") : `${authors.slice(0, 3).join(", ")} and ${authors.length - 3} more`);

export function markdown(papers: readonly Paper[]): string {
  const open = papers.filter((paper) => paper.openLicence);
  const closedCc = papers.filter((paper) => !paper.openLicence && paper.licence.startsWith("CC"));
  const lines = [
    "# The AI-papers corpus",
    "",
    `The papers PaperPlay teaches first (ADR-0052): ${papers.length}, each as arXiv gives it, written by \`npm run corpus\` from arXiv's API and OAI-PMH records. The groups are the owner's, kept as given; the plan, \`docs/design/ai-papers.md\`, decides each paper's family.`,
    "",
    `Licence: ${papers.length - open.length} of ${papers.length} keep their text, so a world quotes them in anchors and short quotes only and never keeps it: arXiv's non-exclusive licence${closedCc.length > 0 ? `, and ${closedCc.map((paper) => `${paper.id}'s ${paper.licence}, which forbids derivatives`).join(", ")}` : ""}. ${open.length === 0 ? "None is" : `${open.length} ${open.length === 1 ? "is" : "are"}`} under an open licence${open.length > 0 ? ` (${open.map((paper) => `${paper.id}, ${paper.licence}`).join("; ")})` : ""}. LaTeX source: ${papers.filter((paper) => paper.latexSource).length} of ${papers.length} on arXiv${papers.every((paper) => paper.latexSource) ? "" : "; the others are a PDF alone"}.`,
    "",
  ];
  for (const group of GROUPS) {
    lines.push(`## ${group.name}`, "", "| arXiv | Title | Authors | Year | Licence | LaTeX source |", "|---|---|---|---|---|---|");
    for (const paper of papers.filter((entry) => entry.group === group.name)) lines.push(`| ${paper.version} | ${paper.title.replace(/\|/g, "\\|")} | ${authorsIn(paper.authors)} | ${paper.year} | ${paper.licence} | ${paper.latexSource ? "yes" : "no, a PDF alone"} |`);
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

/** corpus.md as the registry writes it from corpus.json, for the test that holds the two together. */
export const corpusMarkdown = (): string => markdown((JSON.parse(readFileSync(join(root, "fixtures", "papers", "corpus.json"), "utf8")) as { papers: Paper[] }).papers);

if (import.meta.main && process.argv.includes("--markdown")) writeFileSync(join(root, "docs", "papers", "corpus.md"), corpusMarkdown());
else if (import.meta.main) {
  const papers = await register();
  mkdirSync(join(root, "docs", "papers"), { recursive: true });
  writeFileSync(join(root, "fixtures", "papers", "corpus.json"), `${JSON.stringify({ schemaVersion: "corpus/1", registeredOn: new Date().toISOString().slice(0, 10), papers }, null, 2)}\n`);
  writeFileSync(join(root, "docs", "papers", "corpus.md"), markdown(papers));
  console.log(`wrote fixtures/papers/corpus.json and docs/papers/corpus.md: ${papers.length} papers`);
}
