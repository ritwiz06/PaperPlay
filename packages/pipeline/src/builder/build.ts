/**
 * The deterministic builder (brief §5, R08): a WorldSpec in, a playable composition out, with
 * no model call. It validates the spec, upgrades a worldspec/2 to worldspec/3, then checks it
 * against the primitive registry and the scene kits, which the schema alone cannot see: every
 * variable exists, every value is in range, units agree, the kit draws the primitive's family,
 * the time is the primitive's, placements lie inside its space. It decides nothing a spec
 * states, and derives what no spec should state, such as whether a fork restarts both worlds
 * (ADR-0014).
 */
import {
  FAMILIES,
  RULE_FASTEST_SPEED,
  RULE_WATCH_SECONDS,
  sceneKit,
  SCENE_KITS,
  TIME_WORDS,
  upgradeWorldSpec,
  WorldSpec,
  type AnchorRef,
  type DepthElement,
  type Digest,
  type DesignSpecV3,
  type Explanation,
  type Family,
  type Variation,
  type GuideScript,
  type GuidedExploration,
  type LevelKind,
  type LevelV3,
  type Limit,
  type OwnNumbers,
  type MeasuredDifferenceV3,
  type Observable,
  type Origin,
  type PendingSource,
  type PlaceEvent,
  type PrimitiveRef,
  type Routing,
  type SceneKitManifest,
  type SourceManifest,
  type TimeUnit,
  type WorldSpecV3,
} from "@paperplay/contracts";
import type { Primitive, PrimitiveRegistry, VariableDescription } from "@paperplay/primitives";
import { familyProblems } from "./families.ts";

export type Depth = keyof Explanation;
export const BUILD_DEPTHS: readonly Depth[] = ["beginner", "intermediate", "advanced"];

/**
 * What the game-first shell can draw today, beside its scene kits (SCENE_KITS). A spec asking
 * for more is refused, never quietly drawn otherwise.
 */
export const SHELL = {
  palette: ["cream-teal"],
  density: ["comfortable"],
  chartType: ["none", "line"],
  motion: ["none"],
} as const satisfies { readonly [K in "palette" | "density"]: readonly DesignSpecV3[K][] } & {
  readonly chartType: readonly DesignSpecV3["sections"][number]["chartType"][];
  readonly motion: readonly DesignSpecV3["sections"][number]["motion"][];
};

export interface BuildProblem {
  /** Dotted path into the spec, as a schema issue gives it. */
  readonly path: string;
  readonly message: string;
}

export interface BuiltAction {
  readonly actionId: string;
  readonly label: string;
  /** The primitive variable the control moves. */
  readonly variable: string;
  readonly range: readonly [number, number];
  readonly defaultValue: number;
  readonly unit: string;
  readonly step: number;
  readonly ends: readonly [string, string];
  readonly origin: Origin;
  readonly anchors: readonly AnchorRef[];
}

export interface BuiltOverride {
  readonly variable: string;
  readonly from: number;
  readonly to: number;
  readonly phase: VariableDescription["phase"];
}

export interface BuiltFork {
  readonly prompt: string;
  readonly effect: string;
  readonly origin: Origin;
  readonly isSpeculative: boolean;
  readonly anchors: readonly AnchorRef[];
  /** The right-hand world's parameters: the level's, with the overrides applied. */
  readonly params: Readonly<Record<string, number>>;
  readonly overrides: readonly BuiltOverride[];
  /**
   * Derived: both worlds restart from the same seed when an override changes a start-up
   * (init-phase) variable, or when the primitive's family tells every run from its start.
   */
  readonly restarts: boolean;
  /** The one measured difference between the worlds, and the claim the level makes about it (ADR-0018), in the world's time unit. */
  readonly difference: MeasuredDifferenceV3;
}

export interface BuiltPlacement {
  readonly event: PlaceEvent;
  readonly origin: Origin;
  readonly anchors: readonly AnchorRef[];
}

