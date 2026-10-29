import { z } from "zod";

// A generated mechanism (ADR-0058): plain JavaScript a writer agent wrote for a paper no family
// covers, run only in a sandbox, in Node for the checks and in a worker in a separate-origin frame
// in the browser. These schemas are what the host holds a module to: nothing a module says or
// returns is used until it has been parsed here.

/** The generic scene kits a module draws in; each frame a module emits is one of these. */
export const MECHANISM_KITS = ["particles", "towers", "grid", "network", "landscape", "charts"] as const;
export const MechanismKit = z.enum(MECHANISM_KITS);
export type MechanismKit = z.infer<typeof MechanismKit>;

/** The limits a module is held to: its size, and each call's time in the sandbox. */
export const MECHANISM_LIMITS = Object.freeze({
  /** The module's source, in UTF-16 code units. */
  sourceChars: 24_000,
  /** One request to the sandbox: a whole run of steps, or one step with its frame. */
  callMs: 2_000,
  /** The heap a module's sandbox may use in Node, in megabytes. */
  heapMb: 64,
  /** A step with its measurement and frame, on average, so a world plays at 30 frames a second. */
  stepMs: 8,
  /** The longest run a module may ask for, in steps. */
  steps: 1_000,
});

const MechanismId = z.string().regex(/^[a-z][A-Za-z0-9]{0,31}$/, "must be a camelCase identifier, starting with a lowercase letter");
const Finite = z.number().refine(Number.isFinite, "must be a finite number");
const Words = (max: number) => z.string().trim().min(1).max(max);

/** One parameter a learner can move: its range, its unit and where it starts. */
export const MechanismParam = z
  .strictObject({
    id: MechanismId,
    label: Words(60),
    /** Its unit in words, or "" when it has none. */
    unit: z.string().max(30),
    min: Finite,
    max: Finite,
    default: Finite,
    /** Whole numbers only, such as a count of heads. */
    integer: z.boolean().optional(),
    /**
     * What the paper means by it (ADR-0058's amendment): its own value, and the value that takes it
     * away as the paper means, which may not be the end of the range (for the √dk scaling, dividing by
     * 1, not multiplying the scores by 0), or null when taking it away means nothing in the paper.
     */
    paper: z
      .strictObject({
        normal: Finite,
        without: Finite.nullable(),
        /** What taking it away means in the paper, in a sentence. */
        meaning: Words(200),
      })
      .optional(),
  })
  .refine((param) => param.min < param.max, { error: "min must be below max", path: ["max"] })
  .refine((param) => param.default >= param.min && param.default <= param.max, { error: "default must lie between min and max", path: ["default"] })
  .refine((param) => !param.integer || [param.min, param.max, param.default].every(Number.isInteger), { error: "an integer parameter's min, max and default must be whole numbers", path: ["integer"] })
  .refine((param) => !param.paper || param.paper.normal === param.default, { error: "the paper's normal value is the default", path: ["paper", "normal"] })
  .refine((param) => !param.paper || param.paper.without === null || (param.paper.without >= param.min && param.paper.without <= param.max && param.paper.without !== param.default), { error: "the value that takes it away lies in the range, and is not the default", path: ["paper", "without"] });
export type MechanismParam = z.infer<typeof MechanismParam>;

/** One number the module measures from its state. */
export const MechanismMeasurement = z.strictObject({
  id: MechanismId,
  label: Words(60),
  unit: z.string().max(30),
  /** What it measures, in one plain sentence. */
  meaning: Words(200),
});
export type MechanismMeasurement = z.infer<typeof MechanismMeasurement>;

/** What a module declares of itself: its kit, its parameters and measurements, and a run's length. */
export const MechanismManifest = z
  .strictObject({
    title: Words(80),
    kit: MechanismKit,
    params: z.array(MechanismParam).min(1).max(6),
    measurements: z.array(MechanismMeasurement).min(1).max(6),
    /** How many steps one run lasts. */
    steps: z.int().min(1).max(MECHANISM_LIMITS.steps),
    /** What one step is, in a word or two: "layer", "iteration", "day". */
    stepLabel: Words(30),
  })
  .refine((manifest) => new Set(manifest.params.map((param) => param.id)).size === manifest.params.length, { error: "each parameter needs its own id", path: ["params"] })
  .refine((manifest) => new Set(manifest.measurements.map((measurement) => measurement.id)).size === manifest.measurements.length, { error: "each measurement needs its own id", path: ["measurements"] });
export type MechanismManifest = z.infer<typeof MechanismManifest>;

// Frames: what a kit draws, every position and value scaled by the module to 0..1, so a kit never
// has to guess a range; x runs rightward and y downward, as a grid's rows do. A group picks one of
// six colours; a label is a word or two.
const Unit = z.number().min(0).max(1);
const Group = z.int().min(0).max(5).optional();
const Label = z.string().max(24).optional();

