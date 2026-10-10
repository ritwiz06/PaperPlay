import { z } from "zod";
import { Id } from "./ids.ts";
import { actionWith, ParameterName, PrimitiveRef } from "./primitive.ts";
import { Anchor, Origin, SourceManifest } from "./provenance.ts";
import { EntityKind } from "./run.ts";

// worldspec/2: what an authored or generated world is, as data (brief §3, ADR-0014, ADR-0016,
// ADR-0018). Version 2 adds each counterfactual's measured difference and its claim, and the
// guided exploration's choices and explanation. Frozen since worldspec/3 (worldspec-v3.ts,
// ADR-0027): still read, and upgraded to v3 before anything is built from it.
// A deterministic builder interprets it against the primitive registry; checks that need the
// registry (a variable exists, a value is in range, a placement is inside the world) live in
// the builder, and everything a spec can be wrong about on its own is refined here.

/**
 * Stands in for an anchor until the source map exists: what passage will stand here, quoting
 * nothing. Allowed only in a draft spec, and shown as a placeholder wherever it is displayed.
 */
export const PlaceholderAnchor = z.strictObject({
  placeholder: z.literal(true),
  sourceId: Id,
  need: z.string().min(1).max(300),
});
export type PlaceholderAnchor = z.infer<typeof PlaceholderAnchor>;

/** A real anchor, or, in a draft spec only, a placeholder for one. */
export const AnchorRef = z.union([Anchor, PlaceholderAnchor]);
export type AnchorRef = z.infer<typeof AnchorRef>;

export const isPlaceholder = (anchor: AnchorRef): anchor is PlaceholderAnchor => "placeholder" in anchor;

/** A source identified but not yet in hand: no digest, no sections. Allowed only in a draft spec. */
export const PendingSource = z.strictObject({
  pending: z.literal(true),
  sourceId: Id,
  title: z.string().min(1),
  authors: z.array(z.string().min(1)).min(1),
  year: z.int().min(1000).max(9999),
  venue: z.string().min(1).optional(),
  /** What is still missing, in words. */
  need: z.string().min(1).max(300),
});
export type PendingSource = z.infer<typeof PendingSource>;

export const paperDerivedHasAnchors = (item: { readonly origin: Origin; readonly anchors: readonly unknown[] }): boolean =>
  item.origin !== "paper-derived" || item.anchors.length > 0;
export const NEEDS_ANCHOR = { error: "a paper-derived statement needs at least one anchor", path: ["anchors"] };

/** The shell's elements a depth variant shows or hides, by id. */
export const DepthElement = z.enum(["control-value", "range-numbers", "range-words", "readout-number", "equation", "analogy"]);
export type DepthElement = z.infer<typeof DepthElement>;

export const wordCount = (text: string): number => text.split(/\s+/).filter((word) => word.length > 0).length;

/** One depth's explanation, and which of the shell's elements it shows and hides. */
export const DepthVariant = z
  .strictObject({
    text: z.string().min(1),
    show: z.array(DepthElement),
    hide: z.array(DepthElement),
    analogy: z.string().min(1).optional(),
    /** Plain text with Unicode mathematics, such as "Aᵢ = w_a (ūᵢ − vᵢ)". */
    equation: z.string().min(1).optional(),
    origin: Origin,
    anchors: z.array(AnchorRef),
  })
  .refine((variant) => DepthElement.options.every((element) => [...variant.show, ...variant.hide].filter((listed) => listed === element).length === 1), {
    error: "every element is shown or hidden, exactly once",
    path: ["show"],
  })
  .refine((variant) => (variant.analogy !== undefined) === variant.show.includes("analogy"), {
    error: "an analogy is given exactly when the variant shows it",
    path: ["analogy"],
  })
  .refine((variant) => (variant.equation !== undefined) === variant.show.includes("equation"), {
    error: "an equation is given exactly when the variant shows it",
    path: ["equation"],
  })
  .refine(paperDerivedHasAnchors, NEEDS_ANCHOR);
