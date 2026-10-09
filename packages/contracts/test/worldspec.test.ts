import { describe, expect, it } from "vitest";
import { WorldSpec } from "../src/index.ts";
import { action, anchor, difference, exploration, issuesOf, level, pendingSource, placeholder, worldSpec } from "./examples.ts";

type Spec = ReturnType<typeof worldSpec>;
type Patch = Record<string, unknown>;

/** The spec with one level changed. */
function withLevel(index: number, patch: Patch, spec: Spec = worldSpec()): Spec {
  spec.levels[index] = { ...spec.levels[index], ...patch };
  return spec;
}

const paths = (value: unknown): string[] => issuesOf(WorldSpec, value).map((issue) => issue.path);

describe("[R03] WorldSpec: a complete spec", () => {
  it("accepts a reviewed spec with real anchors", () => {
    expect(issuesOf(WorldSpec, worldSpec())).toEqual([]);
  });

  it("accepts a draft whose anchors are placeholders and whose source is pending", () => {
    const spec = worldSpec();
    spec.status = "draft";
    spec.source = pendingSource() as unknown as Spec["source"];
    const swap = (value: unknown): unknown =>
      Array.isArray(value) ? value.map(swap) : typeof value === "object" && value !== null
        ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, key === "anchors" ? (child as unknown[]).map(() => placeholder()) : swap(child)]))
        : value;
    expect(issuesOf(WorldSpec, swap(spec))).toEqual([]);
  });

  it("rejects unknown keys at the top, in a level and in the digest", () => {
    expect(issuesOf(WorldSpec, { ...worldSpec(), score: 10 })).toEqual([{ code: "unrecognized_keys", path: "" }]);
    expect(issuesOf(WorldSpec, withLevel(0, { badge: "gold" }))).toEqual([{ code: "unrecognized_keys", path: "levels.0" }]);
    expect(issuesOf(WorldSpec, { ...worldSpec(), digest: { ...worldSpec().digest, verdict: "true" } })).toEqual([{ code: "unrecognized_keys", path: "digest" }]);
  });

  it("holds three to nine levels", () => {
    const spec = worldSpec();
    expect(paths({ ...spec, levels: spec.levels.slice(0, 2) })).toEqual(["levels"]);
    const many = Array.from({ length: 10 }, (_, index) => level(index === 0 ? "hook" : `level-${index}`, index + 1, index === 0 ? "hook" : "idea"));
    expect(paths({ ...spec, levels: many })).toEqual(["levels"]);
  });
});

describe("[R03] WorldSpec: the hook comes first", () => {
  it("rejects a spec whose first level is not the hook", () => {
    expect(issuesOf(WorldSpec, withLevel(0, { kind: "idea" }))).toEqual([{ code: "custom", path: "levels.0.kind" }]);
  });

  it("rejects a second hook", () => {
    expect(issuesOf(WorldSpec, withLevel(2, { kind: "hook" }))).toEqual([{ code: "custom", path: "levels.2.kind" }]);
  });

  it("numbers levels by their place in the list, and never reuses an id", () => {
    expect(issuesOf(WorldSpec, withLevel(1, { order: 3 }))).toEqual([{ code: "custom", path: "levels.1.order" }]);
    expect(issuesOf(WorldSpec, withLevel(2, { id: "idea" }))).toContainEqual({ code: "custom", path: "levels.2.id" });
  });
});

describe("[R03] WorldSpec: exactly one manipulable and one counterfactual per level", () => {
  it("rejects a list of manipulables or of counterfactuals", () => {
    const one = level("hook", 1, "hook");
    expect(paths(withLevel(0, { manipulable: [one.manipulable, { ...one.manipulable, actionId: "other" }] }))).toEqual(["levels.0.manipulable"]);
    expect(paths(withLevel(0, { counterfactual: [one.counterfactual, one.counterfactual] }))).toEqual(["levels.0.counterfactual"]);
  });

  it("rejects a second manipulable or counterfactual under another key", () => {
    expect(issuesOf(WorldSpec, withLevel(0, { manipulables: [action()] }))).toEqual([{ code: "unrecognized_keys", path: "levels.0" }]);
    expect(issuesOf(WorldSpec, withLevel(0, { counterfactuals: [] }))).toEqual([{ code: "unrecognized_keys", path: "levels.0" }]);
  });

  it("rejects a level with no manipulable or no counterfactual", () => {
    const { manipulable: _manipulable, ...noAction } = level("hook", 1, "hook");
    const { counterfactual: _counterfactual, ...noFork } = level("hook", 1, "hook");
    const spec = worldSpec();
    expect(paths({ ...spec, levels: [noAction, ...spec.levels.slice(1)] })).toEqual(["levels.0.manipulable"]);
    expect(paths({ ...spec, levels: [noFork, ...spec.levels.slice(1)] })).toEqual(["levels.0.counterfactual"]);
  });

  it("lets one action id appear in several levels only if it moves the same variable", () => {
    expect(issuesOf(WorldSpec, worldSpec())).toEqual([]);
    const moved = withLevel(2, { manipulable: { ...level("result", 3, "result").manipulable, targetVariable: "cohesionWeight" } });
    expect(issuesOf(WorldSpec, moved)).toEqual([{ code: "custom", path: "levels.2.manipulable.targetVariable" }]);
  });
});

