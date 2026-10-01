/** The accepted palette (build brief §6.1). Every colour PaperPlay draws derives from these. */
export const tokens = {
  cream: "#f8faee",
  ink: "#172b2b",
  dark: "#132b2b",
  aqua: "#62cbc2",
  lime: "#d4f581",
  line: "#d2ddd3",
  sub: "#526a66",
} as const;

export type Token = keyof typeof tokens;

/** One legend, always visible. Generated inference also gets a hatched outline so it never reads as evidence. */
export const originColors = {
  "paper-derived": tokens.ink,
  "teaching-choice": tokens.aqua,
  "computed-observation": tokens.lime,
  "generated-inference": tokens.sub,
} as const;
