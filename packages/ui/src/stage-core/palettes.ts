/**
 * The colours every stage needs, whatever its kit draws: the sky and its light, and the keyboard
 * cursor. A kit's palette extends these with its own roles, each a token or a mix of two tokens.
 */
export interface StagePalette {
  readonly name: string;
  /** Background and fog. */
  readonly sky: string;
  /** The sky overhead; `sky` is its colour at the horizon. */
  readonly skyZenith: string;
  readonly sunDisc: string;
  /** Directional light. */
  readonly sun: string;
  /** Hemisphere light from below. */
  readonly shade: string;
  /** The keyboard cursor on the ground. */
  readonly cursor: string;
}
