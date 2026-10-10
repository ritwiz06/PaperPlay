import { describe, expect, it } from "vitest";
import { sceneKit, SCENE_KITS, SceneKitManifest, upgradeWorldSpec, WorldSpec, WorldSpecV2, WorldSpecV3, type WorldSpecV3 as Spec } from "../src/index.ts";
import { anchor, exploration, issuesOf, worldSpec } from "./examples.ts";

// worldspec/3 (ADR-0027). Its examples are worldspec/2's, upgraded: every level given a
// prediction, as version 3 requires, then carried across by upgradeWorldSpec.

/** The contract tests' worldspec/2 example, every level asking for a prediction. */
function v2(): ReturnType<typeof worldSpec> {
  const spec = worldSpec();
  spec.levels = spec.levels.map((level) => ({ ...level, guidedExploration: exploration() }));
  return spec;
}

/** The same world in worldspec/3. */
function v3(): Spec {
  const upgraded = upgradeWorldSpec(WorldSpec.parse(v2()));
  if (!upgraded.ok) throw new Error(JSON.stringify(upgraded.problems));
  return structuredClone(upgraded.spec);
}

const paths = (value: unknown): string[] => issuesOf(WorldSpecV3, value).map((issue) => issue.path);

describe("[R03] WorldSpec reads worldspec/2 and worldspec/3", () => {
  it("accepts either version, each by its own schema, and no other", () => {
    expect(issuesOf(WorldSpec, v2())).toEqual([]);
    expect(issuesOf(WorldSpec, v3())).toEqual([]);
    expect(issuesOf(WorldSpecV2, v3()).length).toBeGreaterThan(0);
    expect(issuesOf(WorldSpecV3, v2()).length).toBeGreaterThan(0);
    expect(issuesOf(WorldSpec, { ...v3(), schemaVersion: "worldspec/4" }).map((issue) => issue.code)).toEqual(["invalid_union"]);
  });
});

describe("[R03] upgrading worldspec/2 to worldspec/3", () => {
  it("keeps everything version 2 said: seconds become time, limitations become what the world cannot show", () => {
    const old = WorldSpecV2.parse(v2());
    const spec = v3();
    expect(spec.schemaVersion).toBe("worldspec/3");
    expect(spec.timeUnit).toBe("second");
    expect(spec.openingSeed).toBe(0);
    expect(spec.routing).toEqual({ tier: "A", family: "agents", reason: expect.stringContaining("worldspec/2") as unknown, primitive: { status: "released" } });
    expect(spec.limits).toEqual(old.limitations.map((text) => ({ text, origin: "teaching-choice", anchors: [] })));
    spec.levels.forEach((level, index) => {
      const before = old.levels[index]?.counterfactual.difference;
      expect(level.counterfactual.difference.time).toBe(before?.seconds);
      expect(level.counterfactual.difference.summary).toEqual(before?.summary.kind === "at" ? { kind: "at", time: before.summary.seconds } : before?.summary);
    });
    expect({ ...spec.levels[0], counterfactual: null }).toEqual({ ...old.levels[0], counterfactual: null });
  });

  it("refuses a version 2 level with no prediction, since version 3 asks every level for one", () => {
    const upgraded = upgradeWorldSpec(WorldSpec.parse(worldSpec()));
    expect(upgraded.ok).toBe(false);
    if (!upgraded.ok) expect(upgraded.problems.map((problem) => problem.path)).toEqual(["levels.0.guidedExploration", "levels.1.guidedExploration", "levels.2.guidedExploration"]);
  });

  it("passes a version 3 spec through as it is", () => {
    const spec = WorldSpecV3.parse(v3());
    const upgraded = upgradeWorldSpec(spec);
    expect(upgraded.ok && upgraded.spec).toBe(spec);
  });
});