export interface BuiltLevel {
  readonly id: string;
  readonly order: number;
  readonly kind: LevelKind;
  readonly title: string;
  readonly goal: string;
  readonly bonus: boolean;
  readonly primitive: Primitive<unknown, unknown>;
  readonly primitiveRef: PrimitiveRef;
  /** Every parameter at step 0, validated by the primitive's own schema. */
  readonly params: Readonly<Record<string, number>>;
  readonly action: BuiltAction;
  /** Each action id and the variable it moves, as `runEvents` takes them. */
  readonly actions: Readonly<Record<string, string>>;
  /** Placements applied at step 0, as ordinary place events. */
  readonly setup: readonly BuiltPlacement[];
  readonly observable: Observable;
  readonly fork: BuiltFork;
  /** The shell's elements shown at each depth, by id. */
  readonly visible: Readonly<Record<Depth, ReadonlySet<DepthElement>>>;
  readonly explanation: Explanation;
  readonly caption: LevelV3["caption"];
  readonly guide: GuideScript;
  /** Predict, intervene, observe, explain: every level asks for a prediction before its What-if (ADR-0023). */
  readonly exploration: GuidedExploration;
  readonly furtherReading: readonly string[];
  readonly carryForward: string;
  /** What the level card states beside the goal, when the level cannot test the paper's words as written (ADR-0040). */
  readonly observation?: Limit;
}

export interface BuiltWorld {
  readonly title: string;
  readonly status: WorldSpecV3["status"];
  readonly source: SourceManifest | PendingSource;
  readonly digest: Digest;
  readonly routing: Routing;
  /** The family the world's primitive belongs to, with its label when it has one. */
  readonly family: Family;
  /**
   * How the level rule varies the world: the family's own, or, for a world whose primitive never
   * draws on chance, the family's variation without chance when it has one (ADR-0046).
   */
  readonly variation: Variation;
  readonly design: DesignSpecV3;
  /** The scene kit that draws it. */
  readonly kit: SceneKitManifest;
  readonly timeUnit: TimeUnit;
  /** How much model time a second of watching shows at 1x: the primitive's own. */
  readonly perWatchSecond: number;
  readonly openingSeed: number;
  readonly levels: readonly BuiltLevel[];
  /** What the world cannot show, for its journal page. */
  readonly limits: readonly Limit[];
  /** The paper's own numbers, run again, for its journal page (ADR-0040). */
  readonly ownNumbers?: OwnNumbers;
}

export type BuildResult = { readonly ok: true; readonly world: BuiltWorld } | { readonly ok: false; readonly problems: readonly BuildProblem[] };

const sameNumber = (a: number, b: number): boolean => Object.is(a, b) || a === b;

