import { mixHex } from "../../stage-core/color.ts";
import { tokens } from "../../tokens.ts";

// The generic kits' colours (ADR-0058), every one a token or a mix of two tokens, drawn on cream.
// Text is only ever ink or sub, never a group's colour, so every word keeps AA wherever it sits.

/**
 * A frame's six groups, in a fixed order that never changes with the count in use. Each keeps
 * 3:1 against cream. The first three tell apart in full colour and under red-green colour
 * blindness; the accepted palette is quiet, so the last three lean on labels and position too.
 */
export const GROUP_COLOURS = Object.freeze([
  mixHex(tokens.aqua, tokens.ink, 0.45),
  mixHex(tokens.ember, tokens.ink, 0.3),
  tokens.ink,
  mixHex(tokens.lime, tokens.ink, 0.55),
  mixHex(tokens.mist, tokens.ink, 0.55),
  mixHex(tokens.ember, tokens.ink, 0.6),
] as const);

export const mechanismPalette = Object.freeze({
  /** Behind everything. */
  ground: tokens.cream,
  /** The unit square that particles and a network live in, a shade off the ground. */
  field: mixHex(tokens.cream, tokens.line, 0.4),
  /** Baselines, gridlines and the edge of a field. */
  rule: tokens.line,
  /** Every word, and the strongest rule. */
  text: tokens.ink,
  /** Quieter words. */
  quiet: tokens.sub,
  /** Drawn under words and rings so they read over anything. */
  halo: tokens.cream,
  /** A tower with no group: sub, drawn as a pale tint under a cap of it, so the beams above carry the colour. */
  tower: tokens.sub,
  /** A network's edges. */
  edge: mixHex(tokens.sub, tokens.ink, 0.35),
  /** A grid's cells, low to high: cream through aqua to a deep teal. */
  heat: [mixHex(tokens.cream, tokens.line, 0.2), tokens.aqua, mixHex(tokens.aqua, tokens.ink, 0.85)] as const,
  /** A landscape, low to high: a deep teal valley rising through aqua to pale lime. */
  terrain: [mixHex(tokens.aqua, tokens.ink, 0.62), mixHex(tokens.aqua, tokens.lime, 0.3), mixHex(tokens.lime, tokens.cream, 0.6)] as const,
  /** A landscape's contour lines, drawn faint. */
  contour: tokens.ink,
});

/** A group's colour; a missing or unknown group takes the kit's own default. */
export function groupColour(group: number | undefined, fallback: string): string {
  return group === undefined ? fallback : (GROUP_COLOURS[group] ?? fallback);
}

/** Steps in a ramp's lookup table: fine enough that neighbouring cells never band visibly. */
const STEPS = 64;

/** A three-stop ramp as a lookup table, so a frame of thousands of cells mixes no colour while drawing. */
export function rampTable(stops: readonly [string, string, string]): readonly string[] {
  return Array.from({ length: STEPS + 1 }, (_, index) => {
    const t = index / STEPS;
    return t <= 0.5 ? mixHex(stops[0], stops[1], t * 2) : mixHex(stops[1], stops[2], (t - 0.5) * 2);
  });
}

/** The table's entry for a value in 0..1; anything else is held to the nearer end. */
export function rampIndex(value: number): number {
  return Math.round(unit(value) * STEPS);
}

/** A value held to 0..1, and anything not a finite number read as 0. */
export function unit(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
}
