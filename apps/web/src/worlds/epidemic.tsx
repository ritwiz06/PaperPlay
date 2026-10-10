/**
 * Threshold Town as the shell plays it (ADR-0029): Kermack and McKendrick's special case of
 * constant rates, fixtures/worldspecs/kermack-mckendrick-1927.json, built by the deterministic
 * builder and drawn in the town kit. Its readout is the shares bar, whose number is the solver's
 * own measurement. It refuses to start if the spec does not build.
 */
import { buildWorld, type BuiltLevel, type BuiltWorld } from "@paperplay/pipeline";
import { registry } from "@paperplay/primitives";
import type { CompartmentModel } from "@paperplay/primitives/compartments";
import { SharesBar, TownMark } from "@paperplay/ui/react/town";
import { FIGURES, townStage } from "@paperplay/ui/stage-core/town";
import spec from "../../../../fixtures/worldspecs/kermack-mckendrick-1927.json";
import { createTownSession, type SessionOptions, type TownSnapshot } from "../world/town.ts";
import type { PlayableWorld, PlaySnapshot } from "./types.ts";

const built = buildWorld(spec, registry);
if (!built.ok) {
  throw new Error(`Threshold Town does not build:\n${built.problems.map((problem) => `${problem.path}: ${problem.message}`).join("\n")}`);
}
export const THRESHOLD_TOWN: BuiltWorld = built.world;

/** The model every level binds. The session keeps one model across levels, so every level must bind the same one. */
const modelOf = (level: BuiltLevel): CompartmentModel => level.primitive as CompartmentModel;
const MODEL = modelOf(THRESHOLD_TOWN.levels[0] as BuiltLevel);
for (const level of THRESHOLD_TOWN.levels) {
  if (JSON.stringify(modelOf(level).spec) !== JSON.stringify(MODEL.spec)) throw new Error(`level ${level.id} binds a model of its own; Threshold Town plays one model throughout`);
}

/** A level's session: its own parameters, on the world's opening seed, which changes nothing in a model with no chance in it. */
export function townOptionsFor(level: BuiltLevel, playing: boolean): SessionOptions {
  return { seed: THRESHOLD_TOWN.openingSeed, params: level.params, actions: level.actions, emphasise: level.observable.metricId, playing };
}

/** The compartment an observable is, when it is one compartment alone, by its place in the model's order. */
function compartmentOf(metricId: string): number | null {
  const expr = MODEL.spec.observables.find((observable) => observable.id === metricId)?.expr;
  const at = expr && "c" in expr ? MODEL.spec.compartments.findIndex((compartment) => compartment.id === expr.c) : -1;
  return at < 0 ? null : at;
}

function readoutFor(level: BuiltLevel, snapshot: TownSnapshot, showNumber: boolean) {
  const { metricId } = level.observable;
  return (
    <SharesBar
      compartments={snapshot.shares}
      observable={{ metricId, label: level.observable.shortLabel }}
      value={snapshot.observed[metricId] ?? Number.NaN}
      decimals={level.observable.decimals}
      watched={compartmentOf(metricId)}
      showNumber={showNumber}
    />
  );
}

export const THRESHOLD_TOWN_PLAY: PlayableWorld = {
  world: THRESHOLD_TOWN,
  stage: townStage,
  look: {},
  framing: "overview",
  mark: TownMark,
  about: "epidemics",
  stageLabel: `${THRESHOLD_TOWN.title}: ${FIGURES} figures, each standing for one in ${FIGURES} of the town's people, coloured by whether they are still well, ill or removed.`,
  options: townOptionsFor,
  // This binding made the session, so its options and snapshots are the town's own.
  createSession: (options) => createTownSession(MODEL, options as SessionOptions),
  readout: (level, snapshot: PlaySnapshot, showNumber) => readoutFor(level, snapshot as unknown as TownSnapshot, showNumber),
  chartName: (_level, metricId) => MODEL.spec.observables.find((observable) => observable.id === metricId)?.label ?? metricId,
};
