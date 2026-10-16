/**
 * The visibility rule, beside the level rule (the owner, 2026-10-16; ADR-0037): a level's measured
 * difference must be clearly visible where the learner looks, at the world's own values.
 *
 * - **On the fork's chart,** whose value axis is fitted to the measured quantity, not to the whole
 *   population: the two worlds' curves must part by at least VISIBLE_SHARE of the axis.
 * - **In the scene,** for the town kit: the measured compartment's figures must differ by at least
 *   VISIBLE_FIGURES between the two towns at some moment. When the quantity is too small for the
 *   town's 120 figures to show, a labelled lens draws only that compartment, each figure standing
 *   for a stated amount: a teaching choice, said on screen. A level the lens cannot show either
 *   fails, and is repaired like any other.
 *
 * Pure and deterministic. The shell draws its chart's axis and the town's lens from the same
 * functions, so what is checked is what is drawn.
 */
import type { CompartmentModel } from "@paperplay/primitives/compartments";
import type { BuiltLevel, BuiltWorld } from "../builder/build.ts";
import { SAMPLE_STEPS, sampleCount } from "../builder/difference.ts";

/** The two curves must part by at least this share of the chart's height. */
export const VISIBLE_SHARE = 0.1;
/** At least this many figures must differ between the two towns. */
export const VISIBLE_FIGURES = 3;
/** Through a lens, the largest amount of the measured compartment is drawn as about this many figures. */
export const LENS_FIGURES = 60;
/** A population given as shares is shown as people in a town of this size: a teaching choice, said on screen. */
export const SHARE_TOWN = 10_000;

type Params = Readonly<Record<string, number>>;

/** The town kit's 120 figures (ADR-0029). */
export const TOWN_FIGURES = 120;

/**
 * Each share's figures, by largest remainder, exactly as the town kit counts them: the stage core
 * may not be imported here, nor this there, so scripts/test/town-figures.test.ts holds the two equal.
 */
export function townFigureCounts(shares: readonly number[], figures = TOWN_FIGURES): number[] {
  const clean = shares.map((share) => (Number.isFinite(share) && share > 0 ? share : 0));
  const total = clean.reduce((sum, share) => sum + share, 0);
  if (total <= 0) return clean.map((_, index) => (index === 0 ? figures : 0));
  const exact = clean.map((share) => (share / total) * figures);
  const counts = exact.map(Math.floor);
  let left = figures - counts.reduce((sum, count) => sum + count, 0);
  const byRemainder = exact.map((value, index) => ({ index, remainder: value - Math.floor(value) })).sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of byRemainder) {
    if (left <= 0) break;
    counts[index] = (counts[index] ?? 0) + 1;
    left--;
  }
  return counts;
}


/**
 * The top of a chart's value axis, fitted to what it draws: a round number above everything, in
 * steps of half a power of ten just above one, so 1,150 tops out at 1,500 rather than 2,000.
 */
