/**
 * @paperplay/primitives: deterministic, fixed-step scientific primitives and their
 * registry. Primitives compute state; renderers only display it.
 */
export * from "./types.ts";
export { assertSeed, mulberry32, type Prng } from "./prng.ts";
export { createRegistry, registry, type PrimitiveRegistry } from "./registry.ts";
export {
  flockDefaultParams,
  FlockParams,
  flockPlanarWeighted,
  type Agent,
  type FlockObservables,
  type FlockState,
  type Vec2,
} from "./flock/index.ts";
