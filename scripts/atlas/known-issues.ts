/**
 * Known issues the atlas captions, kept by hand (ADR-0050): what a review found and has not fixed,
 * by world and, where it is one level's, by level. The atlas adds what it finds itself as it runs:
 * console errors, a page wider than its window, axe violations, a fork that does not finish, and the
 * levels the definitional rule finds definitional. Remove an entry when its issue is fixed.
 */
export interface KnownIssue {
  /** The world's id, as the library's index names it. */
  readonly world: string;
  /** The level's order, or null for the whole world. */
  readonly level: number | null;
  readonly issue: string;
}

export const KNOWN_ISSUES: readonly KnownIssue[] = [
  {
    world: "threshold-town",
    level: null,
    issue: "A draft: its source map waits for Kermack and McKendrick's PDF, so no passage it quotes is checked against the paper yet (ADR-0045).",
  },
  {
    world: "momentum-valley",
    level: null,
    issue: "The camera frames the surface to the right of the level card, so with the card hidden, as in the library's picture, the surface sits off centre.",
  },
  {
    world: "arxiv-2506.19869v1",
    level: 2,
    issue: "Unsupported, by the owner's ruling of 2026-10-18: its words say more contact makes people leave the vaccinated group, which the model does not say.",
  },
  {
    world: "arxiv-2506.19869v1-2026-10-18",
    level: 2,
    issue: "The fork's closing line quotes the paper with its LaTeX as written: “contact rate ($\\beta$)”.",
  },
];
