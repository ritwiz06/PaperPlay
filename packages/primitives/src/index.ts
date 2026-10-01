/**
 * @paperplay/primitives: deterministic, fixed-step scientific primitives and their
 * registry. Primitives compute state; renderers only display it.
 */
export * from "./types.ts";
export { assertSeed, mulberry32, type Prng } from "./prng.ts";
export { createRegistry, registry, type PrimitiveRegistry } from "./registry.ts";
export { replayRecord, runEvents, type ReplayReport, type RunPlan, type RunResult, type RunSetup } from "./replay.ts";
export {
  flockDefaultParams,
  flockNeighbours,
  FlockParams,
  flockPlanarWeighted,
  FlockStateSchema,
  type Agent,
  type Entity,
  type FlockObservables,
  type FlockState,
  type Neighbourhood,
  type Vec2,
} from "./flock/index.ts";
