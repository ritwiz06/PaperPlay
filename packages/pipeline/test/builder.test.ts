import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { registry } from "@paperplay/primitives";
import { describe, expect, it } from "vitest";
import { buildWorld, type BuildResult } from "../src/index.ts";

// The builder against the registry: what a schema cannot see. Each test changes the reference
// world in one way and expects the builder to refuse it, naming where.

const reference = JSON.parse(readFileSync(fileURLToPath(new URL("../../../fixtures/worldspecs/flocking-reference.json", import.meta.url)), "utf8")) as {
  levels: Record<string, unknown>[];
  design: Record<string, unknown> & { sections: Record<string, unknown>[] };
  primitivesUsed: unknown[];
} & Record<string, unknown>;

/** A fresh copy of the reference world, changed by `edit`. */
function changed(edit: (spec: typeof reference) => void): typeof reference {
  const spec = structuredClone(reference);
  edit(spec);
  return spec;
}

const level = (spec: typeof reference, index: number): Record<string, Record<string, unknown>> => spec.levels[index] as Record<string, Record<string, unknown>>;
const pathsOf = (result: BuildResult): string[] => (result.ok ? [] : result.problems.map((problem) => problem.path));

describe("[R08] the builder", () => {
  it("builds the reference world: six levels on flock.planar.weighted@3.1.0, a draft", () => {
    const result = buildWorld(reference, registry);
    expect(result.ok, JSON.stringify(result.ok ? null : result.problems)).toBe(true);
    if (!result.ok) return;
    expect(result.world.status).toBe("draft");
    expect(result.world.levels.map((built) => built.id)).toEqual(["hook", "background", "idea", "method", "evaluation", "result"]);
    expect(result.world.levels.every((built) => built.primitive === registry.get({ id: "flock.planar.weighted", version: "3.1.0" }))).toBe(true);
  });

  it("is deterministic and leaves its input alone", () => {
    const before = structuredClone(reference);
    const first = buildWorld(reference, registry);
    const second = buildWorld(reference, registry);
    expect(reference).toEqual(before);
    expect(first).toEqual(second);
  });

  it("derives a restart only from start-up variables", () => {
    const result = buildWorld(reference, registry);
    if (!result.ok) throw new Error("the reference world must build");
    expect(result.world.levels.map((built) => built.fork.restarts)).toEqual([false, false, false, false, false, true]);
    expect(result.world.levels[5]?.fork.overrides).toEqual([
      { variable: "worldWidth", from: 32, to: 64, phase: "init" },
      { variable: "worldHeight", from: 32, to: 64, phase: "init" },
    ]);
  });

  it("shows and hides the shell's elements by id, as each depth variant says", () => {
    const result = buildWorld(reference, registry);
    if (!result.ok) throw new Error("the reference world must build");
    const hook = result.world.levels[0];
    expect([...(hook?.visible.beginner ?? [])].sort()).toEqual(["analogy", "range-words"]);
    expect([...(hook?.visible.advanced ?? [])].sort()).toEqual(["control-value", "equation", "range-numbers", "readout-number"]);
  });

  it("starts the engine at the control's default, even where the primitive's differs", () => {
    const spec = changed((draft) => {
      const manipulable = level(draft, 0).manipulable as Record<string, unknown>;
      manipulable.defaultValue = 1.25;
    });
    const result = buildWorld(spec, registry);
    if (!result.ok) throw new Error(JSON.stringify(result.problems));
    expect(result.world.levels[0]?.params.alignmentWeight).toBe(1.25);
    expect(result.world.levels[0]?.fork.params.alignmentWeight).toBe(0);
  });

  it("reports schema problems with their paths, building nothing", () => {
    const result = buildWorld(changed((draft) => void (level(draft, 0).kind = "idea" as never)), registry);
    expect(pathsOf(result)).toEqual(["levels.0.kind"]);
  });

  it("refuses a primitive or version the registry does not hold", () => {
    const spec = changed((draft) => {
      for (const entry of draft.levels) (entry as Record<string, Record<string, unknown>>).binding!.primitive = { id: "flock.planar.weighted", version: "2.2.0" };
      draft.primitivesUsed = [{ id: "flock.planar.weighted", version: "2.2.0" }];
    });
    expect(pathsOf(buildWorld(spec, registry))).toEqual(["levels.0.binding.primitive", "levels.1.binding.primitive", "levels.2.binding.primitive", "levels.3.binding.primitive", "levels.4.binding.primitive", "levels.5.binding.primitive"]);
  });

  it("refuses a control on a variable the primitive does not have, or one that only shapes the start", () => {
    expect(pathsOf(buildWorld(changed((draft) => void (level(draft, 2).manipulable!.targetVariable = "separationStrength")), registry))).toEqual(["levels.2.manipulable.targetVariable"]);
    const startUp = changed((draft) => {
      Object.assign(level(draft, 1).manipulable!, { targetVariable: "agentCount", range: [10, 100], unit: "birds", defaultValue: 72 });
      level(draft, 1).slider = { step: 1, ends: ["Few", "Many"] };
    });
    expect(pathsOf(buildWorld(startUp, registry))).toEqual(["levels.1.manipulable.targetVariable"]);
  });

  it("refuses a range outside the primitive's own, or a unit that is not the variable's", () => {
    expect(pathsOf(buildWorld(changed((draft) => void (level(draft, 0).manipulable!.range = [0, 5])), registry))).toEqual(["levels.0.manipulable.range"]);
    expect(pathsOf(buildWorld(changed((draft) => void (level(draft, 0).manipulable!.unit = "per minute")), registry))).toEqual(["levels.0.manipulable.unit"]);
  });

  it("refuses a binding that starts the control's variable somewhere else", () => {
    expect(pathsOf(buildWorld(changed((draft) => void (level(draft, 0).binding!.params = { alignmentWeight: 1 })), registry))).toEqual(["levels.0.binding.params.alignmentWeight"]);
  });

  it("refuses binding parameters the primitive does not have, or values outside its ranges", () => {
    expect(pathsOf(buildWorld(changed((draft) => void (level(draft, 2).binding!.params = { gravity: 9.8 })), registry))).toEqual(["levels.2.binding.params.gravity"]);
    expect(pathsOf(buildWorld(changed((draft) => void (level(draft, 2).binding!.params = { maxSpeed: 0.2 })), registry))).toEqual(["levels.2.binding.params.minSpeed"]);
  });

  it("refuses an observable the primitive does not measure, or in another unit", () => {
    // The level's prediction observes its observable, so both change together.
    const renamed = changed((draft) => {
      level(draft, 3).observable!.metricId = "groupCount";
      (level(draft, 3).guidedExploration as Record<string, unknown>).observeMetricId = "groupCount";
    });
    expect(pathsOf(buildWorld(renamed, registry))).toEqual(["levels.3.observable.metricId"]);
    expect(pathsOf(buildWorld(changed((draft) => void (level(draft, 3).observable!.unit = "flocks")), registry))).toEqual(["levels.3.observable.unit"]);
  });

  it("refuses a what-if on an unknown variable, out of range, or changing nothing", () => {
    expect(pathsOf(buildWorld(changed((draft) => void (level(draft, 4).counterfactual!.altParams = { rockHardness: 3 })), registry))).toEqual(["levels.4.counterfactual.altParams.rockHardness"]);
    expect(pathsOf(buildWorld(changed((draft) => void (level(draft, 4).counterfactual!.altParams = { obstacleWeight: 25 })), registry))).toEqual(["levels.4.counterfactual.altParams.obstacleWeight"]);
    expect(pathsOf(buildWorld(changed((draft) => void (level(draft, 4).counterfactual!.altParams = { obstacleRadius: 3.4 })), registry))).toEqual(["levels.4.counterfactual.altParams"]);
  });

  it("refuses a placement outside the world, in either world of the fork", () => {
    const outside = changed((draft) => void Object.assign((level(draft, 4).setup as unknown as Record<string, unknown>[])[0]!, { x: 32 }));
    expect(pathsOf(buildWorld(outside, registry))).toEqual(["levels.4.setup.0"]);
    // Level 5's rocks stand at x and y of 8 and 24: in a 12 × 12 world, three lie outside.
    const shrunk = changed((draft) => void (level(draft, 4).counterfactual!.altParams = { worldWidth: 12, worldHeight: 12 }));
    expect(pathsOf(buildWorld(shrunk, registry))).toEqual(["levels.4.setup.1", "levels.4.setup.2", "levels.4.setup.3"]);
  });

  it("refuses a widget binding until the widget tier", () => {
    const spec = changed((draft) => {
      level(draft, 2).binding = { type: "widget", widgetId: "chart-1", sandboxed: true, origin: "generated-inference" };
    });
    expect(pathsOf(buildWorld(spec, registry))).toEqual(["levels.2.binding"]);
  });

  it("refuses design choices the shell cannot draw, rather than drawing something else", () => {
    const spec = changed((draft) => {
      draft.design.world = "reef";
      draft.design.palette = "ember";
      (draft.design.sections[0] as Record<string, unknown>).chartType = "heatmap";
      (draft.design.sections[1] as Record<string, unknown>).motion = "reveal-once";
    });
    expect(pathsOf(buildWorld(spec, registry))).toEqual(["design.world", "design.palette", "design.sections.0.chartType", "design.sections.1.motion"]);
  });
});