export function chartTopOf(values: readonly number[], threshold?: number): number {
  const finite = values.filter((value) => Number.isFinite(value));
  const highest = Math.max(threshold ?? 0, ...finite) * 1.15;
  if (!(highest > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(highest));
  const step = highest / power < 2 ? power / 2 : power;
  return Math.ceil(highest / step) * step;
}

/** A round amount at or above `value`: 1, 2 or 5 times a power of ten. */
function niceAtLeast(value: number): number {
  if (!(value > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const factor of [1, 2, 5, 10]) if (factor * power >= value * (1 - 1e-12)) return factor * power;
  return 10 * power;
}

/** Whether a compartment model's compartments are shares of a population: none has a unit, and at the start they add up to one. */
export function sharesOf(model: CompartmentModel, params: Params): boolean {
  if (!model.spec.compartments.every((compartment) => Object.keys(compartment.unit).length === 0)) return false;
  const total = Object.values(model.init(params, 0).compartments).reduce((sum, value) => sum + value, 0);
  return total > 0.95 && total < 1.05;
}

/** One world's samples of every observable, from step 0, every SAMPLE_STEPS steps, to the level's time. */
function samples(level: BuiltLevel, params: Params, seed: number): Record<string, number>[] {
  const { primitive } = level;
  let state = primitive.init(params, seed);
  for (const placement of level.setup) {
    if (!primitive.apply) throw new Error(`${primitive.id} has no entities to place`);
    state = primitive.apply(state, placement.event);
  }
  const out = [primitive.measure(state)];
  const count = sampleCount(level.fork.difference.time, primitive.fixedTimestep);
  for (let sample = 1; sample < count; sample++) {
    for (let step = 0; step < SAMPLE_STEPS; step++) state = primitive.step(state, params, primitive.fixedTimestep);
    out.push(primitive.measure(state));
  }
  return out;
}

export interface Lens {
  /** The measured compartment, the only one the lens draws. */
  readonly compartment: string;
  /** How much of it each figure stands for, in the model's own unit. */
  readonly perFigure: number;
}

export interface LevelVisibility {
  readonly id: string;
  readonly order: number;
  readonly title: string;
  readonly chart: { readonly top: number; readonly gap: number; readonly share: number; readonly visible: boolean };
  /** For the town kit: the figures that differ at most, with the lens when one is needed; null for a scene this rule does not measure. */
  readonly scene: { readonly lens: Lens | null; readonly figures: number; readonly visible: boolean } | null;
  readonly visible: boolean;
  /** Why not, in words, for the planner. */
  readonly why: string | null;
}

/** The lens a town needs for a level, or null when its 120 figures show the difference already. */
export function townLensOf(level: BuiltLevel, seed: number): { readonly lens: Lens | null; readonly figures: number } | null {
  const model = level.primitive as unknown as CompartmentModel;
  const metric = model.spec.observables.find((observable) => observable.id === level.fork.difference.metricId);
  const measured = metric && "c" in metric.expr ? metric.expr.c : null;
  if (!measured) return null;
  const order = model.spec.compartments.map((compartment) => compartment.id);
  const index = order.indexOf(measured);
  const observableOf = (id: string) => model.spec.observables.find((observable) => "c" in observable.expr && observable.expr.c === id)?.id ?? id;
  const valuesOf = (sample: Record<string, number>) => order.map((id) => sample[observableOf(id)] ?? 0);
  const here = samples(level, level.params, seed).map(valuesOf);
  const there = samples(level, level.fork.params, seed).map(valuesOf);
  const gapOf = (count: (values: readonly number[]) => number): number => Math.max(0, ...here.map((values, at) => Math.abs(count(values) - count(there[at] ?? values))));
  const whole = gapOf((values) => townFigureCounts(values)[index] ?? 0);
  if (whole >= VISIBLE_FIGURES) return { lens: null, figures: whole };
  const largest = Math.max(...[...here, ...there].map((values) => values[index] ?? 0));
  const perFigure = niceAtLeast(largest / LENS_FIGURES);
  const through = gapOf((values) => Math.min(TOWN_FIGURES, Math.round((values[index] ?? 0) / perFigure)));
  return { lens: { compartment: measured, perFigure }, figures: through };
}

/** Every level's visibility, at the world's own values. */
export function visibilityOf(world: BuiltWorld): LevelVisibility[] {
  return world.levels.map((level, index) => {
    const { difference } = level.fork;
    const metric = (sample: Record<string, number>) => sample[difference.metricId] ?? Number.NaN;
    const here = samples(level, level.params, world.openingSeed).map(metric);
    const there = samples(level, level.fork.params, world.openingSeed).map(metric);
    const threshold = difference.summary.kind === "first-reach" ? difference.summary.threshold : undefined;
    const top = chartTopOf([...here, ...there], threshold);
    const gap = Math.max(0, ...here.map((value, at) => Math.abs(value - (there[at] ?? value))).filter((value) => Number.isFinite(value)));
    const share = gap / top;
    const chart = { top, gap, share, visible: share >= VISIBLE_SHARE };
    const town = world.kit.id === "town" ? townLensOf(level, world.openingSeed) : null;
    const scene = town ? { lens: town.lens, figures: town.figures, visible: town.figures >= VISIBLE_FIGURES } : null;
    const reasons = [
      ...(chart.visible ? [] : [`its two curves part by ${(share * 100).toFixed(1)}% of the chart's height at most, less than ${VISIBLE_SHARE * 100}%`]),
      ...(scene && !scene.visible ? [`in the town at most ${scene.figures} figure(s) differ${scene.lens ? ", even through a lens" : ""}, fewer than ${VISIBLE_FIGURES}`] : []),
    ];
    return { id: level.id, order: index + 1, title: level.title, chart, scene, visible: reasons.length === 0, why: reasons.length > 0 ? reasons.join("; ") : null };
  });
}
