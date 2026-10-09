/**
 * The deterministic builder (brief §5, R08): a WorldSpec in, a playable composition out, with
 * no model call. It validates the spec, then checks it against the primitive registry, which
 * the schema alone cannot see: every variable exists, every value is in range, units agree,
 * placements lie inside the world. It decides nothing a spec states, and derives what no spec
 * should state, such as whether a fork restarts both worlds (ADR-0014).
 */
import {
  WorldSpec,
  type AnchorRef,
  type DepthElement,
  type Digest,
  type DesignSpec,
  type Explanation,
  type GuideScript,
  type GuidedExploration,
  type Level,
  type LevelKind,
  type MeasuredDifference,
  type Observable,
  type Origin,
  type PendingSource,
  type PlaceEvent,
  type PrimitiveRef,
  type SourceManifest,
} from "@paperplay/contracts";
import type { Primitive, PrimitiveRegistry, VariableDescription } from "@paperplay/primitives";

export type Depth = keyof Explanation;
export const BUILD_DEPTHS: readonly Depth[] = ["beginner", "intermediate", "advanced"];

/** What the game-first shell can draw today. A spec asking for more is refused, never quietly drawn otherwise. */
export const SHELL = {
  world: ["valley"],
  palette: ["cream-teal"],
  density: ["comfortable"],
  chartType: ["none", "line"],
  motion: ["none"],
} as const satisfies { readonly [K in "world" | "palette" | "density"]: readonly DesignSpec[K][] } & {
  readonly chartType: readonly DesignSpec["sections"][number]["chartType"][];
  readonly motion: readonly DesignSpec["sections"][number]["motion"][];
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
  /** Derived: an override of a start-up (init-phase) variable makes both worlds restart from the same seed. */
  readonly restarts: boolean;
  /** The one measured difference between the worlds, and the claim the level makes about it (ADR-0018). */
  readonly difference: MeasuredDifference;
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
  readonly caption: Level["caption"];
  readonly guide: GuideScript;
  /** Predict, intervene, observe, explain, when the level asks for a prediction. */
  readonly exploration: GuidedExploration | null;
  readonly furtherReading: readonly string[];
  readonly carryForward: string;
}

export interface BuiltWorld {
  readonly title: string;
  readonly status: WorldSpec["status"];
  readonly source: SourceManifest | PendingSource;
  readonly digest: Digest;
  readonly design: DesignSpec;
  readonly levels: readonly BuiltLevel[];
  readonly limitations: readonly string[];
}

export type BuildResult = { readonly ok: true; readonly world: BuiltWorld } | { readonly ok: false; readonly problems: readonly BuildProblem[] };

const sameNumber = (a: number, b: number): boolean => Object.is(a, b) || a === b;

/** Builds a world from a spec, or lists every problem found. Pure: the same spec and registry give the same world. */
export function buildWorld(input: unknown, registry: PrimitiveRegistry): BuildResult {
  const parsed = WorldSpec.safeParse(input);
  if (!parsed.success) {
    return { ok: false, problems: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) };
  }
  const spec = parsed.data;
  const problems: BuildProblem[] = [];
  const problem: Report = (path, message) => void problems.push({ path: path.join("."), message });

  for (const choice of ["world", "palette", "density"] as const) {
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
    const built = buildLevel(level, ["levels", index], registry, problems);
    return built ? [built] : [];
  });

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    world: deepFreeze({
      title: spec.title,
      status: spec.status,
      source: spec.source,
      digest: spec.digest,
      design: spec.design,
      levels,
      limitations: spec.limitations,
    }),
  };
}

type Report = (path: (string | number)[], message: string) => void;

function buildLevel(level: Level, at: (string | number)[], registry: PrimitiveRegistry, problems: BuildProblem[]): BuiltLevel | null {
  const problem: Report = (path, message) => void problems.push({ path: path.join("."), message });
  const { binding, manipulable, counterfactual, observable } = level;
  if (binding.type === "widget") {
    problem([...at, "binding"], "widget bindings arrive with the widget tier (G3), behind FEATURE_WIDGETS=1 and in a sandboxed iframe");
    return null;
  }
  const primitive = registry.get(binding.primitive);
  if (!primitive) {
    problem([...at, "binding", "primitive"], `the registry has no ${binding.primitive.id}@${binding.primitive.version}`);
    return null;
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
    const expected = difference.summary.kind === "first-reach" ? "seconds" : difference.summary.kind === "total" ? null : measured.unit;
    if (expected !== null && difference.unit !== expected) {
      problem([...at, "counterfactual", "difference", "unit"], `a ${difference.summary.kind} summary of ${difference.metricId} is in ${expected}, not ${difference.unit}`);
    }
  }

  for (const name of Object.keys(counterfactual.altParams)) {
    if (!(name in variables)) problem([...at, "counterfactual", "altParams", name], `${primitive.id} has no variable ${name}`);
  }
  if (problems.length > before) return null;

  const params = validParams(primitive, { ...defaultsOf(variables), ...binding.params, [manipulable.targetVariable]: manipulable.defaultValue }, [...at, "binding", "params"], problem);
  const forkParams = params ? validParams(primitive, { ...params, ...counterfactual.altParams }, [...at, "counterfactual", "altParams"], problem) : null;
  if (!params || !forkParams) return null;

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
  // A primitive with worldWidth and worldHeight variables bounds its placements by them, in both worlds of the fork.
  level.setup.forEach((placement, index) => {
    const outside = [params, forkParams].find((world) => {
      const { worldWidth: width, worldHeight: height } = world;
      return width !== undefined && height !== undefined && !(placement.x < width && placement.y < height);
    });
    if (outside) {
      problem([...at, "setup", index], `${placement.entityId} at (${placement.x}, ${placement.y}) lies outside a ${outside.worldWidth} × ${outside.worldHeight} world`);
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
    primitiveRef: binding.primitive,
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
      restarts: overrides.some((override) => override.phase === "init"),
      difference,
    },
    visible,
    explanation: level.explanation,
    caption: level.caption,
    guide: level.guide,
    exploration: level.guidedExploration ?? null,
    furtherReading: level.furtherReading,
    carryForward: level.carryForward,
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
