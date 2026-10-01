import { tokens } from "../tokens.ts";
import { mixHex } from "./color.ts";

/** Colours of the 3D world by role, every one a token or a mix of two tokens. */
export interface StagePalette {
  readonly name: string;
  /** Background and fog. */
  readonly sky: string;
  readonly groundLow: string;
  readonly groundHigh: string;
  readonly cliff: string;
  /** Outline of the flight field: the torus the simulation runs on. */
  readonly field: string;
  readonly bird: string;
  readonly beacon: string;
  readonly obstacle: string;
  /** Directional light. */
  readonly sun: string;
  /** Hemisphere light from below. */
  readonly shade: string;
}

/** The accepted look: ink birds against a cream sky, like starlings at dusk, over a soft valley. */
export const valleyDay: StagePalette = Object.freeze({
  name: "valley-day",
  sky: tokens.cream,
  groundLow: mixHex(tokens.line, tokens.lime, 0.35),
  groundHigh: mixHex(tokens.line, tokens.aqua, 0.3),
  cliff: tokens.sub,
  field: tokens.aqua,
  bird: tokens.ink,
  beacon: tokens.aqua,
  obstacle: tokens.sub,
  sun: tokens.cream,
  shade: mixHex(tokens.sub, tokens.line, 0.5),
});

/** Dark mode: cream and ink swap, aqua and lime stay. */
export const dusk: StagePalette = Object.freeze({
  name: "dusk",
  sky: tokens.dark,
  groundLow: mixHex(tokens.dark, tokens.sub, 0.5),
  groundHigh: mixHex(tokens.dark, tokens.aqua, 0.22),
  cliff: mixHex(tokens.dark, tokens.ink, 0.5),
  field: tokens.aqua,
  bird: tokens.cream,
  beacon: tokens.lime,
  obstacle: tokens.line,
  sun: mixHex(tokens.cream, tokens.aqua, 0.25),
  shade: tokens.dark,
});
