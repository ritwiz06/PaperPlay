import type { EditablePrimitive, EntityDescription, PrimitiveDescription } from "../../types.ts";
import { deepFreeze } from "../../variables.ts";
import { applyFlockEdit } from "./edits.ts";
import { headingsOf } from "./headings.ts";
import { initFlock } from "./init.ts";
import { atRocksOf, measureFlock, spreadOf } from "./measure.ts";
import { neighboursOf } from "./neighbours.ts";
import { FLOCK_VARIABLES, FlockParams } from "./params.ts";
import { FlockStateSchema } from "./state-schema.ts";
import type { FlockObservables, FlockState } from "./state.ts";
import { FIXED_TIMESTEP, stepFlock } from "./step.ts";

export { headingsOf as flockHeadings, type Headings } from "./headings.ts";
export { atRocksOf as flockAtRocks, readsAsOneGroup as flockReadsAsOneGroup, spreadOf as flockSpread, type AtRocks, type Spread } from "./measure.ts";
export { neighboursOf as flockNeighbours, type Neighbourhood } from "./neighbours.ts";
export { flockDefaultParams, FlockParams } from "./params.ts";
export { FlockStateSchema } from "./state-schema.ts";
export type { Agent, Entity, FlockObservables, FlockState, Vec2 } from "./state.ts";

const DESCRIPTION: PrimitiveDescription = deepFreeze({
  variables: FLOCK_VARIABLES,
  observables: {
    directionalAgreement: {
      unit: "fraction from 0 to 1",
      meaning: "Length of the birds' average heading: 0 when headings cancel out, 1 when every bird flies the same way.",
    },
    meanNeighbourDistance: {
      unit: "world units",
      meaning: "Average distance from each bird to its nearest neighbour, measured the short way round the world.",
    },
    clusterCount: {
      unit: "groups",
      meaning:
        "Number of groups: birds closer than 4.5 world units whose headings differ by less than 45° are linked, directly or through others, and a cluster of fewer than 4 birds is strays, not a group. The thresholds are fixed so counts compare across settings.",
    },
    strayShare: {
      unit: "fraction from 0 to 1",
      meaning:
        "Share of birds that are strays, in clusters of fewer than 4. The flock reads as one group when it has exactly one group and at most half its birds are strays.",
    },
    groupSpread: {
      unit: "world units",
      meaning:
        "How far the largest group spreads: the root-mean-square distance of its birds from its centre, measured the short way round the world. 0 when there is no group.",
    },
    birdsAtObstacles: {
      unit: "birds",
      meaning: "Birds closer than 1 world unit to a rock, about the size a rock is drawn: birds flying through it. Fixed, so counts compare across obstacleRadius settings.",
    },
  },
  assumptions: [
    "A flat world that wraps around (a torus): a bird leaving one edge re-enters at the opposite edge, and every distance is measured the short way round.",
    "Each rule steers a bird's velocity toward what that rule wants, at a rate set by its weight: alignment toward the neighbours' mean velocity, cohesion toward their centre, separation directly away from crowding neighbours, a beacon toward the nearest beacon.",
    "The rules are summed and the total is capped at maxAcceleration: a weighted sum, not a priority scheme.",
    "Neighbourhoods are full circles; birds have no blind angle.",
    "Cohesion eases off within 3 world units of the local centre, and beacon pull within 2.5 world units of the beacon.",
    "Obstacles push birds away in proportion to how far inside obstacleRadius they are; they are not solid.",
    "Speed is kept between minSpeed and maxSpeed after every update.",
    "All birds update together from the previous state with a fixed 1/60 s timestep (semi-implicit Euler).",
    "Birds at exactly the same point exert no separation on each other.",
    "Learners place and remove named beacons and obstacles between steps; a placement wraps onto the torus.",
    "A two-dimensional teaching adaptation, not a reproduction of the paper's system or results; defaults and ranges are teaching choices.",
  ],
});

/** The flock's read-only queries Q1–Q4 (MODEL.md), by name, for the flocking kit to draw. */
export interface FlockQueries {
  readonly neighbours: typeof neighboursOf;
  readonly headings: typeof headingsOf;
  readonly spread: (state: FlockState) => ReturnType<typeof spreadOf>;
  readonly atRocks: typeof atRocksOf;
}

export type FlockPrimitive = EditablePrimitive<FlockParams, FlockState, FlockObservables> & {
  readonly entities: Readonly<Record<"beacon" | "obstacle", EntityDescription>>;
  readonly queries: FlockQueries;
};

/** flock.planar.weighted@3.1.0, specified equation by equation in MODEL.md. */
export const flockPlanarWeighted: FlockPrimitive = Object.freeze({
  id: "flock.planar.weighted",
  version: "3.1.0",
  family: "agents",
  fixedTimestep: FIXED_TIMESTEP,
  // Seconds, watched at the wall clock's pace at 1x.
  time: Object.freeze({ unit: "second", perWatchSecond: 1 }),
  // A torus sized by the two start-up variables (E1, E10).
  space: Object.freeze({ kind: "torus2d", width: "worldWidth", height: "worldHeight" }),
  entities: Object.freeze({
    beacon: Object.freeze({ meaning: "A point the birds steer toward, the nearest one only (E6)." }),
    obstacle: Object.freeze({ meaning: "A rock that pushes birds away inside obstacleRadius (E7)." }),
  }),
  queries: Object.freeze({ neighbours: neighboursOf, headings: headingsOf, spread: (state: FlockState) => spreadOf(state), atRocks: atRocksOf }),
  paramSchema: FlockParams,
  stateSchema: FlockStateSchema,
  init: initFlock,
  step: stepFlock,
  measure: measureFlock,
  apply: applyFlockEdit,
  describe: (): PrimitiveDescription => DESCRIPTION,
});
