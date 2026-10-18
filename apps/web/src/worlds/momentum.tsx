/**
 * The momentum world as the shell plays it (ADR-0047): classical momentum and Nesterov's
 * accelerated gradient on an oblong bowl, fixtures/worldspecs/sutskever-2013-momentum.json, built by
 * the deterministic builder and drawn in the landscape kit. It refuses to start if the spec does not
 * build.
 */
import { buildWorld, type BuiltWorld } from "@paperplay/pipeline";
import { registry } from "@paperplay/primitives";
import spec from "../../../../fixtures/worldspecs/sutskever-2013-momentum.json";
import { landscapeWorld } from "./landscape-world.tsx";
import type { PlayableWorld } from "./types.ts";

const built = buildWorld(spec, registry);
if (!built.ok) {
  throw new Error(`The momentum world does not build:\n${built.problems.map((problem) => `${problem.path}: ${problem.message}`).join("\n")}`);
}
export const MOMENTUM_WORLD: BuiltWorld = built.world;

export const MOMENTUM_PLAY: PlayableWorld = landscapeWorld(MOMENTUM_WORLD, { about: "momentum in gradient descent" });
