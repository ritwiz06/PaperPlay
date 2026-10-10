/**
 * The flocking world as the shell plays it (ADR-0029): Murmuration Valley in the valley kit, with
 * the flock's readouts. Each readout shows the primitive's own value.
 */
import type { BuiltLevel } from "@paperplay/pipeline";
import { flockDefaultParams, type FlockObservables } from "@paperplay/primitives/flock";
import { BirdMark, GroupsCounter, HeadingCompass, RocksCounter, SpacingGauge, SpreadDial } from "@paperplay/ui/react/valley";
import { valleyStage } from "@paperplay/ui/stage-core/valley";
import type { ReactNode } from "react";
import { FLOCKING, sessionOptionsFor } from "../world/authored-world.ts";
import { createWorldSession, type SessionOptions, type SessionSnapshot } from "../world/valley.ts";
import type { PlayableWorld, PlaySnapshot } from "./types.ts";

/** What each metric is called on the fork's chart. Presentation: the shell's words for the primitive's observables. */
const METRIC_NAMES: Readonly<Record<string, string>> = {
  directionalAgreement: "Directional agreement",
  meanNeighbourDistance: "Spacing",
  groupSpread: "Spread of the largest group",
  birdsAtObstacles: "Birds inside rocks",
  clusterCount: "Groups",
  strayShare: "Share of strays",
};

/** The level's readout, chosen by its observable; it shows the primitive's own value. */
function readoutFor(level: BuiltLevel, snapshot: SessionSnapshot, showNumber: boolean, yaw: number): ReactNode {
  const { observed } = snapshot;
  switch (level.observable.metricId) {
    case "directionalAgreement":
      return <HeadingCompass angles={snapshot.headings.angles} mean={snapshot.headings.mean} agreement={observed.directionalAgreement} yaw={yaw} showNumber={showNumber} />;
    case "meanNeighbourDistance":
      return <SpacingGauge spacing={observed.meanNeighbourDistance} showNumber={showNumber} />;
    case "groupSpread":
      return <SpreadDial spread={observed.groupSpread} showNumber={showNumber} />;
    case "clusterCount":
      return <GroupsCounter groups={observed.clusterCount} strayShare={observed.strayShare} birds={snapshot.headings.angles.length} showNumber={showNumber} />;
    case "birdsAtObstacles":
      return <RocksCounter rocks={snapshot.rocks.rocks.map((rock) => ({ id: rock.id, birds: rock.birds.length }))} birds={observed.birdsAtObstacles} showNumber={showNumber} />;
    default: {
      const value = observed[level.observable.metricId as keyof FlockObservables];
      return (
        <output className="dial-number" data-element="readout-number" data-observable={level.observable.metricId} data-value={String(value)}>
          {value.toFixed(level.observable.decimals)}
        </output>
      );
    }
  }
}

export const FLOCKING_PLAY: PlayableWorld = {
  world: FLOCKING,
  stage: valleyStage,
  look: { birdColor: "heading" },
  framing: "follow",
  mark: BirdMark,
  about: "flocking",
  stageLabel: `${FLOCKING.title}: a flock of ${flockDefaultParams.agentCount} birds with no leader, each steering only by its near neighbours.`,
  options: sessionOptionsFor,
  // This binding made the session, so its options and snapshots are the flock's own.
  createSession: (options) => createWorldSession(options as SessionOptions),
  readout: (level, snapshot: PlaySnapshot, showNumber, yaw) => readoutFor(level, snapshot as unknown as SessionSnapshot, showNumber, yaw),
  chartName: (_level, metricId) => METRIC_NAMES[metricId] ?? metricId,
};
