/**
 * Fetching a source (every-paper.md §3.1, ADR-0024 item 7): arXiv's LaTeX source at a pinned
 * version, with its OAI-PMH record for the licence and the metadata; and a PubMed Central article's
 * JATS XML through E-utilities, one of PMC's supported routes. Downloads stay in memory and are
 * never run. The network is passed in, so tests use a fake one.
 */
import { createHash } from "node:crypto";
import { licenceOf, type IngestRoute, type Licence } from "@paperplay/contracts";
import { unpackSource, type ArchiveFile } from "./archive.ts";
import { extractJats } from "./jats.ts";
import { extractLatex, type ExtractedPaper } from "./latex.ts";
import { extractPdf, type RefusedEquation } from "./pdf.ts";
import { descendants, firstOf, parseXml, textOf } from "./xml.ts";

export type Fetch = (url: string, init?: { readonly headers?: Record<string, string> }) => Promise<{ readonly ok: boolean; readonly status: number; arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string> }>;

/** What a source is, as fetched: its metadata, licence, text and the digest of the bytes downloaded. */
export interface FetchedSource {
  readonly sourceId: string;
  readonly route: IngestRoute;
  readonly title: string;
  readonly authors: readonly string[];
  readonly year: number | null;
  readonly venue: string | null;
  readonly identifiers: Readonly<Record<string, string>>;
  readonly licence: Licence;
  readonly licenceUrl: string | null;
  readonly licenceEvidence: string;
  readonly sha256: string;
  readonly paper: ExtractedPaper;
  /** From a PDF: the display equations it does not let us read, and why (ADR-0038). */
  readonly refused?: readonly RefusedEquation[];
}

export class IngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestError";
  }
}

const USER_AGENT = "PaperPlay/0.1 (ASU research prototype; local ingest of open-access sources)";
const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

async function get(fetch: Fetch, url: string): Promise<{ readonly bytes: Uint8Array }> {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) throw new IngestError(`${url} answered ${response.status}`);
  return { bytes: new Uint8Array(await response.arrayBuffer()) };
}

/** An arXiv id with a version, such as 2101.01234v2, or an old-style one, such as q-bio/0601001v1. */
export function parseArxivId(raw: string): { readonly id: string; readonly version: number } {
  const match = /^(?:arxiv:)?((?:\d{4}\.\d{4,5})|(?:[a-z-]+(?:\.[A-Z]{2})?\/\d{7}))v(\d+)$/i.exec(raw.trim());
  if (!match) throw new IngestError(`${raw} is not an arXiv id with its version, such as 2101.01234v2`);
  return { id: match[1] ?? "", version: Number(match[2]) };
}

/** A paper from arXiv: its OAI-PMH record for the metadata and licence, then its LaTeX source. */
export async function fetchArxiv(fetch: Fetch, raw: string): Promise<FetchedSource & { readonly files: readonly ArchiveFile[] }> {
  const { id, version } = parseArxivId(raw);
  const record = new TextDecoder().decode((await get(fetch, `https://export.arxiv.org/oai2?verb=GetRecord&identifier=oai:arXiv.org:${id}&metadataPrefix=arXiv`)).bytes);
  const xml = parseXml(record);
  const meta = firstOf(xml, "arXiv");
  if (!meta) throw new IngestError(`arXiv has no record of ${id}`);
  const licenceUrl = textOf(firstOf(meta, "license") ?? "").trim() || null;
  const authors = descendants(meta, "author").map((author) => [textOf(firstOf(author, "forenames") ?? ""), textOf(firstOf(author, "keyname") ?? "")].map((part) => part.trim()).filter(Boolean).join(" "));
  const created = textOf(firstOf(meta, "created") ?? "").trim();
  const download = await get(fetch, `https://arxiv.org/src/${id}v${version}`);
  // A submission made as a PDF alone has no LaTeX source: its text is read from the PDF (ADR-0038).
  const isPdf = new TextDecoder().decode(download.bytes.slice(0, 5)) === "%PDF-";
  const fromPdf = isPdf ? await extractPdf(download.bytes) : null;
  const files = isPdf ? [] : unpackSource(download.bytes, id.replace("/", "-"));
  if (!isPdf && !files.some((file) => file.path.endsWith(".tex"))) throw new IngestError(`arXiv's source for ${id}v${version} holds no LaTeX, only ${files.map((file) => file.path).join(", ")}`);
  return {
    sourceId: `arxiv-${id.replace("/", "-")}v${version}`,
    route: isPdf ? "pdf-text" : "arxiv-source",
    title: textOf(firstOf(meta, "title") ?? "").replace(/\s+/g, " ").trim(),
    authors,
    year: created ? Number(created.slice(0, 4)) : null,
    venue: `arXiv:${id}v${version} [${textOf(firstOf(meta, "categories") ?? "").trim()}]`,
    identifiers: { arxiv: `${id}v${version}`, ...(textOf(firstOf(meta, "doi") ?? "").trim() ? { doi: textOf(firstOf(meta, "doi") ?? "").trim() } : {}) },
    licence: licenceOf(licenceUrl),
    licenceUrl,
    licenceEvidence: `arXiv's OAI-PMH record for ${id}, its license field`,
    sha256: sha256(download.bytes),
    paper: fromPdf ?? extractLatex(files),
    ...(fromPdf ? { refused: fromPdf.refused } : {}),
    files,
  };
}