describe("[R03] WorldSpec: paper-derived statements carry anchors", () => {
  const bare = { origin: "paper-derived", anchors: [] };

  it("in the manipulable, the counterfactual and the caption", () => {
    const one = level("hook", 1, "hook");
    expect(issuesOf(WorldSpec, withLevel(0, { manipulable: { ...one.manipulable, ...bare } }))).toEqual([{ code: "custom", path: "levels.0.manipulable.anchors" }]);
    expect(issuesOf(WorldSpec, withLevel(0, { counterfactual: { ...one.counterfactual, ...bare } }))).toEqual([{ code: "custom", path: "levels.0.counterfactual.anchors" }]);
    expect(issuesOf(WorldSpec, withLevel(0, { caption: { ...one.caption, ...bare } }))).toEqual([{ code: "custom", path: "levels.0.caption.anchors" }]);
  });

  it("in an explanation, a setup placement and a causal claim", () => {
    const one = level("hook", 1, "hook");
    const explanation = { ...one.explanation, intermediate: { ...one.explanation.intermediate, ...bare } };
    expect(issuesOf(WorldSpec, withLevel(0, { explanation }))).toEqual([{ code: "custom", path: "levels.0.explanation.intermediate.anchors" }]);
    const rock = { entityId: "rock", entity: "obstacle", x: 4, y: 4, ...bare };
    expect(issuesOf(WorldSpec, withLevel(0, { setup: [rock] }))).toEqual([{ code: "custom", path: "levels.0.setup.0.anchors" }]);
    const spec = worldSpec();
    spec.digest.causalChain[0] = { ...spec.digest.causalChain[0]!, anchors: [] };
    expect(issuesOf(WorldSpec, spec)).toEqual([{ code: "custom", path: "digest.causalChain.0.anchors" }]);
  });

  it("and the hook's result, always", () => {
    const spec = worldSpec();
    spec.digest.hookResult.anchors = [];
    expect(issuesOf(WorldSpec, spec)).toEqual([{ code: "too_small", path: "digest.hookResult.anchors" }]);
  });

  it("pointing into the spec's own source and its sections", () => {
    const one = level("hook", 1, "hook");
    const elsewhere = { ...anchor(), sourceId: "another1999" };
    expect(issuesOf(WorldSpec, withLevel(0, { caption: { ...one.caption, anchors: [elsewhere] } }))).toEqual([{ code: "custom", path: "levels.0.caption.anchors.0.sourceId" }]);
    const nowhere = { ...anchor(), sectionId: "s9-appendix" };
    expect(issuesOf(WorldSpec, withLevel(0, { caption: { ...one.caption, anchors: [nowhere] } }))).toEqual([{ code: "custom", path: "levels.0.caption.anchors.0.sectionId" }]);
  });
});

