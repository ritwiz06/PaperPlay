import { z } from "zod";
import { FamilyId } from "./families.ts";
import { Id } from "./ids.ts";
import { actionWith, ParameterName, PrimitiveRef } from "./primitive.ts";
import { Origin, SourceManifest } from "./provenance.ts";
import { TimeUnit } from "./time.ts";
import {
  AnchorRef,
  Binding,
  checkWorld,
  DifferenceClaim,
  Digest,
  Explanation,
  GuidedExploration,
  GuideScript,
  LevelKind,
  NEEDS_ANCHOR,
  Observable,
  paperDerivedHasAnchors,
  PendingSource,
  Placement,
  Slider,
  WorldSpecV2,
} from "./worldspec.ts";

// worldspec/3 (ADR-0027): a world for any primitive family. Beside version 2 it says how the
// paper was routed, names its scene kit by id, counts its time in its model's own unit, opens
// on its own seed, asks for a prediction before every What-if, and says what it cannot show.
// Version 2 is still read, and upgraded to this before anything is built from it.

type Path = (string | number)[];

/** How each world's series of the metric becomes one number, its times in the world's time unit. */
export const DifferenceSummaryV3 = z.discriminatedUnion("kind", [
  /** The value at that time. */
  z.strictObject({ kind: z.literal("at"), time: z.number().positive() }),
  /** The time until the value first reaches the threshold; never, within the level's time, counts as later than any time. */
  z.strictObject({ kind: z.literal("first-reach"), threshold: z.number() }),
  /** The lowest value from `from` to the level's time. */
  z.strictObject({ kind: z.literal("lowest"), from: z.number().nonnegative() }),
  /** The value summed over the level's time, times the timestep. */
  z.strictObject({ kind: z.literal("total") }),
]);
export type DifferenceSummaryV3 = z.infer<typeof DifferenceSummaryV3>;

/**
 * The level rule's bound on watching (ADR-0018): a level's time shows within this many seconds
 * of watching at the fastest speed, however its model counts time. The builder checks it.
 */
export const RULE_WATCH_SECONDS = 20;
export const RULE_FASTEST_SPEED = 4;

/** The one measured difference between the two worlds of a fork, its times in the world's time unit. */
export const MeasuredDifferenceV3 = z
  .strictObject({
    metricId: ParameterName,
    /** How the fork view names it: "Agreement after 20 seconds". */
    label: z.string().min(1),
    /** The summary's unit: the metric's, the time unit for first-reach, or the metric's times the time unit for a total. */
    unit: z.string().min(1),
    summary: DifferenceSummaryV3,
    /** The level's time: how long both worlds run, in the world's time unit. */
    time: z.number().positive(),
    claim: DifferenceClaim,
  })
  .refine((difference) => difference.summary.kind !== "at" || difference.summary.time <= difference.time, {
    error: "the summary's time lies within the level's time",
    path: ["summary", "time"],
  })
  .refine((difference) => difference.summary.kind !== "lowest" || difference.summary.from < difference.time, {
    error: "the summary starts within the level's time",
    path: ["summary", "from"],
  });
export type MeasuredDifferenceV3 = z.infer<typeof MeasuredDifferenceV3>;

/** The level's one "what if": parameter overrides on the same primitive, nothing else (ADR-0014). */
export const CounterfactualV3 = z
  .strictObject({
    prompt: z.string().min(1),
    altParams: z.record(ParameterName, z.number()).refine((params) => Object.keys(params).length > 0, { error: "a counterfactual overrides at least one parameter" }),
    expectedQualitativeEffect: z.string().min(1),
    origin: Origin,
    isSpeculative: z.boolean(),
    anchors: z.array(AnchorRef),
    difference: MeasuredDifferenceV3,
  })
  .refine(paperDerivedHasAnchors, NEEDS_ANCHOR);
export type CounterfactualV3 = z.infer<typeof CounterfactualV3>;

/**
 * Exactly one manipulable and exactly one counterfactual, each a single object, never a list,
 * and a prediction before the What-if, which version 3 requires of every level (ADR-0023).
 * Version 2's refinements, unchanged.
 */
