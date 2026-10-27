/**
 * A world the shell can play (ADR-0029): the world as built, and its scene kit's halves, readouts
 * and words. The shell is written once against this; each world's binding supplies its own.
 * Types are erased at this boundary: a binding makes its sessions and reads its own snapshots, so
 * what it hands the shell and what the shell hands back always match.
 */
import type { BuiltLevel, BuiltWorld } from "@paperplay/pipeline";
import type { KitMark, StageDriver } from "@paperplay/ui/react";
import type { BaseEmphasis, BaseFrame, Rect, StageKit } from "@paperplay/ui/stage-core";
import type { ComponentType, ReactNode } from "react";
import type { CoreSnapshot, SessionOptions, Stepped, WorldSession } from "../world/session.ts";

export type PlaySession = WorldSession<Record<string, number>, Stepped, Record<string, number>, unknown, BaseEmphasis, unknown>;
export type PlaySnapshot = CoreSnapshot<Record<string, number>, Record<string, number>>;

/** What the shell gives a world's own stage: the driver it draws from, where to draw, and what the learner does. */
export interface OwnStageProps {
  readonly driver: StageDriver;
  readonly name: string;
  readonly window: Rect | null;
  readonly onTogglePlay: () => void;
  readonly onReadout?: () => void;
}

export interface PlayableWorld {
  readonly world: BuiltWorld;
  /** The scene kit's pure half, which the stage draws with; absent for a world that draws its own stage. */
  readonly stage?: StageKit<unknown, BaseEmphasis, unknown, BaseFrame>;
  /**
   * A stage of the world's own, in place of a kit's Three.js stage: a generated world's drawing of
   * what its sandbox sends (ADR-0058). Given a driver, it draws; it never measures.
   */
  readonly Stage?: ComponentType<OwnStageProps>;
  /** How the kit draws the world, apart from emphasis. */
  readonly look: unknown;
  /** Whether the stage follows the kit's focus, or holds the whole field still. */
  readonly framing: "follow" | "overview";
  readonly mark: KitMark;
  /** What the world is about, in words: "A PaperPlay world about {about}". */
  readonly about: string;
  /** What the stage shows, for people who cannot see it. */
  readonly stageLabel: string;
  /** A level's session options: its own parameters and setup, on the world's opening seed. */
  options(level: BuiltLevel, playing: boolean): SessionOptions<Record<string, number>, Stepped>;
  createSession(options: SessionOptions<Record<string, number>, Stepped>): PlaySession;
  /** The level's readout, showing the primitive's own values. */
  readout(level: BuiltLevel, snapshot: PlaySnapshot, showNumber: boolean, yaw: number): ReactNode;
  /** What the fork's chart calls a metric. */
  chartName(level: BuiltLevel, metricId: string): string;
  /** The top of the fork chart's value axis, fitted to the measured quantity as the visibility rule fits it; otherwise the shell rounds above what is drawn. */
  chartTop?(level: BuiltLevel, values: readonly number[]): number;
  /** A level's own look, when it differs from the world's, such as a town drawn through a lens. */
  lookFor?(level: BuiltLevel): unknown;
  /** A teaching choice in how the level is drawn, said on screen beside the fork, such as a lens; null when there is none. */
  sceneNote?(level: BuiltLevel): string | null;
  /**
   * In a fork, what a pane draws from both worlds' inputs, when its kit draws the other world beside
   * its own, as the landscape draws both balls on one surface (ADR-0047). Absent, each pane draws its own world.
   */
  forkInput?(own: unknown, other: unknown, pane: "here" | "there"): unknown;
  /** How measured values are shown, when not as the model counts them: shares as people in a stated town. */
  displayScale?(level: BuiltLevel): { readonly factor: number; readonly unit: string } | null;
}
