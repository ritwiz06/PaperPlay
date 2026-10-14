/**
 * Threshold Town as the shell plays it (ADR-0029): Kermack and McKendrick's special case of
 * constant rates, fixtures/worldspecs/kermack-mckendrick-1927.json, built by the deterministic
 * builder and drawn in the town kit. It refuses to start if the spec does not build.
 */
import { buildWorld, type BuiltLevel, type BuiltWorld } from "@paperplay/pipeline";
import { registry } from "@paperplay/primitives";
import spec from "../../../../fixtures/worldspecs/kermack-mckendrick-1927.json";
import type { SessionOptions } from "../world/town.ts";
import { townWorld } from "./town-world.tsx";
import type { PlayableWorld } from "./types.ts";

const built = buildWorld(spec, registry);
if (!built.ok) {
  throw new Error(`Threshold Town does not build:\n${built.problems.map((problem) => `${problem.path}: ${problem.message}`).join("\n")}`);
}
export const THRESHOLD_TOWN: BuiltWorld = built.world;

/** The removed have recovered, been isolated or died; at Beginner they are "Recovered or removed". */
export const THRESHOLD_TOWN_PLAY: PlayableWorld = townWorld(THRESHOLD_TOWN, { about: "epidemics", beginnerNames: { z: "Recovered or removed" }, ringed: ["y"] });

/** A level's session: its own parameters, on the world's opening seed, which changes nothing in a model with no chance in it. */
export const townOptionsFor = (level: BuiltLevel, playing: boolean): SessionOptions => THRESHOLD_TOWN_PLAY.options(level, playing) as SessionOptions;
