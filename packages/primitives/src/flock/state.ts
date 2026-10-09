export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** A beacon or obstacle a learner placed. The id lets a later event remove it. */
export interface Entity extends Vec2 {
  readonly id: string;
}

export interface Agent {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}

/**
 * Plain JSON, so a JSON round trip reproduces it exactly. Invariants: at least two
 * agents; every agent, beacon and obstacle lies in [0, width) × [0, height); entity
 * ids are unique across beacons and obstacles.
 */
export interface FlockState {
  readonly width: number;
  readonly height: number;
  /** Steps taken since init. */
  readonly stepIndex: number;
  readonly agents: readonly Agent[];
  readonly beacons: readonly Entity[];
  readonly obstacles: readonly Entity[];
}

// A type alias rather than an interface so it satisfies Record<string, number>.
export type FlockObservables = {
  directionalAgreement: number;
  meanNeighbourDistance: number;
  clusterCount: number;
  /** The share of birds that are strays, in no group (E18). */
  strayShare: number;
  /** E19: the largest group's root-mean-square distance from its centre, in world units; 0 with no group. */
  groupSpread: number;
  /** E20: birds closer than 1 world unit to an obstacle. */
  birdsAtObstacles: number;
};