export const LevelV3 = z
  .strictObject({
    id: Id,
    order: z.int().positive(),
    kind: LevelKind,
    title: z.string().min(1),
    /** One sentence: what to do here. */
    goal: z.string().min(1),
    /** Beyond the paper: nothing in a bonus level is labelled paper-derived (ADR-0014). */
    bonus: z.boolean(),
    binding: Binding,
    manipulable: actionWith(AnchorRef),
    slider: Slider,
    observable: Observable,
    counterfactual: CounterfactualV3,
    setup: z.array(Placement),
    explanation: Explanation,
    /** The passage the level comes from, as the journal's page shows it. */
    caption: z.strictObject({ text: z.string().min(1), origin: Origin, anchors: z.array(AnchorRef) }).refine(paperDerivedHasAnchors, NEEDS_ANCHOR),
    guide: GuideScript,
    guidedExploration: GuidedExploration,
    /** Citations offered as further reading, a teaching choice, quoting nothing. */
    furtherReading: z.array(z.string().min(1)).max(3),
    /** One line: what you now know going into the next level. */
    carryForward: z.string().min(1),
  })
  .refine((level) => level.guidedExploration.interveneActionId === level.manipulable.actionId, {
    error: "exploration must intervene on the level's manipulable",
    path: ["guidedExploration", "interveneActionId"],
  })
  .refine((level) => level.guidedExploration.observeMetricId === level.observable.metricId, {
    error: "exploration must observe the level's observable",
    path: ["guidedExploration", "observeMetricId"],
  })
  .refine((level) => new Set(level.setup.map((placement) => placement.entityId)).size === level.setup.length, {
    error: "setup entity ids must be unique",
    path: ["setup"],
  })
  .refine((level) => level.slider.step <= level.manipulable.range[1] - level.manipulable.range[0], {
    error: "the slider's step must fit inside the control's range",
    path: ["slider", "step"],
  })
  .refine(
    (level) =>
      !level.bonus ||
      ![level.manipulable, level.counterfactual, level.caption, ...Object.values(level.explanation), ...level.setup, level.guidedExploration.explanation].some(
        (item) => item.origin === "paper-derived",
      ),
    { error: "a bonus level labels nothing paper-derived", path: ["bonus"] },
  );
export type LevelV3 = z.infer<typeof LevelV3>;

/**
 * How the paper was routed (docs/design/every-paper.md §3.2): tier A when a released family
 * primitive covers its mechanism, tier B when a new primitive, not yet merged, was drafted for it.
 * Tier C is an interactive explainer, which is not a WorldSpec.
 */
export const Routing = z.strictObject({
  tier: z.enum(["A", "B"]),
  family: FamilyId,
  /** Why the family covers the paper's mechanism, in a sentence. */
  reason: z.string().min(1),
  primitive: z.discriminatedUnion("status", [
    z.strictObject({ status: z.literal("released") }),
    z.strictObject({ status: z.literal("unmerged"), pullRequest: z.url() }),
  ]),
});
export type Routing = z.infer<typeof Routing>;

/** Enum-only design choices, with the world drawn by a scene kit named by its id (SCENE_KITS). */
export const DesignSpecV3 = z.strictObject({
  /** The scene kit, by id. The builder checks the shell has it, and that it draws the bound primitive's family and space. */
  world: Id,
  palette: z.enum(["cream-teal", "dusk", "chalk", "moss", "tide", "ember", "slate", "paper"]),
  density: z.enum(["compact", "comfortable", "spacious"]),
  sections: z.array(
    z.strictObject({
      levelId: Id,
      chartType: z.enum(["line", "bar", "scatter", "heatmap", "none"]),
      motion: z.enum(["none", "reveal-once"]),
    }),
  ),
});
export type DesignSpecV3 = z.infer<typeof DesignSpecV3>;

/** Something the world cannot show, with where the statement comes from: its journal page says each one. */
export const Limit = z.strictObject({ text: z.string().min(1), origin: Origin, anchors: z.array(AnchorRef) }).refine(paperDerivedHasAnchors, NEEDS_ANCHOR);
export type Limit = z.infer<typeof Limit>;

