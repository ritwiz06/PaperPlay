/**
 * The flocking world as authored: fixtures/worldspecs/flocking-reference.json, built once by
 * the deterministic builder against the registry (ADR-0016). The app never reads the spec
 * directly; it plays what the builder made, and refuses to start if the spec does not build.
 */
import type { FlockParams } from "@paperplay/primitives";
import { buildWorld, type BuiltLevel, type BuiltWorld } from "@paperplay/pipeline";
import { registry } from "@paperplay/primitives";
import spec from "../../../../fixtures/worldspecs/flocking-reference.json";
import { HOOK_SEED } from "./local-world.ts";
import type { SessionOptions } from "./session.ts";

const built = buildWorld(spec, registry);
if (!built.ok) {
  throw new Error(`the flocking world does not build:\n${built.problems.map((problem) => `${problem.path}: ${problem.message}`).join("\n")}`);
}

export const FLOCKING: BuiltWorld = built.world;

/** A level's session: every level opens on the hook seed, a teaching choice (ADR-0003), with its own parameters and setup. */
export function sessionOptionsFor(level: BuiltLevel, playing: boolean): SessionOptions {
  return {
    seed: HOOK_SEED,
    params: level.params as FlockParams,
    actions: level.actions as Readonly<Record<string, keyof FlockParams>>,
    setup: level.setup.map((placement) => placement.event),
    ring: level.observable.metricId === "groupSpread",
    playing,
  };
}
