/**
 * Any compartment world as the shell plays it, in the town kit (ADR-0029): Threshold Town, and a
 * world the pipeline generated. Its readout is the labelled bar, whose numbers are the solver's own;
 * its chart runs to the town's population. Which compartments' figures stand in a ring, as the ill
 * do, is a choice of drawing only, and the kit's page of what the world cannot show says so.
 */
import type { BuiltLevel, BuiltWorld } from "@paperplay/pipeline";
import type { CompartmentModel } from "@paperplay/primitives/compartments";
import { CompartmentBar, TownMark } from "@paperplay/ui/react/town";
import { FIGURES, townStage, type TownLook } from "@paperplay/ui/stage-core/town";
import { createTownSession, type SessionOptions, type TownSnapshot } from "../world/town.ts";
import type { PlayableWorld, PlaySnapshot } from "./types.ts";

export interface TownWorldOptions {
  /** What the world is about, in words: "A PaperPlay world about {about}". */
  readonly about: string;
  /** Beginner's plain names for compartments whose names are terms of art, by id. */
  readonly beginnerNames?: Readonly<Record<string, string>>;
  /** Which compartments' figures stand in a ring, by id; else every compartment named as ill or infected. */
  readonly ringed?: readonly string[];
}

/** Compartments a reader would call ill, by their names: the ring is a picture, never a measurement. */
const ILL = /\b(ill|sick|infect\w*|acute\w*|chronic\w*|diseased)\b/i;

export function townWorld(world: BuiltWorld, options: TownWorldOptions): PlayableWorld {
  const modelOf = (level: BuiltLevel): CompartmentModel => level.primitive as CompartmentModel;
  const first = world.levels[0];
  if (!first) throw new Error(`${world.title} has no levels`);
  const model = modelOf(first);
  // The session keeps one model across levels, so every level must bind the same one.
  for (const level of world.levels) {
    if (JSON.stringify(modelOf(level).spec) !== JSON.stringify(model.spec)) throw new Error(`level ${level.id} binds a model of its own; ${world.title} plays one model throughout`);
  }
  const compartments = model.spec.compartments;
  const ringedIds = options.ringed ?? compartments.filter((compartment) => ILL.test(compartment.name)).map((compartment) => compartment.id);
  const look: TownLook = { ringed: compartments.flatMap((compartment, index) => (ringedIds.includes(compartment.id) ? [index] : [])) };
  const compartmentOf = (metricId: string): number | null => {
    const expr = model.spec.observables.find((observable) => observable.id === metricId)?.expr;
    const at = expr && "c" in expr ? compartments.findIndex((compartment) => compartment.id === expr.c) : -1;
    return at < 0 ? null : at;
  };
  const populationOf = (params: Readonly<Record<string, number>>): number => Object.values(model.init(params, world.openingSeed).compartments).reduce((sum, value) => sum + value, 0);
  const names = compartments.map((compartment) => compartment.name.toLowerCase());
  const listed = names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names.at(-1) ?? ""}` : (names[0] ?? "");
  return {
    world,
    stage: townStage,
    look,
    framing: "overview",
    mark: TownMark,
    about: options.about,
    stageLabel: `${world.title}: ${FIGURES} figures, each standing for one in ${FIGURES} of the town's people, coloured by whether they are ${listed}.`,
    options: (level: BuiltLevel, playing: boolean): SessionOptions => ({ seed: world.openingSeed, params: level.params, actions: level.actions, emphasise: level.observable.metricId, playing }),
    // This binding made the session, so its options and snapshots are the town's own.
    createSession: (sessionOptions) => createTownSession(model, sessionOptions as SessionOptions),
    readout: (level, snapshot: PlaySnapshot, showNumber) => {
      const town = snapshot as unknown as TownSnapshot;
      const { metricId } = level.observable;
      // Beginner shows words and plain names; Intermediate and Advanced, counts and the model's names.
      const shown = town.shares.map((share) => ({ ...share, name: showNumber ? share.name : (options.beginnerNames?.[share.id] ?? share.name) }));
      return <CompartmentBar compartments={shown} observable={{ metricId, value: town.observed[metricId] ?? Number.NaN, decimals: level.observable.decimals }} watched={compartmentOf(metricId)} showNumber={showNumber} />;
    },
    chartName: (_level, metricId) => model.spec.observables.find((observable) => observable.id === metricId)?.label ?? metricId,
    // Every compartment counts the town, so the chart runs from none to the larger town's whole.
    chartTop: (level) => Math.max(populationOf(level.params), populationOf(level.fork.params)),
  };
}