describe("[R03] worldspec/3's own rules", () => {
  it("asks every level for a prediction before its What-if", () => {
    const spec = v3();
    const { guidedExploration: _exploration, ...bare } = spec.levels[1] as Spec["levels"][number];
    expect(paths({ ...spec, levels: [spec.levels[0], bare, spec.levels[2]] })).toEqual(["levels.1.guidedExploration"]);
  });

  it("counts a level's time and its summary's in the world's time unit, as time, not seconds", () => {
    const spec = v3();
    const fork = spec.levels[0]?.counterfactual;
    if (!fork) throw new Error("no level");
    const { time, ...noTime } = fork.difference;
    const level = (difference: unknown) => ({ ...spec, levels: [{ ...spec.levels[0], counterfactual: { ...fork, difference } }, ...spec.levels.slice(1)] });
    expect(paths(level({ ...noTime, seconds: time }))).toContain("levels.0.counterfactual.difference");
    expect(paths(level({ ...fork.difference, summary: { kind: "at", time: time + 1 } }))).toEqual(["levels.0.counterfactual.difference.summary.time"]);
    expect(paths({ ...spec, timeUnit: "fortnight" })).toEqual(["timeUnit"]);
  });

  it("opens on a seed of its own, a whole 32-bit number", () => {
    expect(paths({ ...v3(), openingSeed: 1.5 })).toEqual(["openingSeed"]);
    expect(paths({ ...v3(), openingSeed: 2 ** 32 })).toEqual(["openingSeed"]);
  });

  it("says at least one thing the world cannot show, a paper-derived one with its anchor", () => {
    expect(paths({ ...v3(), limits: [] })).toEqual(["limits"]);
    expect(paths({ ...v3(), limits: [{ text: "Only small towns.", origin: "paper-derived", anchors: [] }] })).toEqual(["limits.0.anchors"]);
    expect(paths({ ...v3(), limits: [{ text: "Only small towns.", origin: "paper-derived", anchors: [anchor()] }] })).toEqual([]);
  });

  it("routes tier A to a released primitive and tier B to an unmerged one, and keeps a world on an unmerged primitive a draft", () => {
    const unmerged = { status: "unmerged", pullRequest: "https://github.com/ritwiz06/PaperPlay/pull/1" };
    const routed = (routing: Record<string, unknown>, status: "draft" | "reviewed" = "reviewed") => ({ ...v3(), status, routing: { ...v3().routing, ...routing } });
    expect(paths(routed({ tier: "A", primitive: unmerged }, "draft"))).toEqual(["routing.primitive.status"]);
    expect(paths(routed({ tier: "B", primitive: { status: "released" } }))).toEqual(["routing.primitive.status"]);
    expect(paths(routed({ tier: "B", primitive: unmerged }))).toEqual(["status"]);
    expect(paths(routed({ tier: "B", primitive: unmerged }, "draft"))).toEqual([]);
    expect(paths(routed({ tier: "C" }))).toEqual(["routing.tier"]);
  });

  it("names its scene kit by id, which the builder checks against the kits the shell has", () => {
    expect(paths({ ...v3(), design: { ...v3().design, world: "town" } })).toEqual([]);
    expect(paths({ ...v3(), design: { ...v3().design, world: "a town" } })).toEqual(["design.world"]);
  });

  it("keeps worldspec/2's whole-spec rules: the hook first, one action one variable, anchors into its own source", () => {
    const spec = v3();
    expect(paths({ ...spec, levels: [{ ...spec.levels[0], kind: "idea" }, ...spec.levels.slice(1)] })).toEqual(["levels.0.kind"]);
    const elsewhere = { ...anchor(), sourceId: "another1999" };
    expect(paths({ ...spec, limits: [{ text: "Only small towns.", origin: "paper-derived", anchors: [elsewhere] }] })).toEqual(["limits.0.anchors.0.sourceId"]);
  });
});

describe("[R03] the scene kits' manifests", () => {
  it("are valid, one per id, and the valley draws the agents family on a torus", () => {
    for (const kit of SCENE_KITS) expect(SceneKitManifest.parse(kit)).toEqual(kit);
    expect(new Set(SCENE_KITS.map((kit) => kit.id)).size).toBe(SCENE_KITS.length);
    expect(sceneKit("valley")?.draws).toEqual({ families: ["agents"], spaces: ["torus2d"] });
    expect(sceneKit("valley")?.run).toEqual({ one: "sky", many: "skies", on: "on" });
    expect(sceneKit("reef")).toBeUndefined();
  });
});
