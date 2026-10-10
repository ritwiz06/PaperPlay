/**
 * @paperplay/primitives: deterministic, fixed-step scientific primitives and their
 * registry. Primitives compute state; renderers only display it. Each family's primitives are
 * their own entry point, such as `@paperplay/primitives/flock`, so nothing outside a family
 * imports one model by accident.
 */
export * from "./types.ts";
export { assertSeed, mulberry32, type Prng } from "./prng.ts";
export { createRegistry, registry, type PrimitiveRegistry } from "./registry.ts";
export { replayRecord, runEvents, type ReplayReport, type RunPlan, type RunResult, type RunSetup } from "./replay.ts";