export type DepthVariant = z.infer<typeof DepthVariant>;

export const Explanation = z
  .strictObject({ beginner: DepthVariant, intermediate: DepthVariant, advanced: DepthVariant })
  .refine((explanation) => wordCount(explanation.beginner.text) <= 90, { error: "Beginner text runs to 90 words at most", path: ["beginner", "text"] })
  .refine((explanation) => wordCount(explanation.intermediate.text) <= 150, {
    error: "Intermediate text runs to 150 words at most",
    path: ["intermediate", "text"],
  })
  .refine((explanation) => explanation.intermediate.analogy === undefined && explanation.advanced.analogy === undefined, {
    error: "only Beginner gives an analogy",
    path: ["intermediate", "analogy"],
  })
  .refine((explanation) => explanation.beginner.equation === undefined && explanation.intermediate.equation === undefined, {
    error: "only Advanced gives the equation",
    path: ["beginner", "equation"],
  });
export type Explanation = z.infer<typeof Explanation>;

/** What the learner watches change: one of the bound primitive's observables, as the readout shows it. */
export const Observable = z.strictObject({
  metricId: ParameterName,
  /** Named in full, as at Advanced. */
  label: z.string().min(1),
  /** Named briefly, as at Intermediate. */
  shortLabel: z.string().min(1),
  unit: z.string().min(1),
  /** Decimals at Advanced; Intermediate shows one fewer. */
  decimals: z.int().min(0).max(4),
  origin: z.literal("computed-observation"),
});
export type Observable = z.infer<typeof Observable>;

/** The level rule (ADR-0018): a stated effect is checked on this many skies (seeds 1 to 20)... */
export const RULE_SEEDS = 20;
/** ...must hold on at least this many of them... */
export const RULE_HOLDS = 16;
/** ...and show within this many simulated seconds: 20 s of watching at 4x. */
export const RULE_MAX_SECONDS = 80;

/** How each world's series of the metric becomes one number. */
export const DifferenceSummary = z.discriminatedUnion("kind", [
  /** The value at that time. */
  z.strictObject({ kind: z.literal("at"), seconds: z.number().positive() }),
  /** Seconds until the value first reaches the threshold; never, within the level's time, counts as later than any time. */
  z.strictObject({ kind: z.literal("first-reach"), threshold: z.number() }),
  /** The lowest value from `from` seconds to the level's time. */
  z.strictObject({ kind: z.literal("lowest"), from: z.number().nonnegative() }),
  /** The value summed over the level's time, times the timestep: birds at rocks become bird-seconds. */
  z.strictObject({ kind: z.literal("total") }),
]);
export type DifferenceSummary = z.infer<typeof DifferenceSummary>;

export const Relation = z.enum(["higher", "lower"]);

/**
 * The effect a level states, as a check on each sky: the other world's summary is higher or
 * lower than this world's by more than `by` (and, with `times`, more than `times` as much).
 */
export const DifferenceClaim = z.discriminatedUnion("kind", [
  /** Holds sky by sky: it must hold on at least RULE_HOLDS of RULE_SEEDS. */
  z.strictObject({ kind: z.literal("each"), relation: Relation, by: z.number().nonnegative(), times: z.number().min(1).optional() }),
  /**
   * A count stated exactly, for a result that is the surprise itself: the relation holds on
   * exactly `holds` of RULE_SEEDS skies. Allowed only on a level that asks for a prediction.
   */
  z.strictObject({ kind: z.literal("count"), relation: Relation, by: z.number().nonnegative(), holds: z.int().min(0).max(RULE_SEEDS) }),
]);
export type DifferenceClaim = z.infer<typeof DifferenceClaim>;

