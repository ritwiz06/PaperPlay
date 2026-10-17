/**
 * @paperplay/pipeline/ingest: a source fetched, unpacked in memory, read by a restricted reader and
 * turned into its register entry and its text (every-paper.md §3.1). Node only, like the models.
 */
import { createHash } from "node:crypto";
import { ADAPTABLE_LICENCES, SourceRegisterEntry, SourceText } from "@paperplay/contracts";
import type { FetchedSource } from "./fetch.ts";

export { ARCHIVE_LIMITS, ArchiveError, readTar, safePath, unpackSource, type ArchiveFile } from "./archive.ts";
export { fetchArxiv, fetchArxivAbstract, fetchPmc, fromOwnerPdf, IngestError, parseArxivId, withContact, type Fetch, type FetchedSource } from "./fetch.ts";
export { equationsOf, extractPdf, PDF_LIMITS, PdfError, type PdfPaper, type RefusedEquation } from "./pdf.ts";
export { extractJats, mathText, type JatsPaper } from "./jats.ts";
export { closeOf, extractLatex, LatexError, macrosOf, mainFileOf, stripComments, type ExtractedPaper, type Macro, type TextEquation, type TextSection } from "./latex.ts";
export { decodeEntities, descendants, firstOf, parseXml, textOf, XmlError, type XmlElement, type XmlNode } from "./xml.ts";

/** A fetched source as the register records it and as its text is kept, each validated. */
export function registerAndText(source: FetchedSource, accessedAt: string): { readonly entry: SourceRegisterEntry; readonly text: SourceText } {
  const { paper } = source;
  const text = SourceText.parse({
    schemaVersion: "sourcetext/1",
    sourceId: source.sourceId,
    sha256: createHash("sha256").update(paper.text).digest("hex"),
    text: paper.text,
    sections: paper.sections,
    equations: paper.equations,
    macros: paper.macros,
  });
  const first = source.authors[0] ?? "Unknown";
  const entry = SourceRegisterEntry.parse({
    sourceId: source.sourceId,
    title: source.title,
    authors: source.authors.length > 0 ? source.authors : ["Unknown"],
    year: source.year,
    venue: source.venue,
    identifiers: source.identifiers,
    route: source.route,
    licence: source.licence,
    licenceUrl: source.licenceUrl,
    licenceEvidence: source.licenceEvidence,
    sha256: source.sha256,
    accessedAt,
    textKept: ADAPTABLE_LICENCES.includes(source.licence),
    attribution: `${first}${source.authors.length > 1 ? " et al." : ""}, "${source.title}"${source.year ? `, ${source.year}` : ""}${source.venue ? `, ${source.venue}` : ""}. Licence: ${source.licenceUrl ?? source.licence}.`,
  });
  return { entry, text };
}
