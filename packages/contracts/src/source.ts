import { z } from "zod";
import { Id, Sha256Hex } from "./ids.ts";

// What ingest makes of a source (every-paper.md §3.1): the source register's entry, with its
// licence and how it was fetched, and its text, with sections and display equations as character
// ranges that anchors point into.

/** A source's licence, as its own page states it. */
export const Licence = z.enum(["cc-by", "cc-by-sa", "cc-by-nc", "cc-by-nd", "cc-by-nc-sa", "cc-by-nc-nd", "cc0", "public-domain", "arxiv-nonexclusive", "other", "unknown"]);
export type Licence = z.infer<typeof Licence>;

/** Licences that allow adapted text, such as a level's paraphrase, with attribution. */
export const ADAPTABLE_LICENCES: readonly Licence[] = Object.freeze(["cc-by", "cc-by-sa", "cc0", "public-domain"]);

/** The licence a URL names, as Creative Commons and arXiv write them. */
export function licenceOf(url: string | null | undefined): Licence {
  if (!url) return "unknown";
  const lower = url.toLowerCase();
  if (lower.includes("arxiv.org/licenses/nonexclusive-distrib")) return "arxiv-nonexclusive";
  if (lower.includes("publicdomain/zero")) return "cc0";
  if (lower.includes("publicdomain/mark")) return "public-domain";
  const match = /creativecommons\.org\/licenses\/([a-z-]+)\//.exec(lower);
  if (!match) return "other";
  const parsed = Licence.safeParse(`cc-${match[1] ?? ""}`);
  return parsed.success ? parsed.data : "other";
}

/** How a source reached the register. */
export const IngestRoute = z.enum(["arxiv-source", "pmc-eutils", "pmc-oai", "pmc-bioc", "pmc-cloud", "pdf-text", "owner-pdf"]);
export type IngestRoute = z.infer<typeof IngestRoute>;

/** One source in the register: what it is, where it came from, and what its licence allows. */
export const SourceRegisterEntry = z.strictObject({
  sourceId: Id,
  title: z.string().min(1),
  authors: z.array(z.string().min(1)).min(1),
  year: z.int().min(1000).max(9999).nullable(),
  venue: z.string().min(1).nullable(),
  /** Its identifiers: an arXiv id with its version, a PMCID, a DOI. */
  identifiers: z.record(z.string().min(1), z.string().min(1)),
  route: IngestRoute,
  licence: Licence,
  /** The licence as the source states it, and where that was read. */
  licenceUrl: z.string().min(1).nullable(),
  licenceEvidence: z.string().min(1),
  /** The downloaded bytes' digest, and when they were fetched. */
  sha256: Sha256Hex,
  accessedAt: z.iso.datetime(),
  /** Whether the extracted text may be kept in the repository: only for a licence that allows it. */
  textKept: z.boolean(),
  /** The attribution every quote and adaptation carries. */
  attribution: z.string().min(1),
});
export type SourceRegisterEntry = z.infer<typeof SourceRegisterEntry>;

export const SourceRegister = z.strictObject({ schemaVersion: z.literal("sourceregister/1"), sources: z.array(SourceRegisterEntry) }).refine(
  (register) => new Set(register.sources.map((source) => source.sourceId)).size === register.sources.length,
  { error: "each source is registered once", path: ["sources"] },
);
export type SourceRegister = z.infer<typeof SourceRegister>;

const Span = { start: z.int().nonnegative(), end: z.int().nonnegative() };

/** A source's text, its sections and its display equations, every position a character offset into the text. */
export const SourceText = z
  .strictObject({
    schemaVersion: z.literal("sourcetext/1"),
    sourceId: Id,
    /** The text's own digest, so an anchor's offsets are known to point into this text. */
    sha256: Sha256Hex,
    text: z.string().min(1),
    sections: z.array(z.strictObject({ id: Id, title: z.string().min(1), ...Span })).min(1),
    equations: z.array(z.strictObject({ id: Id, labels: z.array(z.string()), number: z.string().nullable(), latex: z.string().min(1), sectionId: Id, ...Span })),
    /** The source's own macros, as defined, never expanded. */
    macros: z.array(z.strictObject({ name: z.string().min(1), definition: z.string() })),
  })
  .check((ctx) => {
    const { text, sections, equations } = ctx.value;
    const ids = new Set(sections.map((section) => section.id));
    sections.forEach((section, index) => {
      if (!(section.start < section.end && section.end <= text.length)) ctx.issues.push({ code: "custom", message: "a section's span lies within the text", input: section, path: ["sections", index] });
    });
    equations.forEach((equation, index) => {
      if (text.slice(equation.start, equation.end) !== equation.latex) {
        ctx.issues.push({ code: "custom", message: "an equation's span holds exactly its LaTeX", input: equation, path: ["equations", index] });
      }
      if (!ids.has(equation.sectionId)) ctx.issues.push({ code: "custom", message: `no section ${equation.sectionId}`, input: equation.sectionId, path: ["equations", index, "sectionId"] });
    });
  });
export type SourceText = z.infer<typeof SourceText>;