describe("[R03] WorldSpec: drafts and reviewed specs", () => {
  it("allows placeholder anchors only in a draft", () => {
    const one = level("hook", 1, "hook");
    const held = withLevel(0, { caption: { ...one.caption, anchors: [placeholder()] } });
    expect(issuesOf(WorldSpec, held)).toEqual([{ code: "custom", path: "levels.0.caption.anchors.0" }]);
    expect(issuesOf(WorldSpec, { ...held, status: "draft" })).toEqual([]);
  });

  it("allows a pending source only in a draft, and then no real anchors", () => {
    const pending = { ...worldSpec(), source: pendingSource() };
    const found = issuesOf(WorldSpec, pending);
    expect(found).toContainEqual({ code: "custom", path: "source" });
    // Each real anchor is reported, since nothing can check its section.
    expect(found.filter((issue) => issue.path.endsWith("anchors.0")).length).toBeGreaterThan(0);
    expect(issuesOf(WorldSpec, { ...pending, status: "draft" }).every((issue) => issue.path !== "source")).toBe(true);
  });

  it("rejects a placeholder that quotes, or has no need", () => {
    const one = level("hook", 1, "hook");
    const quoting = { ...placeholder(), quote: "Words from a paper." };
    expect(paths({ ...withLevel(0, { caption: { ...one.caption, anchors: [quoting] } }), status: "draft" })).toEqual(["levels.0.caption.anchors.0"]);
    const empty = placeholder("");
    expect(paths({ ...withLevel(0, { caption: { ...one.caption, anchors: [empty] } }), status: "draft" })).toEqual(["levels.0.caption.anchors.0.need"]);
  });
});

describe("[R03] WorldSpec: counterfactuals override parameters only", () => {
  const fork = () => level("hook", 1, "hook").counterfactual;

  it("rejects anything but parameter overrides", () => {
    expect(issuesOf(WorldSpec, withLevel(0, { counterfactual: { ...fork(), setup: [] } }))).toEqual([{ code: "unrecognized_keys", path: "levels.0.counterfactual" }]);
    expect(issuesOf(WorldSpec, withLevel(0, { counterfactual: { ...fork(), events: [] } }))).toEqual([{ code: "unrecognized_keys", path: "levels.0.counterfactual" }]);
    expect(issuesOf(WorldSpec, withLevel(0, { counterfactual: { ...fork(), primitive: { id: "other.model", version: "1.0.0" } } }))).toEqual([
      { code: "unrecognized_keys", path: "levels.0.counterfactual" },
    ]);
  });

  it("rejects an override that is not a finite number, or a name that is not a parameter's", () => {
    expect(paths(withLevel(0, { counterfactual: { ...fork(), altParams: { alignmentWeight: "none" } } }))).toEqual(["levels.0.counterfactual.altParams.alignmentWeight"]);
    expect(paths(withLevel(0, { counterfactual: { ...fork(), altParams: { alignmentWeight: Infinity } } }))).toEqual(["levels.0.counterfactual.altParams.alignmentWeight"]);
    expect(paths(withLevel(0, { counterfactual: { ...fork(), altParams: { "alignment weight": 0 } } }))).toEqual(["levels.0.counterfactual.altParams.alignment weight"]);
  });

  it("rejects a counterfactual that overrides nothing", () => {
    expect(issuesOf(WorldSpec, withLevel(0, { counterfactual: { ...fork(), altParams: {} } }))).toEqual([{ code: "custom", path: "levels.0.counterfactual.altParams" }]);
  });
});

describe("[R03] WorldSpec: setup placements", () => {
  const rock = (overrides: Patch = {}) => ({ entityId: "rock", entity: "obstacle", x: 4, y: 4, origin: "teaching-choice", anchors: [], ...overrides });

  it("accepts placements that carry their origin", () => {
    expect(issuesOf(WorldSpec, withLevel(1, { setup: [rock(), rock({ entityId: "beacon", entity: "beacon" })] }))).toEqual([]);
  });

  it("rejects a placement without an origin, of an unknown kind, or at a negative position", () => {
    const { origin: _origin, ...unlabelled } = rock();
    expect(paths(withLevel(1, { setup: [unlabelled] }))).toEqual(["levels.1.setup.0.origin"]);
    expect(paths(withLevel(1, { setup: [rock({ entity: "wall" })] }))).toEqual(["levels.1.setup.0.entity"]);
    expect(paths(withLevel(1, { setup: [rock({ x: -1 })] }))).toEqual(["levels.1.setup.0.x"]);
  });

  it("rejects two placements with one id", () => {
    expect(issuesOf(WorldSpec, withLevel(1, { setup: [rock(), rock({ x: 8 })] }))).toEqual([{ code: "custom", path: "levels.1.setup" }]);
  });
});