export const ParticlesFrame = z.strictObject({
  particles: z.array(z.strictObject({ x: Unit, y: Unit, heading: Finite.optional(), size: Unit.optional(), group: Group })).min(1).max(2_000),
});
export const TowersFrame = z.strictObject({
  towers: z.array(z.strictObject({ label: Label, height: Unit, group: Group })).min(1).max(64),
  /** A beam joins two towers by index; its weight is how strongly it is drawn. */
  beams: z.array(z.strictObject({ from: z.int().nonnegative(), to: z.int().nonnegative(), weight: Unit, group: Group })).max(4_096),
});
export const GridFrame = z.strictObject({
  rows: z.int().min(1).max(128),
  cols: z.int().min(1).max(128),
  /** Row by row, rows × cols values. */
  cells: z.array(Unit),
});
export const NetworkFrame = z.strictObject({
  nodes: z.array(z.strictObject({ x: Unit, y: Unit, value: Unit, label: Label, group: Group })).min(1).max(500),
  edges: z.array(z.strictObject({ from: z.int().nonnegative(), to: z.int().nonnegative(), weight: Unit })).max(5_000),
});
export const LandscapeFrame = z.strictObject({
  /** A height field, rows of columns, each 2 to 64. */
  heights: z.array(z.array(Unit).min(2).max(64)).min(2).max(64),
  marks: z.array(z.strictObject({ x: Unit, y: Unit, label: Label, group: Group })).max(50),
});
export const ChartsFrame = z.strictObject({
  bars: z.array(z.strictObject({ label: Label, value: Unit, group: Group })).min(1).max(64),
});

export const MECHANISM_FRAMES = Object.freeze({
  particles: ParticlesFrame,
  towers: TowersFrame,
  grid: GridFrame,
  network: NetworkFrame,
  landscape: LandscapeFrame,
  charts: ChartsFrame,
} satisfies Record<MechanismKit, z.ZodType>);

export type ParticlesFrame = z.infer<typeof ParticlesFrame>;
export type TowersFrame = z.infer<typeof TowersFrame>;
export type GridFrame = z.infer<typeof GridFrame>;
export type NetworkFrame = z.infer<typeof NetworkFrame>;
export type LandscapeFrame = z.infer<typeof LandscapeFrame>;
export type ChartsFrame = z.infer<typeof ChartsFrame>;
export type MechanismFrame = { readonly kit: "particles"; readonly frame: ParticlesFrame } | { readonly kit: "towers"; readonly frame: TowersFrame } | { readonly kit: "grid"; readonly frame: GridFrame } | { readonly kit: "network"; readonly frame: NetworkFrame } | { readonly kit: "landscape"; readonly frame: LandscapeFrame } | { readonly kit: "charts"; readonly frame: ChartsFrame };

/**
 * A frame checked against its kit: the schema, then what a schema cannot say (a grid's size, beams
 * and edges that join things that exist, a landscape's rows of one length). Returns the problems in
 * words, or the frame.
 */
export function parseFrame(kit: MechanismKit, value: unknown): { readonly ok: true; readonly frame: MechanismFrame } | { readonly ok: false; readonly problems: readonly string[] } {
  const parsed = MECHANISM_FRAMES[kit].safeParse(value);
  if (!parsed.success) return { ok: false, problems: parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".") || "the frame"}: ${issue.message}`) };
  const frame = parsed.data;
  const problems: string[] = [];
  if (kit === "grid") {
    const grid = frame as GridFrame;
    if (grid.cells.length !== grid.rows * grid.cols) problems.push(`cells: a grid of ${grid.rows} rows and ${grid.cols} columns needs ${grid.rows * grid.cols} cells, not ${grid.cells.length}`);
  }
  if (kit === "towers") {
    const towers = frame as TowersFrame;
    const outside = towers.beams.find((beam) => beam.from >= towers.towers.length || beam.to >= towers.towers.length);
    if (outside) problems.push(`beams: a beam joins tower ${Math.max(outside.from, outside.to)}, but there are only ${towers.towers.length} towers, numbered from 0`);
  }
  if (kit === "network") {
    const network = frame as NetworkFrame;
    const outside = network.edges.find((edge) => edge.from >= network.nodes.length || edge.to >= network.nodes.length);
    if (outside) problems.push(`edges: an edge joins node ${Math.max(outside.from, outside.to)}, but there are only ${network.nodes.length} nodes, numbered from 0`);
  }
  if (kit === "landscape") {
    const landscape = frame as LandscapeFrame;
    const width = landscape.heights[0]?.length ?? 0;
    if (landscape.heights.some((row) => row.length !== width)) problems.push("heights: every row needs the same number of columns");
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, frame: { kit, frame } as MechanismFrame };
}

/** What every world of this tier says of itself, wherever it is shown (ADR-0058). */
export const GENERATED_MODEL_LABEL = "generated model: behaviour checked, not verified against the paper";

/** A generated module named as a primitive: its hash's first 12 characters, so two modules never share a name. */
export const mechanismRef = (sha256: string): { readonly id: string; readonly version: string } => ({ id: `mechanism.g${sha256.slice(0, 12)}`, version: "1.0.0" });
