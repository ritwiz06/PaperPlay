# ADR-0045: Reynolds's paper from his own site, and the flocking world's source map

- Status: accepted. The owner's instruction (2026-10-17): G2 unblocked without the owner's PDF,
  from the copy Reynolds publishes on his own site, its source and licence registered as ACM's
  copyright and an author-hosted copy, anchors and short quotes only kept; Kermack and McKendrick
  1927 the same way if the Royal Society's archive has it free to read. The form is mine.
- Date: 2026-10-17
- Decided by: the owner, the source and its terms; me, the source map's form.

## Context

G2 needs the flocking world reviewed: every anchor real, its source a manifest, not pending
(ADR-0016, `gates.json`'s `reviewedWorlds`). The source map waited on the owner's PDF of
"Flocks, Herds, and Schools" (roadmap, 2026-10-09). Reynolds keeps a copy on his own site,
`https://www.red3d.com/cwr/papers/1987/SIGGRAPH87.pdf`, linked from his boids page. Its first page
says it is a reprint of 1995 made by OCR from the printed pages, without the figures, and that OCR
errors may remain.

## Decision

1. **The source:** the author's copy, fetched from red3d.com, read by our PDF reader (ADR-0038):
   13 pages, a section each.
2. **The register entry** (`fixtures/sources/register.json`, `reynolds1987`): route `pdf-text`,
   licence `other`, the evidence saying "Copyright 1987 ACM", the copy the author's own, an OCR
   reprint without figures; `textKept: false`; the DOI 10.1145/37402.37406, checked against
   Crossref; the attribution every quote carries.
3. **A source map, `sourcemap/1`** (`packages/contracts/src/sourcemap.ts`,
   `fixtures/papers/flocking/source-map.json`): the source's manifest; the fetched bytes' digest;
   the extracted text's digest and length, never the text; and 13 claims, each a paraphrase and an
   anchor, its quote at most 200 characters, its page and its offsets into the extracted text. The
   quotes together are under a twentieth of the text.
4. **Made and checked against a fresh fetch:** `npm run sources:map -- <map>` locates each quote
   and writes the offsets and digests; `npm run sources:check -- <map>` fetches again and checks the
   bytes, the text and every quote, changing nothing. Both call the network, so neither is part of
   the gate; their output is kept in the session log.
5. **The flocking world is reviewed:** its 19 placeholders become anchors from the map, its source
   the map's manifest, and a test holds every anchor it carries to one the map holds. Four
   statements are reworded to say only what the paper says: velocity matching and flock centering
   as the paper states them, without our "keeps a flock flying the same way" and "nothing pulls a
   straying bird back", locality's reason as the paper gives it, and obstacle avoidance as a
   manoeuvre that may for a while override flock centering.
6. **Kermack and McKendrick 1927 is not fetched.** The Royal Society states that all its articles
   older than 70 years are free to read, so the paper is (doi 10.1098/rspa.1927.0118). But its site
   answers this machine's requests with 403, the article page and the PDF alike, and a request
   dressed as a browser to get past that is not ours to make. Threshold Town stays a draft until the
   owner downloads the PDF in a browser; the same map, made from that file, then makes its anchors
   real.

## Consequences

- G2's reviewed-world check passes; its other items stand as the roadmap lists them.
- The quotes are the OCR reprint's, which may differ from the printed paper by a character; the
  register says so, and a quote is never corrected by hand, since the check reads it as written.
- A change to the author's file shows as "CHANGED" in `sources:check`; the map is then made again
  and the world's anchors follow it.
