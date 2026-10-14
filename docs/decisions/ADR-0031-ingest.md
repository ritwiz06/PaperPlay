# ADR-0031: Ingest, by restricted readers, with a source register

- Status: accepted. The owner asked for ingest from arXiv's LaTeX source, then PubMed Central by a
  supported route, then PDF text, each source's licence in the source register (2026-10-14). The
  readers and the register's shape are mine, for the owner to confirm.
- Date: 2026-10-14
- Decided by: me, within ADR-0024's approval of a LaTeX parser and a PDF text extractor.

## Context

The pipeline needs a paper as text it can quote and anchor into, with its equations exact. A
paper's files are untrusted: an arXiv archive can hold links and paths that climb out of it, a
LaTeX source can define macros that do anything, and JATS XML can declare external entities.
ADR-0024 approved a LaTeX parser and a PDF extractor as dependencies.

## Decision

1. **No new dependency for LaTeX or XML.** Restricted readers of our own, in
   `packages/pipeline/src/ingest/`, smaller than any general parser and easier to keep honest:
   - **the archive:** a gzipped tar or a single gzipped file, unpacked in memory, never written
     to disk; regular files only; a link, a device or a path that climbs out is refused; limits on
     the number and size of files;
   - **LaTeX:** comments stripped; `\input` read only from inside the archive, to a fixed depth;
     the paper's own macros listed with their definitions and never expanded; sections, display
     equations with their labels and printed numbers, references resolved to those numbers, and
     table rows kept, the math in a cell kept exactly as written;
   - **XML:** elements, attributes, text, CDATA and comments; a DOCTYPE is skipped, never read,
     and only XML's five named entities and numeric ones are decoded, so no external entity or DTD
     is ever loaded;
   - **JATS:** the article's title, authors, licence, sections, tables wherever they sit, and its
     equations, from its own TeX where PMC gives it, otherwise its MathML written out linearly.

   The general parsers considered were unified-latex and fast-xml-parser. Neither is needed for
   what ingest keeps, and each would need its own care not to expand or fetch anything. The PDF
   extractor stays approved, and comes when PDF text does.
2. **Routes:**
   - **arXiv:** the OAI-PMH record for the metadata and the licence, which arXiv states in its
     `license` field, then the source at a pinned version, `arxiv.org/src/<id>v<n>`;
   - **PubMed Central:** E-utilities' `efetch`, one of the routes the owner named. An article
     whose full text E-utilities does not give is refused, as not open.
3. **The source register,** `fixtures/sources/register.json` (`sourceregister/1`): each source's
   identifiers, route, licence with its URL and where that was read, the digest of the bytes
   downloaded, when, and its attribution.
4. **A source's text is kept in the repository only when its licence allows adapted copies:**
   CC BY, CC BY-SA, CC0 or the public domain (`fixtures/sources/<sourceId>.json`,
   `sourcetext/1`). Otherwise only its register entry is kept, and its text is read again when a
   job needs it. Every equation's span in the text holds exactly its LaTeX, which the contract
   checks.
5. **The paper-text sanitiser** (R09, `packages/pipeline/src/sanitise.ts`): before any prompt holds
   a source's text, passages that read as instructions to a model are blanked with spaces of the
   same length, so every offset still holds, and each removal is logged with its rule.

## Consequences

- **Three CC BY papers are in the register,** for the gold answers: arXiv 2506.19869v1 and
  2203.01434v2, and PMC12334037.
- **A first run found a real bug:** math in a table cell lost its commands, so `9.18\times10^7`
  read `9.1810^7`. A cell's math is now kept as written, and a test holds it.
- **What the readers do not handle:** a macro's meaning, since none is expanded; a paper whose
  equations are images; a TeX source that is only a wrapper round a PDF, which is refused.
