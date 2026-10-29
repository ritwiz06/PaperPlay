/**
 * A generated world as the shell plays it (ADR-0058): its module run in the browser's sandbox, a
 * worker in a separate-origin frame, and drawn by its kit's 2D stage. Every reading is the
 * module's own, through the sandbox; the shell's level card, guide, journal and fork are the same as
 * every world's, and the family's label, "generated model: behaviour checked, not verified against
 * the paper", stands on every level.
 */
import type { MechanismKit, MechanismManifest } from "@paperplay/contracts";
import type { BuiltWorld } from "@paperplay/pipeline";
import type { Primitive } from "@paperplay/primitives";
import { Readout, type StageDriver } from "@paperplay/ui/react";
import { MechanismMark, MechanismStage, type MechanismStageInput } from "@paperplay/ui/react/mechanism";
import { describeReading } from "../hook/guide.ts";
import type { BrowserSandbox } from "../mechanism/sandbox.ts";
import { createMechanismSession, type MechanismState } from "../world/mechanism.ts";
import type { SessionOptions } from "../world/session.ts";
import type { OwnStageProps, PlayableWorld, PlaySnapshot } from "./types.ts";

/** What each kit draws, in words, for the stage's description. */
const KIT_WORDS: Readonly<Record<MechanismKit, string>> = {
  particles: "particles moving on a square",
  towers: "towers, one for each item, joined by beams",
  grid: "a grid of cells, shaded by value",
  network: "a network of nodes and edges",
  landscape: "a landscape of heights, with marks on it",
  charts: "bars side by side",
};

export function mechanismWorld(world: BuiltWorld, sandbox: BrowserSandbox, manifest: MechanismManifest, options: { readonly about: string }): PlayableWorld {
  const first = world.levels[0];
  if (!first) throw new Error(`${world.title} has no levels`);
  // The builder's description of the module: its variables and observables, never its code.
  const primitive = first.primitive as Primitive<Record<string, number>, unknown>;
  const stageLabel = `${manifest.title}: the module's own drawing of its state, as ${KIT_WORDS[manifest.kit]}.`;
  const measurementOf = (id: string) => manifest.measurements.find((measurement) => measurement.id === id);
  // One stage component for the world's life, so React keeps its canvas between renders.
  const Stage = ({ driver, name, window, onTogglePlay, onReadout }: OwnStageProps) => (
    <MechanismStage driver={driver as StageDriver<MechanismStageInput>} label={stageLabel} name={name} window={window} onTogglePlay={onTogglePlay} {...(onReadout ? { onReadout } : {})} />
  );
  return {
    world,
    Stage,
    look: null,
    framing: "overview",
    mark: MechanismMark,
    about: options.about,
    stageLabel,
    options: (level, playing) => ({ seed: world.openingSeed, params: level.params, actions: level.actions, emphasise: level.observable.metricId, playing }),
    // This binding made the session, so its options and snapshots are the module's own.
    createSession: (sessionOptions) => createMechanismSession(sandbox, primitive, manifest, sessionOptions as SessionOptions<Record<string, number>, MechanismState>),
    readout: (level, snapshot: PlaySnapshot, showNumber) => {
      const { metricId } = level.observable;
      const value = snapshot.observed[metricId] ?? Number.NaN;
      const measurement = measurementOf(metricId);
      // Beginner reads the explainer's words for the value, each reading a lower bound in its own units;
      // a value below every bound takes the lowest reading's words, as the guide's line does.
      const words = describeReading(level.guide.readings, value);
      const text = Number.isNaN(value) ? "starting" : showNumber ? value.toFixed(level.observable.decimals) : words;
      return (
        <dl className="readouts">
          <Readout label={measurement?.label ?? level.observable.label} observable={metricId} value={value} text={text} {...(showNumber && measurement?.unit ? { unit: measurement.unit } : {})} />
        </dl>
      );
    },
    chartName: (_level, metricId) => measurementOf(metricId)?.label ?? metricId,
    // Fitted to what both worlds measured, to a round number above it, as the visibility rule's chart is.
    chartTop: (_level, values) => {
      const highest = Math.max(0, ...values.filter(Number.isFinite)) * 1.15;
      if (highest === 0) return 1;
      const power = 10 ** Math.floor(Math.log10(highest));
      const step = highest / power < 2 ? power / 2 : power;
      return Math.ceil(highest / step) * step;
    },
  };
}
