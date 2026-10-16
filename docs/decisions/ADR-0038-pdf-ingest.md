# ADR-0038: PDF ingest, the last of ingest's routes

- Status: accepted. The owner asked for PDF ingest as the last item of G3a.3 (2026-10-16): text
  extraction with page and character offsets for anchors, equations recovered as well as a PDF
  allows and refused honestly where they cannot be, and the same provenance checks as the other
  routes. ADR-0024 approved a PDF text extractor; ADR-0031 kept it for this. The reader's rules are
  mine.
- Date: 2026-10-16
- Decided by: the owner, the route; me, the extractor and its rules.

## Context

ADR-0031 reads arXiv's LaTeX and PubMed Central's JATS, which keep a paper's structure and its
equations exactly. A PDF keeps neither: its text is glyphs placed on pages, its mathematics often
drawn rather than written. Some arXiv submissions are a PDF alone, and the owner may have a paper
only as a PDF.

## Decision

1. **pdfjs-dist,** Mozilla's PDF reader (Apache-2.0), in `packages/pipeline` only, never in the
   web app's bundle. It reads only the bytes given: no fonts loaded, no fetch, no range or stream
   requests, no XFA forms. Limits: 50 MB and 200 pages.
2. **Text, page by page** (`extractPdf`): each page's lines as pdfjs marks them, NFKC-normalised so
   a mathematical italic 𝛽 is β and quotes match; a word broken at a line's end before a lower-case
   letter joined. **Each page is a section,** `page-N`, so an anchor's section names its page and
   its offsets are characters into the text, checked by the same provenance check as every route.
3. **Display equations recovered as far as a PDF allows:** a numbered block of non-prose lines above
   its number; a derivative split over two lines ("dS" above "dt = …") put back as "dS/dt = …";
   every line must state a relation or carry one on with an operator. A recovered equation is
   written into the page's text as recovered, so its span holds exactly its text. **Refused, by
   number and reason, never guessed at:** one drawn with bracket glyphs (a matrix, a tall bracket),
   one with glyphs that have no text behind them, and a fraction split over lines. The job's events
   name each refused equation, its page and its reason.
4. **Two routes:** arXiv falls back to the PDF when its source is a PDF alone (`pdf-text`, arXiv's
   licence as before); a PDF given to `/create` on this machine (`POST /jobs/pdf`,
   `application/pdf`) is its own source (`owner-pdf`), its id from its digest, its licence
   `unknown`, since a file's statement about itself is not trusted, so its text is never kept in
   the repository.
5. **Tested on the hepatitis C paper's PDF** as PLOS ONE publishes it, under CC BY, kept in
   `fixtures/sources/pdf/`: 19 pages; the force of infection and the model's system recovered, the
   system's five derivatives put back; four equations refused, among them the next-generation
   matrix and the reproduction number's fractions; the parameter table's rows anchored on page 9.

## Consequences

- A PDF-only paper can become a world when its model's equations survive as text, as the hepatitis
  C paper's do; when they do not, the transcriptions say so and the job stops, as for any source.
- A scanned PDF has no text and is refused.
- Section titles are pages, not the paper's headings: the router reads a PDF's first page as its
  abstract.
