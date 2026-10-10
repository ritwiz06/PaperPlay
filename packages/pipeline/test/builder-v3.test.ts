import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sceneKit } from "@paperplay/contracts";
import { registry } from "@paperplay/primitives";
import { describe, expect, it } from "vitest";
import { buildWorld, type BuildResult } from "../src/index.ts";

// The builder on worldspec/3 (ADR-0027): what version 3 adds that only the registry and the scene
// kits can check, and worldspec/2 built through its upgrade to the same world.

type Json = Record<string, unknown>;
const reference = JSON.parse(readFileSync(fileURLToPath(new URL("../../../fixtures/worldspecs/flocking-reference.json", import.meta.url)), "utf8")) as Json & { levels: Json[] };
const changed = (edit: (spec: typeof reference) => void): typeof reference => {
  const spec = structuredClone(reference);
  edit(spec);
  return spec;
};
const pathsOf = (result: BuildResult): string[] => (result.ok ? [] : result.problems.map((problem) => problem.path));
const difference = (level: Json): Json => (level.counterfactual as Json).difference as Json;

/** The reference world written back in worldspec/2, as it stood before version 3. */
function asVersion2(spec: typeof reference): Json {
  const { routing: _routing, timeUnit: _unit, openingSeed: _seed, limits, ...rest } = spec;
  return {
    ...rest,
    schemaVersion: "worldspec/2",
    levels: spec.levels.map((level) => {
      const { time, summary, ...kept } = difference(level) as Json & { time: number; summary: Json };
      const back = { ...kept, seconds: time, summary: summary.kind === "at" ? { kind: "at", seconds: summary.time } : summary };
      return { ...level, counterfactual: { ...(level.counterfactual as Json), difference: back } };
    }),
    limitations: (limits as { text: string }[]).map((limit) => limit.text),
  };
}

describe("[R08] the builder on worldspec/3", () => {
  it("builds the reference world with its routing, its kit, its time unit, its opening seed and what it cannot show", () => {
    const result = buildWorld(reference, registry);
    if (!result.ok) throw new Error(JSON.stringify(result.problems));
    const { world } = result;
    expect(world.routing).toMatchObject({ tier: "A", family: "agents" });
    expect(world.family.id).toBe("agents");
    expect(world.kit).toBe(sceneKit("valley"));
    expect([world.timeUnit, world.perWatchSecond, world.openingSeed]).toEqual(["second", 1, 5]);
    expect(world.limits.length).toBeGreaterThan(0);
    expect(world.levels.every((level) => level.exploration.choices.length >= 2)).toBe(true);
  });

  it("builds the same world from worldspec/2, through its upgrade: every level the same, only the opening seed lost", () => {
    const now = buildWorld(reference, registry);
    const before = buildWorld(asVersion2(reference), registry);
    if (!now.ok || !before.ok) throw new Error(JSON.stringify([now, before]));
    expect(before.world.levels).toEqual(now.world.levels);
    expect(before.world.openingSeed).toBe(0);
    expect({ ...before.world, routing: null, openingSeed: null }).toEqual({ ...now.world, routing: null, openingSeed: null });
  });

  it("refuses a kit the shell does not have, a routing to another family, and a time unit that is not the primitive's", () => {
    expect(pathsOf(buildWorld(changed((spec) => void ((spec.design as Json).world = "reef")), registry))).toEqual(["design.world"]);
    expect(pathsOf(buildWorld(changed((spec) => void ((spec.routing as Json).family = "compartments")), registry))).toEqual(["routing.family"]);
    expect(pathsOf(buildWorld(changed((spec) => void (spec.timeUnit = "day")), registry))).toEqual(["timeUnit"]);
  });

  it("refuses a level whose time takes more than 20 s to watch at 4x", () => {
    const long = changed((spec) => {
      const level = spec.levels[1] as Json;
      difference(level).time = 81;
    });
    expect(pathsOf(buildWorld(long, registry))).toEqual(["levels.1.counterfactual.difference.time"]);
    const longest = changed((spec) => void (difference(spec.levels[1] as Json).time = 80));
    expect(buildWorld(longest, registry).ok).toBe(true);
  });

  it("refuses a first-reach summary that is not in the world's time unit", () => {
    const wrong = changed((spec) => void (difference(spec.levels[1] as Json).unit = "days"));
    expect(pathsOf(buildWorld(wrong, registry))).toEqual(["levels.1.counterfactual.difference.unit"]);
  });
});
