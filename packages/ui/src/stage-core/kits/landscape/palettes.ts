import { tokens } from "../../../tokens.ts";
import { mixHex } from "../../color.ts";
import type { StagePalette } from "../../palettes.ts";

/** The landscape's colours by role, beyond the stage's own, every one a token or a mix of two tokens. */
export interface LandscapePalette extends StagePalette {
  /** The terrain at the surface's lowest loss, and at its highest drawn. */
  readonly low: string;
  readonly high: string;
  /** The ground beyond the surface. */
  readonly ground: string;
  /** This world's ball and the What-if's: each keeps 3:1 against the whole of the terrain's range. */
  readonly here: string;
  readonly there: string;
  /** The ring under a ball, so which ball is which never shows by colour alone. */
  readonly ring: string;
}

/** By day: a deep teal valley rising to sage-grey, a cream ball for this world and an orange one for the What-if, each 3:1 against all of it. */
export const landscapeDay: LandscapePalette = Object.freeze({
  name: "landscape-day",
  sky: tokens.cream,
  skyZenith: mixHex(tokens.aqua, tokens.cream, 0.55),
  sunDisc: tokens.cream,
  sun: tokens.cream,
  shade: mixHex(tokens.sub, tokens.line, 0.5),
  cursor: tokens.dark,
  low: mixHex(tokens.sub, tokens.ink, 0.65),
  high: tokens.sub,
  ground: mixHex(tokens.sub, tokens.line, 0.35),
  here: tokens.cream,
  there: tokens.ember,
  ring: tokens.dark,
});
