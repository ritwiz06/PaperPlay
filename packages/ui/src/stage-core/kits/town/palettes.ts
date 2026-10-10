import { tokens } from "../../../tokens.ts";
import { mixHex } from "../../color.ts";
import type { StagePalette } from "../../palettes.ts";

/** The town's colours by role, beyond the stage's own, every one a token or a mix of two tokens. */
export interface TownPalette extends StagePalette {
  /** The green the town stands on. */
  readonly ground: string;
  readonly plaza: string;
  readonly wall: string;
  /** Roofs, round the ring of houses in turn. */
  readonly roofs: readonly [string, string, string];
  readonly foliage: string;
  readonly trunk: string;
  /**
   * The figures, by the model's compartments in their order: still well, ill, removed, and any
   * further one. Every colour keeps 3:1 against the ground.
   */
  readonly figures: readonly [string, string, string, string];
  /** The ring an ill figure stands in, so illness never shows by colour alone. */
  readonly ring: string;
}

/** By day: cream sky, a muted green town, cream, lime and ink figures. */
export const townDay: TownPalette = Object.freeze({
  name: "town-day",
  sky: tokens.cream,
  skyZenith: mixHex(tokens.aqua, tokens.cream, 0.55),
  sunDisc: tokens.cream,
  sun: tokens.cream,
  shade: mixHex(tokens.sub, tokens.line, 0.5),
  cursor: tokens.dark,
  ground: mixHex(tokens.sub, tokens.lime, 0.2),
  plaza: mixHex(tokens.line, tokens.cream, 0.5),
  wall: tokens.cream,
  roofs: [tokens.ink, tokens.aqua, tokens.sub] as const,
  foliage: mixHex(tokens.lime, tokens.sub, 0.6),
  trunk: mixHex(tokens.sub, tokens.ink, 0.35),
  figures: [tokens.cream, tokens.lime, tokens.ink, mixHex(tokens.aqua, tokens.cream, 0.7)] as const,
  ring: tokens.lime,
});
