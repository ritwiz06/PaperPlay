import { tokens } from "../../../tokens.ts";
import { mixHex } from "../../color.ts";
import type { StagePalette } from "../../palettes.ts";

/** The valley's colours by role, beyond the stage's own, every one a token or a mix of two tokens. */
export interface ValleyPalette extends StagePalette {
  readonly groundLow: string;
  readonly groundHigh: string;
  readonly cliff: string;
  /** Outline of the flight field: the torus the simulation runs on. */
  readonly field: string;
  readonly bird: string;
  /** With a bird selected: that bird, the birds it sees, and the birds it cannot see. */
  readonly selected: string;
  readonly neighbour: string;
  readonly context: string;
  /** The ring around a selected bird that shows how far it sees. */
  readonly reach: string;
  readonly beacon: string;
  readonly obstacle: string;
  /** A rock with a bird at it, lit up (Q4). */
  readonly touched: string;
  /** The meadow under the flight field, and the soft band where it meets the valley. */
  readonly meadow: string;
  readonly meadowEdge: string;
  readonly water: string;
  readonly foliage: string;
  readonly trunk: string;
  readonly rock: string;
  /**
   * Colour by heading: a wheel of three palette colours, one per third of a turn, blended in
   * between. Every colour on it keeps 3:1 against the meadow.
   */
  readonly headingWheel: readonly [string, string, string];
}

/** The accepted look: ink birds against a cream sky, like starlings at dusk, over a soft valley. */
export const valleyDay: ValleyPalette = Object.freeze({
  name: "valley-day",
  sky: tokens.cream,
  groundLow: mixHex(tokens.line, tokens.lime, 0.35),
  groundHigh: mixHex(tokens.line, tokens.aqua, 0.3),
  cliff: tokens.sub,
  field: tokens.aqua,
  bird: tokens.ink,
  selected: tokens.dark,
  neighbour: tokens.ink,
  context: mixHex(tokens.ink, tokens.cream, 0.62),
  reach: tokens.aqua,
  cursor: tokens.dark,
  beacon: tokens.aqua,
  obstacle: tokens.sub,
  touched: tokens.aqua,
  sun: tokens.cream,
  shade: mixHex(tokens.sub, tokens.line, 0.5),
  meadow: mixHex(tokens.cream, tokens.lime, 0.3),
  meadowEdge: mixHex(tokens.lime, tokens.sub, 0.3),
  water: mixHex(tokens.aqua, tokens.ink, 0.15),
  foliage: mixHex(tokens.lime, tokens.sub, 0.6),
  trunk: mixHex(tokens.sub, tokens.ink, 0.35),
  rock: mixHex(tokens.line, tokens.sub, 0.45),
  skyZenith: mixHex(tokens.aqua, tokens.cream, 0.55),
  sunDisc: tokens.cream,
  headingWheel: [mixHex(tokens.aqua, tokens.ink, 0.4), mixHex(tokens.lime, tokens.ink, 0.55), tokens.ink] as const,
});

/** Dark mode: cream and ink swap, aqua and lime stay. */
export const dusk: ValleyPalette = Object.freeze({
  name: "dusk",
  sky: tokens.dark,
  groundLow: mixHex(tokens.dark, tokens.sub, 0.5),
  groundHigh: mixHex(tokens.dark, tokens.aqua, 0.22),
  cliff: mixHex(tokens.dark, tokens.ink, 0.5),
  field: tokens.aqua,
  bird: tokens.cream,
  selected: tokens.lime,
  neighbour: tokens.cream,
  context: mixHex(tokens.cream, tokens.dark, 0.6),
  reach: tokens.aqua,
  cursor: tokens.lime,
  beacon: tokens.lime,
  obstacle: tokens.line,
  touched: tokens.lime,
  sun: mixHex(tokens.cream, tokens.aqua, 0.25),
  shade: tokens.dark,
  meadow: mixHex(tokens.dark, tokens.sub, 0.35),
  meadowEdge: mixHex(tokens.dark, tokens.aqua, 0.3),
  water: mixHex(tokens.dark, tokens.aqua, 0.45),
  foliage: mixHex(tokens.dark, tokens.lime, 0.25),
  trunk: mixHex(tokens.dark, tokens.sub, 0.5),
  rock: mixHex(tokens.dark, tokens.line, 0.3),
  skyZenith: mixHex(tokens.dark, tokens.aqua, 0.12),
  sunDisc: mixHex(tokens.cream, tokens.lime, 0.4),
  headingWheel: [tokens.aqua, tokens.lime, tokens.cream] as const,
});

/** A field heading's colour on the palette's wheel: the stops at 0, ⅓ and ⅔ of a turn, blended between. */
export function headingColor(palette: ValleyPalette, angle: number): string {
  const turn = 2 * Math.PI;
  const position = (((angle % turn) + turn) % turn) / turn * palette.headingWheel.length;
  const index = Math.floor(position) % palette.headingWheel.length;
  const next = (index + 1) % palette.headingWheel.length;
  return mixHex(palette.headingWheel[index] ?? palette.bird, palette.headingWheel[next] ?? palette.bird, position - Math.floor(position));
}
