# ADR-0002: Typography: Fredoka and Literata, self-hosted

- Status: accepted
- Date: 2026-10-01
- Decided by: the project owner, on 2026-10-01, who chose the pair, self-hosting and "only
  the weights we use". The weights, subsets and tests are this ADR's.

## Context

The build brief (§6.1) asks for "one display family with real personality and one text
family, clearly distinct", proposed and justified here. It rules out Inter, Roboto, Arial,
a system stack, and monospace data labels. The prototype used DM Sans and Manrope from
Google's servers. Until now the app fell back to the system font.

## Decision

- **Fredoka is the interface and display face.** It sets headings, controls, labels and
  readouts, in two weights:
  - 400 for text;
  - 600 for headings, emphasis and buttons.

  No element may ask for another weight, so the browser never synthesises a fake bold.
- **Literata sets paper passages,** in weight 400. The evidence rail, at G2, is the first
  part of the interface to show them. Italic or other weights are added only when a passage
  needs them.
- **Self-hosted.** The files live in `packages/ui/src/fonts/`, beside `fonts.css`, which
  declares them; `apps/web` imports `@paperplay/ui/fonts.css`. No request leaves the page's
  origin, at runtime or in tests.
- **Only what is used ships:**
  - static instances, one file per weight, from Google Fonts (Fredoka v17, Literata v40);
  - the latin and latin-ext subsets only;
  - woff2 only;
  - the OFL 1.1 licences beside the files.

  Provenance and checksums are in `packages/ui/src/fonts/README.md`.
- **Loading:** `font-display: swap`, with fallbacks of `ui-rounded, system-ui, sans-serif`
  for Fredoka and `Georgia, serif` for Literata. The build keeps every font a separate file
  instead of inlining small ones into the CSS, so a face downloads only when text uses it.

## Why this pair

- **Fredoka:** a rounded sans with a friendly, hand-made feel that stays legible at small
  sizes. It gives the "field notebook that became a place" its personality, and suits a
  sandbox meant for play.
- **Literata:** designed for long reading on screens, with optical sizes for text. A serif
  is unmistakably different from Fredoka's rounded sans.
- **The contrast carries meaning:** the paper speaks in Literata and the world speaks in
  Fredoka. A reader can tell at a glance whose words they are reading. This supports the
  origin labels; it never replaces them.

## Testing

- **`packages/ui/test/fonts.test.ts`** checks four things:
  - the declared faces are exactly Fredoka 400 and 600 and Literata 400;
  - every face points at a woff2 file beside it, never at another origin;
  - no font file goes unused;
  - every family's licence is present, and each file's bytes match the recorded checksum.
- **`tests/e2e/fonts.spec.ts`** blocks and records every off-origin request, then checks
  three things:
  - the page loads exactly Fredoka 400 and 600;
  - Literata loads from the origin on demand;
  - every element with text asks for a shipped weight.
- **Planted failures, six of six caught:**
  - an unused file;
  - a face on Google's CDN;
  - a stale checksum;
  - an extra weight;
  - a Google Fonts stylesheet;
  - a heading at 700.

## Consequences

- **Download size:** a G1 page downloads about 33 KB of fonts, Fredoka 400 and 600 in
  latin. Literata's 20 KB comes with the first page that shows a passage, and latin-ext
  only with text that needs it.
- **Missing glyphs:** characters outside latin and latin-ext, such as Greek letters in
  equations, fall back to the next font in the stack. Adding a subset means adding its file,
  its rule and its checksum, and the font test enforces all three.
- **Numbers in readouts** use Fredoka, not a monospace face. Its figures are proportional,
  and it has no tabular figures: at 40 px, six 1s measure 94 px and six 0s 141 px, with or
  without `tabular-nums`. So readouts get fixed-width, right-aligned slots, and changing
  digits do not shift the layout.