export const WorldSpecV3 = z
  .strictObject({
    schemaVersion: z.literal("worldspec/3"),
    /** A draft may hold placeholder anchors and a pending source; a reviewed spec may not (ADR-0016). */
    status: z.enum(["draft", "reviewed"]),
    /** The world's name, as its card shows it. */
    title: z.string().min(1),
    source: z.union([SourceManifest, PendingSource]),
    digest: Digest,
    routing: Routing,
    design: DesignSpecV3,
    /** The unit every level's time and summary is counted in: the bound primitive's own. */
    timeUnit: TimeUnit,
    /** The seed every level opens on, a teaching choice (ADR-0003). */
    openingSeed: z.int().min(0).max(0xffff_ffff),
    levels: z.array(LevelV3).min(3).max(9),
    primitivesUsed: z.array(PrimitiveRef).min(1),
    checks: z.strictObject({ suiteIds: z.array(Id).min(1), suiteVersions: z.record(Id, z.string().min(1)) }),
    /** What this world cannot show: at least one statement, each with its origin, for the journal's page. */
    limits: z.array(Limit).min(1),
  })
  .check((ctx) => {
    const spec = ctx.value;
    const issue = (message: string, input: unknown, path: Path): void => void ctx.issues.push({ code: "custom", message, input, path });
    checkWorld(spec, issue);
    const { tier, primitive } = spec.routing;
    if (tier === "A" && primitive.status !== "released") issue("a tier A world runs on a released primitive", primitive, ["routing", "primitive", "status"]);
    if (tier === "B" && primitive.status !== "unmerged") issue("a tier B world runs on a new primitive, not yet merged", primitive, ["routing", "primitive", "status"]);
    // A world on a primitive no one has merged is never shown as verified (every-paper.md §2.5).
    if (primitive.status === "unmerged" && spec.status === "reviewed") issue("a world on an unmerged primitive stays a draft", spec.status, ["status"]);
  });
export type WorldSpecV3 = z.infer<typeof WorldSpecV3>;

/** A WorldSpec of any version still read, worldspec/2 or worldspec/3. Build from it through `upgradeWorldSpec`. */
export const WorldSpec = z.discriminatedUnion("schemaVersion", [WorldSpecV2, WorldSpecV3]);
export type WorldSpec = z.infer<typeof WorldSpec>;

export interface UpgradeProblem {
  /** Dotted path into the spec as given. */
  readonly path: string;
  readonly message: string;
}

export type UpgradeResult = { readonly ok: true; readonly spec: WorldSpecV3 } | { readonly ok: false; readonly problems: readonly UpgradeProblem[] };

/**
 * A spec as worldspec/3. A version 2 spec, whose worlds were all built on the agents family's
 * flock in seconds, becomes version 3 with everything it said kept:
 * - routed to tier A and the agents family, on a released primitive;
 * - its time in seconds, so each `seconds` becomes `time`;
 * - its limitations, as what it cannot show, each a teaching choice;
 * - opening on seed 0, since version 2 named no seed.
 * A level with no prediction cannot become version 3, which asks every level for one.
 */
export function upgradeWorldSpec(spec: WorldSpec): UpgradeResult {
  if (spec.schemaVersion === "worldspec/3") return { ok: true, spec };
  const problems: UpgradeProblem[] = [];
  const levels = spec.levels.map((level, index) => {
    if (!level.guidedExploration) {
      problems.push({ path: `levels.${index}.guidedExploration`, message: "worldspec/3 asks every level for a prediction before its What-if, and this one has none" });
    }
    const { difference } = level.counterfactual;
    const { seconds, summary, ...rest } = difference;
    return {
      ...level,
      counterfactual: { ...level.counterfactual, difference: { ...rest, time: seconds, summary: summary.kind === "at" ? { kind: "at" as const, time: summary.seconds } : summary } },
    };
  });
  if (problems.length > 0) return { ok: false, problems };
  const { limitations, schemaVersion: _version, ...kept } = spec;
  const candidate = {
    ...kept,
    schemaVersion: "worldspec/3",
    routing: { tier: "A", family: "agents", reason: "Upgraded from worldspec/2, whose worlds were all built on the agents family's flock.", primitive: { status: "released" } },
    timeUnit: "second",
    openingSeed: 0,
    levels,
    limits: limitations.map((text) => ({ text, origin: "teaching-choice", anchors: [] })),
  };
  const parsed = WorldSpecV3.safeParse(candidate);
  if (parsed.success) return { ok: true, spec: parsed.data };
  return { ok: false, problems: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) };
}