describe("[R03] WorldSpec: bonus levels", () => {
  const teaching = { origin: "teaching-choice", anchors: [] };
  const bonusLevel = () => {
    const one = level("result", 3, "result", { bonus: true });
    return {
      ...one,
      manipulable: { ...one.manipulable, ...teaching },
      caption: { ...one.caption, ...teaching },
    };
  };

  it("accepts a last bonus level that labels nothing paper-derived", () => {
    expect(issuesOf(WorldSpec, withLevel(2, bonusLevel()))).toEqual([]);
  });

  it("rejects a bonus level with anything paper-derived", () => {
    const claiming = { ...bonusLevel(), caption: level("result", 3, "result").caption };
    expect(issuesOf(WorldSpec, withLevel(2, claiming))).toEqual([{ code: "custom", path: "levels.2.bonus" }]);
  });

  it("rejects a bonus before an ordinary level, and a bonus hook", () => {
    const early = withLevel(1, { ...bonusLevel(), id: "idea", order: 2, kind: "idea" });
    expect(issuesOf(WorldSpec, early)).toEqual([{ code: "custom", path: "levels.2.bonus" }]);
    const one = level("hook", 1, "hook");
    // Every ordinary level after it is reported too, as coming after a bonus.
    expect(issuesOf(WorldSpec, withLevel(0, { bonus: true, manipulable: { ...one.manipulable, ...teaching }, caption: { ...one.caption, ...teaching } }))).toEqual([
      { code: "custom", path: "levels.0.bonus" },
      { code: "custom", path: "levels.1.bonus" },
      { code: "custom", path: "levels.2.bonus" },
    ]);
  });
});

describe("[R03] WorldSpec: depth variants", () => {
  const variants = () => level("hook", 1, "hook").explanation;

  it("places every shell element in show or hide, exactly once", () => {
    const missing = { ...variants(), intermediate: { ...variants().intermediate, hide: ["range-words", "equation"] } };
    expect(issuesOf(WorldSpec, withLevel(0, { explanation: missing }))).toEqual([{ code: "custom", path: "levels.0.explanation.intermediate.show" }]);
    const both = { ...variants(), intermediate: { ...variants().intermediate, hide: ["range-words", "equation", "analogy", "control-value"] } };
    expect(issuesOf(WorldSpec, withLevel(0, { explanation: both }))).toEqual([{ code: "custom", path: "levels.0.explanation.intermediate.show" }]);
  });

  it("rejects an element id the shell does not have", () => {
    const unknown = { ...variants(), beginner: { ...variants().beginner, show: [...variants().beginner.show, "equation-alignment"] } };
    expect(paths(withLevel(0, { explanation: unknown }))).toContain("levels.0.explanation.beginner.show.2");
  });

  it("gives the equation exactly when it is shown, and only at Advanced", () => {
    const { equation: _equation, ...noEquation } = variants().advanced;
    expect(issuesOf(WorldSpec, withLevel(0, { explanation: { ...variants(), advanced: noEquation } }))).toEqual([{ code: "custom", path: "levels.0.explanation.advanced.equation" }]);
    const early = { ...variants(), intermediate: { ...variants().intermediate, equation: "a = b" } };
    expect(paths(withLevel(0, { explanation: early }))).toContain("levels.0.explanation.beginner.equation");
  });

  it("gives an analogy only at Beginner", () => {
    const late = { ...variants(), advanced: { ...variants().advanced, analogy: "Like a queue.", show: [...variants().advanced.show, "analogy"], hide: ["range-words"] } };
    expect(issuesOf(WorldSpec, withLevel(0, { explanation: late }))).toEqual([{ code: "custom", path: "levels.0.explanation.intermediate.analogy" }]);
  });

  it("keeps Beginner to 90 words and Intermediate to 150", () => {
    const words = (count: number) => Array.from({ length: count }, () => "bird").join(" ");
    expect(issuesOf(WorldSpec, withLevel(0, { explanation: { ...variants(), beginner: { ...variants().beginner, text: words(90) } } }))).toEqual([]);
    expect(issuesOf(WorldSpec, withLevel(0, { explanation: { ...variants(), beginner: { ...variants().beginner, text: words(91) } } }))).toEqual([
      { code: "custom", path: "levels.0.explanation.beginner.text" },
    ]);
    expect(issuesOf(WorldSpec, withLevel(0, { explanation: { ...variants(), intermediate: { ...variants().intermediate, text: words(151) } } }))).toEqual([
      { code: "custom", path: "levels.0.explanation.intermediate.text" },
    ]);
  });
});