/**
 * A PDF from this machine, as the owner gives it to /create (ADR-0038): its text read from the PDF,
 * its licence unknown, since a file states none the reader can trust, so its text is never kept.
 */
export async function fromOwnerPdf(bytes: Uint8Array, name: string): Promise<FetchedSource> {
  const paper = await extractPdf(bytes);
  const digest = sha256(bytes);
  const firstLine = paper.text.split("\n").find((line) => line.trim().length > 12)?.trim() ?? name;
  return {
    sourceId: `pdf-${digest.slice(0, 16)}`,
    route: "owner-pdf",
    title: paper.title ?? firstLine.slice(0, 200),
    authors: paper.authors.length > 0 ? paper.authors : ["Unknown"],
    year: null,
    venue: null,
    identifiers: { file: name.slice(0, 200), sha256: digest },
    licence: "unknown",
    licenceUrl: null,
    licenceEvidence: "a PDF given on this machine; the reader does not trust a licence a file states about itself",
    sha256: digest,
    paper,
    refused: paper.refused,
  };
}

/** A PubMed Central article's JATS XML, through E-utilities' efetch. */
export async function fetchPmc(fetch: Fetch, raw: string): Promise<FetchedSource> {
  const match = /^(?:pmc:)?(?:PMC)?(\d{5,9})$/i.exec(raw.trim());
  if (!match) throw new IngestError(`${raw} is not a PMCID, such as PMC1234567`);
  const number = match[1] ?? "";
  const download = await get(fetch, `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=${number}&retmode=xml`);
  const xml = new TextDecoder().decode(download.bytes);
  if (!/<body[\s>]/.test(xml)) throw new IngestError(`PMC${number}'s full text is not open through E-utilities: the XML has no body`);
  const paper = extractJats(xml);
  if (!paper.title) throw new IngestError(`PMC${number}'s XML has no title`);
  return {
    sourceId: `pmc-PMC${number}`,
    route: "pmc-eutils",
    title: paper.title,
    authors: paper.authors,
    year: paper.year,
    venue: paper.journal,
    identifiers: { pmcid: `PMC${number}`, ...(paper.identifiers.doi ? { doi: paper.identifiers.doi } : {}), ...(paper.identifiers.pmid ? { pmid: paper.identifiers.pmid } : {}) },
    licence: licenceOf(paper.licence.url ?? (/creativecommons\.org\/licenses\/[a-z-]+\/[\d.]+/i.exec(paper.licence.text ?? "")?.[0] ? `https://${/creativecommons\.org\/licenses\/[a-z-]+\/[\d.]+/i.exec(paper.licence.text ?? "")?.[0] ?? ""}/` : null)),
    licenceUrl: paper.licence.url,
    licenceEvidence: `the article's JATS permissions, through E-utilities${paper.licence.text ? `: "${paper.licence.text.slice(0, 160)}"` : ""}`,
    sha256: sha256(download.bytes),
    paper,
  };
}

/** An arXiv paper's title, abstract and categories alone, from its OAI-PMH record: for routing, which needs no source. */
export async function fetchArxivAbstract(fetch: Fetch, id: string): Promise<{ readonly id: string; readonly title: string; readonly abstract: string; readonly categories: string; readonly licenceUrl: string | null }> {
  const record = new TextDecoder().decode((await get(fetch, `https://export.arxiv.org/oai2?verb=GetRecord&identifier=oai:arXiv.org:${id}&metadataPrefix=arXiv`)).bytes);
  const meta = firstOf(parseXml(record), "arXiv");
  if (!meta) throw new IngestError(`arXiv has no record of ${id}`);
  const clean = (name: string): string => textOf(firstOf(meta, name) ?? "").replace(/\s+/g, " ").trim();
  return { id, title: clean("title"), abstract: clean("abstract"), categories: clean("categories"), licenceUrl: clean("license") || null };
}