/** The one measured difference between the two worlds of a fork, and the claim the level makes about it (ADR-0018). */
export const MeasuredDifference = z
  .strictObject({
    metricId: ParameterName,
    /** How the fork view names it: "Agreement after 20 seconds". */
    label: z.string().min(1),
    /** The summary's unit: the metric's, seconds for first-reach, or the metric's times seconds for a total. */
    unit: z.string().min(1),
    summary: DifferenceSummary,
    /** The level's time: how long both worlds run, in simulated seconds. */
    seconds: z.number().positive().max(RULE_MAX_SECONDS),
    claim: DifferenceClaim,
  })
  .refine((difference) => difference.summary.kind !== "at" || difference.summary.seconds <= difference.seconds, {
    error: "the summary's time lies within the level's time",
    path: ["summary", "seconds"],
  })
  .refine((difference) => difference.summary.kind !== "lowest" || difference.summary.from < difference.seconds, {
    error: "the summary starts within the level's time",
    path: ["summary", "from"],
  });
export type MeasuredDifference = z.infer<typeof MeasuredDifference>;

/** The level's one "what if": parameter overrides on the same primitive, nothing else (ADR-0014). */
export const Counterfactual = z
  .strictObject({
    prompt: z.string().min(1),
    altParams: z.record(ParameterName, z.number()).refine((params) => Object.keys(params).length > 0, { error: "a counterfactual overrides at least one parameter" }),
    expectedQualitativeEffect: z.string().min(1),
    origin: Origin,
    isSpeculative: z.boolean(),
    anchors: z.array(AnchorRef),
    difference: MeasuredDifference,
  })
  .refine(paperDerivedHasAnchors, NEEDS_ANCHOR);
export type Counterfactual = z.infer<typeof Counterfactual>;

export const Binding = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("primitive"), primitive: PrimitiveRef, params: z.record(ParameterName, z.number()) }),
  z.strictObject({ type: z.literal("widget"), widgetId: Id, sandboxed: z.literal(true), origin: z.literal("generated-inference") }),
]);
export type Binding = z.infer<typeof Binding>;

/** Something placed at step 0 as an ordinary place event, such as a rock in the flock's path (ADR-0014). */
export const Placement = z
  .strictObject({
    entityId: Id,
    entity: EntityKind,
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    origin: Origin,
    anchors: z.array(AnchorRef),
  })
  .refine(paperDerivedHasAnchors, NEEDS_ANCHOR);
export type Placement = z.infer<typeof Placement>;

/** How the level's slider moves, and what its two ends are called at Beginner. */
export const Slider = z.strictObject({
  step: z.number().positive(),
  ends: z.tuple([z.string().min(1), z.string().min(1)]),
});
export type Slider = z.infer<typeof Slider>;

/** "You raised X{to}, so …": `{to}` becomes " to 3.50" from Intermediate, and nothing at Beginner. */
const DidTemplate = z
  .string()
  .min(1)
  .refine((text) => text.split("{to}").length === 2 && text.replaceAll("{to}", "").search(/[{}]/) === -1, {
    error: "must hold {to} exactly once, and no other braces",
  });

const TrendWords = z.strictObject({
  /** A clause after a comma at Beginner: "and more are joining in". */
  beginner: z.string().min(1),
  /** One word after "and" from Intermediate: "rising". */
  measured: z.string().min(1),
});

/**
 * The guide's script for a level (ADR-0008). Its first line, "you did X, so Y", is a teaching
 * choice; its second describes the observable as measured, a computed observation, in the
 * words of the first reading whose `atLeast` the value reaches (the last if none).
 */
export const GuideScript = z.strictObject({
  idle: z.string().min(1),
  raised: DidTemplate,
  lowered: DidTemplate,
  /** Said instead when the control is at the bottom of its range. */
  atMinimum: z.string().min(1).optional(),
  readings: z
    .array(z.strictObject({ atLeast: z.number(), words: z.string().min(1) }))
    .min(1)
    .refine((readings) => readings.every((reading, index) => index === 0 || reading.atLeast < (readings[index - 1]?.atLeast ?? Infinity)), {
      error: "readings run from the highest threshold down",
    }),
  trend: z.strictObject({
    rising: TrendWords,
    falling: TrendWords,
    steady: z.string().min(1),
    /** Changes smaller than this over the guide's window read as steady. */
    within: z.number().positive(),
  }),
});
export type GuideScript = z.infer<typeof GuideScript>;