/** Builds a world from a spec, or lists every problem found. Pure: the same spec and registry give the same world. */
export function buildWorld(input: unknown, registry: PrimitiveRegistry): BuildResult {
  const parsed = WorldSpec.safeParse(input);
  if (!parsed.success) {
    return { ok: false, problems: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) };
  }
  const upgraded = upgradeWorldSpec(parsed.data);
  if (!upgraded.ok) return { ok: false, problems: upgraded.problems };
  const spec = upgraded.spec;
  const problems: BuildProblem[] = [];
  const problem: Report = (path, message) => void problems.push({ path: path.join("."), message });

  const kit = sceneKit(spec.design.world);
  if (!kit) problem(["design", "world"], `the shell has no scene kit "${spec.design.world}"; it draws ${SCENE_KITS.map((known) => known.id).join(", ")}`);
  for (const choice of ["palette", "density"] as const) {
    const allowed: readonly string[] = SHELL[choice];
    if (!allowed.includes(spec.design[choice])) problem(["design", choice], `the shell cannot draw ${choice} "${spec.design[choice]}" yet; it draws ${allowed.join(", ")}`);
  }
  spec.design.sections.forEach((section, index) => {
    const charts: readonly string[] = SHELL.chartType;
    const motions: readonly string[] = SHELL.motion;
    if (!charts.includes(section.chartType)) problem(["design", "sections", index, "chartType"], `the shell has no ${section.chartType} chart yet`);
    if (!motions.includes(section.motion)) problem(["design", "sections", index, "motion"], `the shell has no "${section.motion}" motion yet`);
  });

  const levels = spec.levels.flatMap((level, index) => {
    const built = buildLevel(level, ["levels", index], spec, registry, problems);
    return built ? [built] : [];
  });

  // The world is one primitive's: its family, its kit's, and its time unit throughout.
  const first = levels[0]?.primitive;
  if (first && kit) {
    if (!kit.draws.families.includes(first.family) || !kit.draws.spaces.includes(first.space.kind)) {
      problem(["design", "world"], `the ${kit.id} kit draws ${kit.draws.families.join(", ")} on ${kit.draws.spaces.join(", ")}, not ${first.family} on ${first.space.kind}`);
    }
  }
  if (first && first.time.unit !== spec.timeUnit) problem(["timeUnit"], `${first.id} counts its time in ${TIME_WORDS[first.time.unit].many}, not ${TIME_WORDS[spec.timeUnit].many}`);
  if (first && spec.routing.family !== first.family) problem(["routing", "family"], `the paper is routed to ${spec.routing.family}, but ${first.id} belongs to ${first.family}`);
  if (problems.length > 0 || !kit || !first) return { ok: false, problems };
  return {
    ok: true,
    world: deepFreeze({
      title: spec.title,
      status: spec.status,
      source: spec.source,
      digest: spec.digest,
      routing: spec.routing,
      family: FAMILIES[first.family],
      variation: variationOf(FAMILIES[first.family], levels),
      design: spec.design,
      kit,
      timeUnit: spec.timeUnit,
      perWatchSecond: first.time.perWatchSecond,
      openingSeed: spec.openingSeed,
      levels,
      limits: spec.limits,
      ...(spec.ownNumbers ? { ownNumbers: spec.ownNumbers } : {}),
    }),
  };
}

/** A world's variation: without chance when every level's primitive says it never draws on its seed and the family varies such worlds otherwise. */
function variationOf(family: Family, levels: readonly BuiltLevel[]): Variation {
  const withoutChance = levels.every((level) => level.primitive.chance === false);
  return withoutChance && family.variationWithoutChance ? family.variationWithoutChance : family.variation;
}

type Report = (path: (string | number)[], message: string) => void;

