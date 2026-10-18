/**
 * Any learning world as the shell plays it, in the landscape kit (ADR-0047): the momentum world,
 * and later a world the pipeline generates. Its readout is the level's own measurement, or at
 * Beginner how far down the ball has come; its fork draws both balls on one surface; its chart's
 * axis is the visibility rule's own.
 */
import { visibilityOf, type BuiltLevel, type BuiltWorld } from "@paperplay/pipeline";
import type { LandscapeModel } from "@paperplay/primitives/learning";
import { DescentReadout, LandscapeMark } from "@paperplay/ui/react/landscape";
import { landscapeStage, type LandscapeInput } from "@paperplay/ui/stage-core/landscape";
import { bothBalls, createLandscapeSession, type LandscapeSnapshot, type SessionOptions } from "../world/landscape.ts";
import type { PlayableWorld, PlaySnapshot } from "./types.ts";

export interface LandscapeWorldOptions {
  /** What the world is about, in words: "A PaperPlay world about {about}". */
  readonly about: string;
}

export function landscapeWorld(world: BuiltWorld, options: LandscapeWorldOptions): PlayableWorld {
  const modelOf = (level: BuiltLevel): LandscapeModel => level.primitive as unknown as LandscapeModel;
  const first = world.levels[0];
  if (!first) throw new Error(`${world.title} has no levels`);
  const model = modelOf(first);
  // The session keeps one rule and one surface across levels, so every level must bind the same.
  for (const level of world.levels) {
    if (JSON.stringify(modelOf(level).spec) !== JSON.stringify(model.spec)) throw new Error(`level ${level.id} binds a rule or surface of its own; ${world.title} plays one throughout`);
  }
  const visibility = new Map(visibilityOf(world).map((entry) => [entry.id, entry]));
  const observableLabel: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(model.describe().observables).map(([id, entry]) => [id, entry.meaning]));
  return {
    world,
    stage: landscapeStage,
    look: undefined,
    framing: "overview",
    mark: LandscapeMark,
    about: options.about,
    stageLabel: `${world.title}: a loss surface drawn as terrain, ${model.spec.surface.name}, with a ball where the optimizer stands and a trail where it has been.`,
    options: (level: BuiltLevel, playing: boolean): SessionOptions => ({ seed: world.openingSeed, params: level.params, actions: level.actions, emphasise: level.observable.metricId, playing }),
    // This binding made the session, so its options and snapshots are the landscape's own.
    createSession: (sessionOptions) => createLandscapeSession(model, sessionOptions as SessionOptions),
    readout: (level, snapshot: PlaySnapshot, showNumber) => {
      const landscape = snapshot as unknown as LandscapeSnapshot;
      const { metricId } = level.observable;
      return (
        <DescentReadout
          observable={{ metricId, label: level.observable.shortLabel, value: landscape.observed[metricId] ?? Number.NaN, decimals: level.observable.decimals }}
          loss={landscape.loss}
          startLoss={landscape.startLoss}
          showNumber={showNumber}
        />
      );
    },
    chartName: (_level, metricId) => observableLabel[metricId] ?? metricId,
    // Fitted to the measured quantity, as the visibility rule fits it.
    chartTop: (level) => visibility.get(level.id)?.chart.top ?? 1,
    forkInput: (own, other, pane) => bothBalls(own as LandscapeInput, other as LandscapeInput, pane),
  };
}