describe("[R03] WorldSpec: the level's other parts", () => {
  it("rejects a guide line without {to}, or with other braces", () => {
    const script = level("hook", 1, "hook").guide;
    expect(issuesOf(WorldSpec, withLevel(0, { guide: { ...script, raised: "You raised Follow." } }))).toEqual([{ code: "custom", path: "levels.0.guide.raised" }]);
    expect(issuesOf(WorldSpec, withLevel(0, { guide: { ...script, lowered: "You lowered {control}{to}." } }))).toEqual([{ code: "custom", path: "levels.0.guide.lowered" }]);
  });

  it("rejects readings that do not run from the highest threshold down", () => {
    const script = level("hook", 1, "hook").guide;
    const upward = [...script.readings].reverse();
    expect(issuesOf(WorldSpec, withLevel(0, { guide: { ...script, readings: upward } }))).toEqual([{ code: "custom", path: "levels.0.guide.readings" }]);
  });

  it("rejects an observable that is not a computed observation", () => {
    const watched = { ...level("hook", 1, "hook").observable, origin: "paper-derived" };
    expect(issuesOf(WorldSpec, withLevel(0, { observable: watched }))).toEqual([{ code: "invalid_value", path: "levels.0.observable.origin" }]);
  });

  it("rejects a slider step larger than the control's range", () => {
    expect(issuesOf(WorldSpec, withLevel(0, { slider: { step: 5, ends: ["Ignore", "Follow"] } }))).toEqual([{ code: "custom", path: "levels.0.slider.step" }]);
  });

  it("rejects guided exploration on another action or another observable", () => {
    const explore = exploration();
    expect(issuesOf(WorldSpec, withLevel(0, { guidedExploration: explore }))).toEqual([]);
    expect(issuesOf(WorldSpec, withLevel(0, { guidedExploration: { ...explore, interveneActionId: "other" } }))).toEqual([
      { code: "custom", path: "levels.0.guidedExploration.interveneActionId" },
    ]);
    expect(issuesOf(WorldSpec, withLevel(0, { guidedExploration: { ...explore, observeMetricId: "spacing" } }))).toEqual([
      { code: "custom", path: "levels.0.guidedExploration.observeMetricId" },
    ]);
  });

  it("allows a widget binding only sandboxed and labelled generated-inference", () => {
    const widget = { type: "widget", widgetId: "chart-1", sandboxed: true, origin: "generated-inference" };
    const spec = withLevel(1, { binding: widget });
    expect(issuesOf(WorldSpec, spec)).toEqual([]);
    expect(paths(withLevel(1, { binding: { ...widget, sandboxed: false } }))).toEqual(["levels.1.binding.sandboxed"]);
    expect(paths(withLevel(1, { binding: { ...widget, origin: "teaching-choice" } }))).toEqual(["levels.1.binding.origin"]);
  });
});

describe("[R03] WorldSpec: its lists agree with its levels", () => {
  it("lists exactly the primitives its levels bind, once each", () => {
    const spec = worldSpec();
    expect(issuesOf(WorldSpec, { ...spec, primitivesUsed: [{ id: "other.model", version: "1.0.0" }] })).toEqual([
      { code: "custom", path: "primitivesUsed" },
      { code: "custom", path: "primitivesUsed" },
    ]);
    expect(issuesOf(WorldSpec, { ...spec, primitivesUsed: [...spec.primitivesUsed, ...spec.primitivesUsed] })).toEqual([{ code: "custom", path: "primitivesUsed" }]);
  });

  it("versions every check suite", () => {
    const spec = worldSpec();
    expect(issuesOf(WorldSpec, { ...spec, checks: { suiteIds: ["schema", "bindings"], suiteVersions: { schema: "1" } } })).toEqual([{ code: "custom", path: "checks.suiteVersions" }]);
  });

  it("designs only levels it has", () => {
    const spec = worldSpec();
    spec.design.sections.push({ levelId: "elsewhere", chartType: "line", motion: "none" });
    expect(issuesOf(WorldSpec, spec)).toEqual([{ code: "custom", path: "design.sections.1.levelId" }]);
  });

  it("lets a causal claim depend only on earlier claims", () => {
    const spec = worldSpec();
    spec.digest.causalChain[0] = { ...spec.digest.causalChain[0]!, dependsOn: ["agree"] };
    expect(issuesOf(WorldSpec, spec)).toEqual([{ code: "custom", path: "digest.causalChain.0.dependsOn.0" }]);
  });
});