function buildLevel(level: LevelV3, at: (string | number)[], spec: WorldSpecV3, registry: PrimitiveRegistry, problems: BuildProblem[]): BuiltLevel | null {
  const problem: Report = (path, message) => void problems.push({ path: path.join("."), message });
  const { binding, manipulable, counterfactual, observable } = level;
  if (binding.type === "widget") {
    problem([...at, "binding"], "widget bindings arrive with the widget tier (G3), behind FEATURE_WIDGETS=1 and in a sandboxed iframe");
    return null;
  }
  const primitiveRef = binding.type === "primitive" ? binding.primitive : binding.solver;
  let primitive: Primitive<unknown, unknown> | undefined;
  if (binding.type === "primitive") {
    primitive = registry.get(binding.primitive);
    if (!primitive) {
      problem([...at, "binding", "primitive"], `the registry has no ${binding.primitive.id}@${binding.primitive.version}`);
      return null;
    }
  } else {
    // A model given as data: its solver binds it, checking that its units agree, or refuses it.
    const solver = registry.solver(binding.solver);
    if (!solver) {
      problem([...at, "binding", "solver"], `the registry has no solver ${binding.solver.id}@${binding.solver.version}`);
      return null;
    }
    try {
      primitive = solver.bind(binding.model, { perWatchSecond: binding.perWatchSecond });
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      problem([...at, "binding", "model"], error.message);
      return null;
    }
  }
  const { variables, observables } = primitive.describe();
  // Later steps need earlier ones to have passed, so each stops if this level has a problem.
  const before = problems.length;


  for (const name of Object.keys(binding.params)) {
    if (!(name in variables)) problem([...at, "binding", "params", name], `${primitive.id} has no variable ${name}`);
  }

  const variable = variables[manipulable.targetVariable];
  if (!variable) {
    problem([...at, "manipulable", "targetVariable"], `${primitive.id} has no variable ${manipulable.targetVariable}`);
  } else {
    if (variable.phase !== "live") {
      problem([...at, "manipulable", "targetVariable"], `${manipulable.targetVariable} shapes only the start of a run, so a learner cannot move it during one`);
    }
    const [low, high] = manipulable.range;
    if (low < variable.range[0] || high > variable.range[1]) {
      problem([...at, "manipulable", "range"], `the range ${low}–${high} leaves ${manipulable.targetVariable}'s own ${variable.range[0]}–${variable.range[1]}`);
    }
    if (manipulable.unit !== variable.unit) problem([...at, "manipulable", "unit"], `${manipulable.targetVariable} is measured in ${variable.unit}, not ${manipulable.unit}`);
    if (variable.integer && !Number.isInteger(level.slider.step)) problem([...at, "slider", "step"], `${manipulable.targetVariable} takes whole numbers only`);
    const stated = binding.params[manipulable.targetVariable];
    if (stated !== undefined && !sameNumber(stated, manipulable.defaultValue)) {
      problem([...at, "binding", "params", manipulable.targetVariable], `the binding starts ${manipulable.targetVariable} at ${stated}, but the control at ${manipulable.defaultValue}`);
    }
  }

  const metric = observables[observable.metricId];
  if (!metric) problem([...at, "observable", "metricId"], `${primitive.id} does not measure ${observable.metricId}`);
  else if (observable.unit !== metric.unit) problem([...at, "observable", "unit"], `${observable.metricId} is measured in ${metric.unit}, not ${observable.unit}`);

  // The fork's measured difference: a metric the primitive measures, in the unit its summary gives.
  const { difference } = counterfactual;
  const measured = observables[difference.metricId];
  if (!measured) {
    problem([...at, "counterfactual", "difference", "metricId"], `${primitive.id} does not measure ${difference.metricId}`);
  } else {
    const expected = difference.summary.kind === "first-reach" ? TIME_WORDS[primitive.time.unit].many : difference.summary.kind === "total" ? null : measured.unit;
    if (expected !== null && difference.unit !== expected) {
      problem([...at, "counterfactual", "difference", "unit"], `a ${difference.summary.kind} summary of ${difference.metricId} is in ${expected}, not ${difference.unit}`);
    }
  }
  // The level rule: its time shows within 20 s of watching at 4x (ADR-0018), however the model counts time.
  const watched = difference.time / primitive.time.perWatchSecond / RULE_FASTEST_SPEED;
  if (watched > RULE_WATCH_SECONDS) {
    problem([...at, "counterfactual", "difference", "time"], `the level's time takes ${watched} s to watch at ${RULE_FASTEST_SPEED}x, more than the level rule's ${RULE_WATCH_SECONDS} s`);
  }

  for (const name of Object.keys(counterfactual.altParams)) {
    if (!(name in variables)) problem([...at, "counterfactual", "altParams", name], `${primitive.id} has no variable ${name}`);
  }
  if (problems.length > before) return null;

  const params = validParams(primitive, { ...defaultsOf(variables), ...binding.params, [manipulable.targetVariable]: manipulable.defaultValue }, [...at, "binding", "params"], problem);
  const forkParams = params ? validParams(primitive, { ...params, ...counterfactual.altParams }, [...at, "counterfactual", "altParams"], problem) : null;
  if (!params || !forkParams) return null;

  // The family's checks, on both worlds of the fork, over the level's time.
  const steps = Math.round(difference.time / primitive.fixedTimestep);
  for (const [world, values] of [["this world", params], ["the other world", forkParams]] as const) {
    for (const message of familyProblems(primitive, values, steps)) problem([...at, "binding", "model"], `In ${world}: ${message}`);
  }

  const overrides = Object.entries(counterfactual.altParams).map(([name, to]) => ({
    variable: name,
    from: params[name] ?? Number.NaN,
    to,
    phase: variables[name]?.phase ?? "live",
  }));
  if (overrides.every((override) => sameNumber(override.from, override.to))) {
    problem([...at, "counterfactual", "altParams"], "the what-if changes nothing: every override equals the level's own value");
  }

  if (level.setup.length > 0 && !primitive.apply) problem([...at, "setup"], `${primitive.id} has no entities to place`);
  const { space } = primitive;
  // A primitive's declared space bounds its placements, in both worlds of the fork.
  level.setup.forEach((placement, index) => {
    if (primitive.apply && !primitive.entities?.[placement.entity]) {
      problem([...at, "setup", index, "entity"], `${primitive.id} has no ${placement.entity} to place`);
      return;
    }
    if (space.kind !== "torus2d") {
      if (primitive.apply) problem([...at, "setup", index], `${primitive.id}'s world has no space to place ${placement.entityId} in`);
      return;
    }
    const sized = [params, forkParams].map((world) => ({ width: world[space.width] ?? Number.NaN, height: world[space.height] ?? Number.NaN }));
    const outside = sized.find(({ width, height }) => !(placement.x < width && placement.y < height));
    if (outside) {
      problem([...at, "setup", index], `${placement.entityId} at (${placement.x}, ${placement.y}) lies outside a ${outside.width} × ${outside.height} world`);
    }
  });
  if (problems.length > before) return null;

  const visible = Object.fromEntries(BUILD_DEPTHS.map((depth) => [depth, new Set(level.explanation[depth].show)])) as Record<Depth, Set<DepthElement>>;
  return {
    id: level.id,
    order: level.order,
    kind: level.kind,
    title: level.title,
    goal: level.goal,
    bonus: level.bonus,
    primitive,
    primitiveRef,
    params,
    action: {
      actionId: manipulable.actionId,
      label: manipulable.label,
      variable: manipulable.targetVariable,
      range: manipulable.range,
      defaultValue: manipulable.defaultValue,
      unit: manipulable.unit,
      step: level.slider.step,
      ends: level.slider.ends,
      origin: manipulable.origin,
      anchors: manipulable.anchors,
    },
    actions: { [manipulable.actionId]: manipulable.targetVariable },
    setup: level.setup.map((placement) => ({
      event: { kind: "place", step: 0, entityId: placement.entityId, entity: placement.entity, x: placement.x, y: placement.y },
      origin: placement.origin,
      anchors: placement.anchors,
    })),
    observable,
    fork: {
      prompt: counterfactual.prompt,
      effect: counterfactual.expectedQualitativeEffect,
      origin: counterfactual.origin,
      isSpeculative: counterfactual.isSpeculative,
      anchors: counterfactual.anchors,
      params: forkParams,
      overrides,
      restarts: overrides.some((override) => override.phase === "init") || FAMILIES[primitive.family].forkFrom === "start",
      difference,
    },
    visible,
    explanation: level.explanation,
    caption: level.caption,
    guide: level.guide,
    exploration: level.guidedExploration,
    furtherReading: level.furtherReading,
    carryForward: level.carryForward,
    ...(level.observation ? { observation: level.observation } : {}),
  };
}

function defaultsOf(variables: Readonly<Record<string, VariableDescription>>): Record<string, number> {
  return Object.fromEntries(Object.entries(variables).map(([name, variable]) => [name, variable.defaultValue]));
}

function validParams(
  primitive: Primitive<unknown, unknown>,
  candidate: Record<string, number>,
  at: (string | number)[],
  problem: Report,
): Readonly<Record<string, number>> | null {
  const result = primitive.paramSchema.safeParse(candidate);
  if (result.success) return result.data as Record<string, number>;
  for (const issue of result.error.issues) problem([...at, ...issue.path.map(String)], issue.message);
  return null;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value) && !(value instanceof Set)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
