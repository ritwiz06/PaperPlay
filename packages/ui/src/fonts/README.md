# Fonts

PaperPlay's two typefaces, self-hosted so that no request leaves the page's origin, at
runtime or in tests (ADR-0002). `fonts.css` declares them. A browser downloads a face only
when text on the page uses it.

- **Fredoka** is the interface and display face: weights 400 and 600.
- **Literata** sets paper passages: weight 400. The evidence rail is its first user, at G2.

Both are under the SIL Open Font License 1.1 (`OFL-fredoka.txt`, `OFL-literata.txt`).

## Provenance

The files are static instances served by Google Fonts on 2026-10-01: Fredoka v17 and
Literata v40, in the latin and latin-ext subsets, as woff2. They were requested with
weights `400;600` for Fredoka and `400` for Literata. Google serves variable fonts to
current browsers, and the request named a browser without variable-font support, so each
weight arrived as its own file and only the weights in use ship. The unicode ranges in
`fonts.css` are Google's.

| File | Family | Weight | Subset | Bytes | SHA-256 |
|---|---|---|---|---|---|
| `fredoka-400-latin.woff2` | Fredoka | 400 | latin | 16,076 | `9cf74f703532ef61311d6c6dd32a582b6e410727f5fce1dbf5570cbe6b023c2f` |
| `fredoka-400-latin-ext.woff2` | Fredoka | 400 | latin-ext | 2,628 | `fe97fe966d090d46c2bf2fe89faee6ac64d6f4b0a3a9cc3b74df38e3266b3399` |
| `fredoka-600-latin.woff2` | Fredoka | 600 | latin | 16,468 | `b62f2898de150f019961f4884a49f83dcd2ce74375be5e0992c594ebb8f30294` |
| `fredoka-600-latin-ext.woff2` | Fredoka | 600 | latin-ext | 2,692 | `d7d22ddf9d13a2b8db2a77c4eb14f8d5b12832451540393d6091b2e67c6189c3` |
| `literata-400-latin.woff2` | Literata | 400 | latin | 20,420 | `a60c193b55766b68b922e2327e15c2d8c145532f283a27c3411b9c47a8583d18` |
| `literata-400-latin-ext.woff2` | Literata | 400 | latin-ext | 17,616 | `726e1239ef9ece4c26f06475f1d35419932e8b0ce0084451110a739dd36c7a14` |

Sources:
- `fredoka-400-latin.woff2`: https://fonts.gstatic.com/s/fredoka/v17/X7nP4b87HvSqjb_WIi2yDCRwoQ_k7367_B-i2yQag0-mac3O8SL8EemK.woff2
- `fredoka-400-latin-ext.woff2`: https://fonts.gstatic.com/s/fredoka/v17/X7nP4b87HvSqjb_WIi2yDCRwoQ_k7367_B-i2yQag0-mac3O8SL8H-mKpNk.woff2
- `fredoka-600-latin.woff2`: https://fonts.gstatic.com/s/fredoka/v17/X7nP4b87HvSqjb_WIi2yDCRwoQ_k7367_B-i2yQag0-mac3OLyX8EemK.woff2
- `fredoka-600-latin-ext.woff2`: https://fonts.gstatic.com/s/fredoka/v17/X7nP4b87HvSqjb_WIi2yDCRwoQ_k7367_B-i2yQag0-mac3OLyX8H-mKpNk.woff2
- `literata-400-latin.woff2`: https://fonts.gstatic.com/s/literata/v40/or3PQ6P12-iJxAIgLa78DkrbXsDgk0oVDaDPYLanFLHpPf2TbBG_J_HWTA.woff2
- `literata-400-latin-ext.woff2`: https://fonts.gstatic.com/s/literata/v40/or3PQ6P12-iJxAIgLa78DkrbXsDgk0oVDaDPYLanFLHpPf2TbBG_J__WTFCW.woff2

The licences come from the google/fonts repository (`ofl/fredoka/OFL.txt`, `ofl/literata/OFL.txt`).

## Adding a weight or a subset

Add the file, its `@font-face` rule and a row above. `packages/ui/test/fonts.test.ts`
fails when a file and the rules disagree, or when a rule points off the origin.
