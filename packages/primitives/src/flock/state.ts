export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface Agent {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}

/**
 * Plain JSON, so a JSON round trip reproduces it exactly. Invariants: at least two
 * agents, and every agent, beacon and obstacle lies in [0, width) × [0, height).
 */
export interface FlockState {
  readonly width: number;
  readonly height: number;
  /** Steps taken since init. */
  readonly stepIndex: number;
  readonly agents: readonly Agent[];
  readonly beacons: readonly Vec2[];
  readonly obstacles: readonly Vec2[];
}

// A type alias rather than an interface so it satisfies Record<string, number>.
export type FlockObservables = {
  directionalAgreement: number;
  meanNeighbourDistance: number;
  clusterCount: number;
};