describe("[R03] WorldSpec: each counterfactual's measured difference and claim (ADR-0018)", () => {
  const forkWith = (patch: Record<string, unknown>) => ({ ...level("hook", 1, "hook").counterfactual, difference: { ...difference(), ...patch } });

  it("requires a measured difference on every counterfactual", () => {
    const { difference: _difference, ...bare } = level("hook", 1, "hook").counterfactual;
    expect(paths(withLevel(0, { counterfactual: bare }))).toEqual(["levels.0.counterfactual.difference"]);
  });

  it("keeps the level's time to 80 seconds, 20 s of watching at 4x", () => {
    expect(issuesOf(WorldSpec, withLevel(0, { counterfactual: forkWith({ seconds: 80, summary: { kind: "at", seconds: 80 } }) }))).toEqual([]);
    expect(paths(withLevel(0, { counterfactual: forkWith({ seconds: 81 }) }))).toEqual(["levels.0.counterfactual.difference.seconds"]);
  });

  it("keeps a summary's times inside the level's time", () => {
    expect(issuesOf(WorldSpec, withLevel(0, { counterfactual: forkWith({ summary: { kind: "at", seconds: 30 } }) }))).toEqual([
      { code: "custom", path: "levels.0.counterfactual.difference.summary.seconds" },
    ]);
    expect(issuesOf(WorldSpec, withLevel(0, { counterfactual: forkWith({ summary: { kind: "lowest", from: 20 } }) }))).toEqual([
      { code: "custom", path: "levels.0.counterfactual.difference.summary.from" },
    ]);
  });

  it("accepts each kind of summary, and rejects an unknown one", () => {
    for (const summary of [{ kind: "first-reach", threshold: 0.9 }, { kind: "lowest", from: 5 }, { kind: "total" }]) {
      expect(issuesOf(WorldSpec, withLevel(0, { counterfactual: forkWith({ summary }) })), JSON.stringify(summary)).toEqual([]);
    }
    expect(paths(withLevel(0, { counterfactual: forkWith({ summary: { kind: "average" } }) }))).toEqual(["levels.0.counterfactual.difference.summary.kind"]);
  });

  it("accepts a claim that holds sky by sky, with a margin and an optional ratio", () => {
    expect(issuesOf(WorldSpec, withLevel(0, { counterfactual: forkWith({ claim: { kind: "each", relation: "higher", by: 0, times: 3 } }) }))).toEqual([]);
    expect(paths(withLevel(0, { counterfactual: forkWith({ claim: { kind: "each", relation: "higher", by: -1 } }) }))).toEqual(["levels.0.counterfactual.difference.claim.by"]);
    expect(paths(withLevel(0, { counterfactual: forkWith({ claim: { kind: "each", relation: "sideways", by: 0 } }) }))).toEqual(["levels.0.counterfactual.difference.claim.relation"]);
  });

  it("allows a count claim only on a level that asks for a prediction first", () => {
    const count = { kind: "count", relation: "lower", by: 1, holds: 6 };
    expect(issuesOf(WorldSpec, withLevel(1, { counterfactual: forkWith({ claim: count }) }))).toEqual([{ code: "custom", path: "levels.1.counterfactual.difference.claim" }]);
    expect(issuesOf(WorldSpec, withLevel(1, { counterfactual: forkWith({ claim: count }), guidedExploration: exploration() }))).toEqual([]);
    expect(paths(withLevel(1, { counterfactual: forkWith({ claim: { ...count, holds: 21 } }), guidedExploration: exploration() }))).toEqual([
      "levels.1.counterfactual.difference.claim.holds",
    ]);
  });

  it("asks for two to four choices, none marked right, and anchors a paper-derived explanation", () => {
    expect(paths(withLevel(0, { guidedExploration: { ...exploration(), choices: ["Faster"] } }))).toEqual(["levels.0.guidedExploration.choices"]);
    expect(paths(withLevel(0, { guidedExploration: { ...exploration(), correct: 1 } }))).toEqual(["levels.0.guidedExploration"]);
    expect(paths(withLevel(0, { guidedExploration: { ...exploration(), explanation: { text: "Local only.", origin: "paper-derived", anchors: [] } } }))).toEqual([
      "levels.0.guidedExploration.explanation.anchors",
    ]);
  });
});