/**
 * Predict, intervene, observe, explain: framing, never scoring. Nothing marks a choice right;
 * the guide reports what was measured. With a count claim, the first choice names the outcome
 * the count counts.
 */
export const GuidedExploration = z.strictObject({
  predictPrompt: z.string().min(1),
  choices: z.array(z.string().min(1)).min(2).max(4),
  interveneActionId: Id,
  observeMetricId: ParameterName,
  explainPrompt: z.string().min(1),
  /** What the guide says once the result is in, connecting it to the paper. */
  explanation: z.strictObject({ text: z.string().min(1), origin: Origin, anchors: z.array(AnchorRef) }).refine(paperDerivedHasAnchors, NEEDS_ANCHOR),
});
export type GuidedExploration = z.infer<typeof GuidedExploration>;

export const LevelKind = z.enum(["hook", "background", "idea", "method", "evaluation", "result"]);
export type LevelKind = z.infer<typeof LevelKind>;

/** Exactly one manipulable and exactly one counterfactual, each a single object, never a list. */
export const Level = z
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
    counterfactual: Counterfactual,
    setup: z.array(Placement),
    explanation: Explanation,
    /** The passage the level comes from, as the journal's page shows it. */
    caption: z.strictObject({ text: z.string().min(1), origin: Origin, anchors: z.array(AnchorRef) }).refine(paperDerivedHasAnchors, NEEDS_ANCHOR),
    guide: GuideScript,
    guidedExploration: GuidedExploration.optional(),
    /** Citations offered as further reading, a teaching choice, quoting nothing. */
    furtherReading: z.array(z.string().min(1)).max(3),
    /** One line: what you now know going into the next level. */
    carryForward: z.string().min(1),
  })
  .refine((level) => !level.guidedExploration || level.guidedExploration.interveneActionId === level.manipulable.actionId, {
    error: "exploration must intervene on the level's manipulable",
    path: ["guidedExploration", "interveneActionId"],
  })
  .refine((level) => !level.guidedExploration || level.guidedExploration.observeMetricId === level.observable.metricId, {
    error: "exploration must observe the level's observable",
    path: ["guidedExploration", "observeMetricId"],
  })
  .refine((level) => level.counterfactual.difference.claim.kind !== "count" || level.guidedExploration !== undefined, {
    error: "a count claim states a surprise, so its level must ask for a prediction first",
    path: ["counterfactual", "difference", "claim"],
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
      ![level.manipulable, level.counterfactual, level.caption, ...Object.values(level.explanation), ...level.setup, ...(level.guidedExploration ? [level.guidedExploration.explanation] : [])].some(
        (item) => item.origin === "paper-derived",
      ),
    { error: "a bonus level labels nothing paper-derived", path: ["bonus"] },
  );
export type Level = z.infer<typeof Level>;

export const CausalClaim = z
  .strictObject({ id: Id, claim: z.string().min(1), dependsOn: z.array(Id), anchors: z.array(AnchorRef), origin: Origin })
  .refine(paperDerivedHasAnchors, NEEDS_ANCHOR);

export const Digest = z
  .strictObject({
    question: z.string().min(1),
    /** The paper's result the hook shows: a paper claim, so it is anchored. */
    hookResult: z.strictObject({ text: z.string().min(1), anchors: z.array(AnchorRef).min(1) }),
    causalChain: z.array(CausalClaim),
  })
  .check((ctx) => {
    const seen = new Set<string>();
    ctx.value.causalChain.forEach((claim, index) => {
      if (seen.has(claim.id)) ctx.issues.push({ code: "custom", message: `claim id ${claim.id} is used twice`, input: claim.id, path: ["causalChain", index, "id"] });
      claim.dependsOn.forEach((id, at) => {
        if (!seen.has(id)) {
          ctx.issues.push({ code: "custom", message: `${claim.id} may depend only on earlier claims, not ${id}`, input: id, path: ["causalChain", index, "dependsOn", at] });
        }
      });
      seen.add(claim.id);
    });
  });
export type Digest = z.infer<typeof Digest>;

/**
 * Enum-only design choices. The brief's per-section `layout` and its `typographyPairing` are
 * left out: the game-first shell has one layout (ADR-0008) and one pairing (ADR-0002) (ADR-0016).
 */
export const DesignSpec = z.strictObject({
  world: z.enum(["valley", "city", "reef", "custom"]),
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
export type DesignSpec = z.infer<typeof DesignSpec>;

type Path = (string | number)[];

/** Every anchor list in a value, wherever it sits, with its path. */
export function anchorLists(value: unknown, path: Path, found: { anchors: unknown[]; path: Path }[] = []): { anchors: unknown[]; path: Path }[] {
  if (Array.isArray(value)) value.forEach((item, index) => anchorLists(item, [...path, index], found));
  else if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      if (key === "anchors" && Array.isArray(child)) found.push({ anchors: child, path: [...path, key] });
      else anchorLists(child, [...path, key], found);
    }
  }
  return found;
}

/** What every version of a WorldSpec holds, which `checkWorld` reads. */
export interface WorldShape {
  readonly status: "draft" | "reviewed";
  readonly source: SourceManifest | PendingSource;
  readonly levels: readonly {
    readonly id: string;
    readonly order: number;
    readonly kind: LevelKind;
    readonly bonus: boolean;
    readonly binding: { readonly type: string; readonly primitive?: PrimitiveRef };
    readonly manipulable: { readonly actionId: string; readonly targetVariable: string };
  }[];
  readonly primitivesUsed: readonly PrimitiveRef[];
  readonly checks: { readonly suiteIds: readonly string[]; readonly suiteVersions: Readonly<Record<string, string>> };
  readonly design: { readonly sections: readonly { readonly levelId: string }[] };
}

/**
 * The checks a whole spec must pass, in every version: the hook first, levels in order, one
 * action one variable, the primitives it lists, its check suites, its design's sections, and
 * anchors into its own source, placeholders only in a draft.
 */
export function checkWorld(spec: WorldShape, issue: (message: string, input: unknown, path: Path) => void): void {
  const { levels } = spec;

  if (levels[0]?.kind !== "hook") issue("the first level must be the hook", levels[0]?.kind, ["levels", 0, "kind"]);
  levels.forEach((level, index) => {
    if (index > 0 && level.kind === "hook") issue("there is only one hook, and it comes first", level.kind, ["levels", index, "kind"]);
    if (level.order !== index + 1) issue(`level ${level.id} must have order ${index + 1}, its place in the list`, level.order, ["levels", index, "order"]);
    if (levels.findIndex((other) => other.id === level.id) !== index) issue(`level id ${level.id} is used twice`, level.id, ["levels", index, "id"]);
    if (level.bonus && level.kind === "hook") issue("the hook is never a bonus level", level.bonus, ["levels", index, "bonus"]);
    if (!level.bonus && levels.slice(0, index).some((earlier) => earlier.bonus)) {
      issue("bonus levels come after every other level", level.bonus, ["levels", index, "bonus"]);
    }
  });

  // One action id, one variable: a run's events must mean the same thing in every level.
  const variableOf = new Map<string, string>();
  levels.forEach((level, index) => {
    const { actionId, targetVariable } = level.manipulable;
    const known = variableOf.get(actionId);
    if (known !== undefined && known !== targetVariable) {
      issue(`action ${actionId} moves ${known} in an earlier level, so it cannot move ${targetVariable} here`, targetVariable, [
        "levels",
        index,
        "manipulable",
        "targetVariable",
      ]);
    }
    variableOf.set(actionId, targetVariable);
  });

  const key = (ref: PrimitiveRef): string => `${ref.id}@${ref.version}`;
  const used = spec.primitivesUsed.map(key);
  if (new Set(used).size !== used.length) issue("primitivesUsed lists a primitive twice", spec.primitivesUsed, ["primitivesUsed"]);
  const bound = new Set(levels.flatMap((level) => (level.binding.primitive ? [key(level.binding.primitive)] : [])));
  for (const ref of bound) if (!used.includes(ref)) issue(`a level binds ${ref}, which primitivesUsed does not list`, ref, ["primitivesUsed"]);
  for (const ref of used) if (!bound.has(ref)) issue(`primitivesUsed lists ${ref}, which no level binds`, ref, ["primitivesUsed"]);

  const { suiteIds, suiteVersions } = spec.checks;
  if (new Set(suiteIds).size !== suiteIds.length) issue("a check suite is listed twice", suiteIds, ["checks", "suiteIds"]);
  const versioned = Object.keys(suiteVersions);
  if (versioned.length !== suiteIds.length || !suiteIds.every((id) => versioned.includes(id))) {
    issue("every check suite has exactly one version", suiteVersions, ["checks", "suiteVersions"]);
  }

  const levelIds = new Set(levels.map((level) => level.id));
  spec.design.sections.forEach((section, index) => {
    if (!levelIds.has(section.levelId)) issue(`the design names no level ${section.levelId}`, section.levelId, ["design", "sections", index, "levelId"]);
    if (spec.design.sections.findIndex((other) => other.levelId === section.levelId) !== index) {
      issue(`the design gives level ${section.levelId} two sections`, section.levelId, ["design", "sections", index, "levelId"]);
    }
  });

  // Anchors point into this spec's own source; placeholders and a pending source only in a draft.
  const pending = "pending" in spec.source;
  const sections = "sections" in spec.source ? new Set(spec.source.sections.map((section) => section.id)) : new Set<string>();
  if (spec.status === "reviewed" && pending) issue("a reviewed spec needs the source's manifest, not a pending source", spec.source, ["source"]);
  for (const list of anchorLists(spec, [])) {
    list.anchors.forEach((raw, index) => {
      const anchor = raw as AnchorRef;
      const path = [...list.path, index];
      if (anchor.sourceId !== spec.source.sourceId) issue(`anchor points at ${anchor.sourceId}, not this spec's source ${spec.source.sourceId}`, anchor.sourceId, [...path, "sourceId"]);
      if (isPlaceholder(anchor)) {
        if (spec.status === "reviewed") issue("a reviewed spec holds no placeholder anchors", anchor, path);
      } else if (pending) {
        issue("a real anchor needs the source's manifest to check its section", anchor, path);
      } else if (!sections.has(anchor.sectionId)) {
        issue(`the source has no section ${anchor.sectionId}`, anchor.sectionId, [...path, "sectionId"]);
      }
    });
  }
}

export const WorldSpecV2 = z
  .strictObject({
    schemaVersion: z.literal("worldspec/2"),
    /** A draft may hold placeholder anchors and a pending source; a reviewed spec may not (ADR-0016). */
    status: z.enum(["draft", "reviewed"]),
    /** The world's name, as its card shows it. */
    title: z.string().min(1),
    source: z.union([SourceManifest, PendingSource]),
    digest: Digest,
    design: DesignSpec,
    levels: z.array(Level).min(3).max(9),
    primitivesUsed: z.array(PrimitiveRef).min(1),
    checks: z.strictObject({ suiteIds: z.array(Id).min(1), suiteVersions: z.record(Id, z.string().min(1)) }),
    limitations: z.array(z.string().min(1)).min(1),
  })
  .check((ctx) => checkWorld(ctx.value, (message, input, path) => void ctx.issues.push({ code: "custom", message, input, path })));
export type WorldSpecV2 = z.infer<typeof WorldSpecV2>;
