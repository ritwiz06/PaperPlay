/**
 * The level rule as a pipeline stage (ADR-0018, ADR-0024): every level's stated effect, checked on
 * 20 starts before anyone sees it. A model with chance in it starts from seeds 1 to 20; one with
 * none, from the world's own values and 19 others, each parameter within a tenth of its value (its
 * neighbourhood). Both worlds of each fork run from the same start, the What-if setting its
 * variables to their stated values; each is summarised as its measured difference says, and the
 * claim is checked. A level meets the rule when an "each" claim holds on at least 16 of 20 starts,
 * or a "count" claim's count is exactly right. For a compartment model, every run is also held to
 * the accuracy check. Pure and deterministic; scripts/sweep/levels.ts writes the records.
 */
import { RULE_HOLDS, RULE_SEEDS, TIME_WORDS, type PlaceEvent } from "@paperplay/contracts";
import { mulberry32, type Primitive } from "@paperplay/primitives";
import { accuracyReport, type CompartmentModel } from "@paperplay/primitives/compartments";
import type { BuiltLevel, BuiltWorld } from "../builder/build.ts";
import { claimHolds, SAMPLE_STEPS, sampleCount, summarise } from "../builder/difference.ts";

export const SKIES: readonly number[] = Array.from({ length: RULE_SEEDS }, (_, index) => index + 1);
/** A deterministic model's neighbourhood: each parameter within this fraction of the world's value (ADR-0024). */
export const NEIGHBOURHOOD = 0.1;

export interface Start {
  readonly start: number;
  readonly seed: number;
  readonly factors: Readonly<Record<string, number>>;
}

/**
 * The world's 20 starts. Seeds 1 to 20 for a model with chance in it; for one with none, the
 * world's values first, then 19 points of its neighbourhood, start k's factors drawn from
 * mulberry32(k) in the parameters' alphabetical order.
 */
export function startsOf(world: BuiltWorld): Start[] {
  const { variation } = world.family;
  if (variation === "seeds") return SKIES.map((seed) => ({ start: seed, seed, factors: {} }));
  if (variation !== "neighbourhood") throw new Error(`the levels sweep cannot vary a world over ${variation} yet`);
  const names = [...new Set(world.levels.flatMap((level) => Object.keys(level.params)))].sort();
  return SKIES.map((start) => {
    if (start === 1) return { start, seed: world.openingSeed, factors: {} };
    const random = mulberry32(start);
    return { start, seed: world.openingSeed, factors: Object.fromEntries(names.map((name) => [name, 1 + NEIGHBOURHOOD * (2 * random.next() - 1)])) };
  });
}

type Params = Readonly<Record<string, number>>;
const scaled = (params: Params, factors: Readonly<Record<string, number>>): Record<string, number> =>
  Object.fromEntries(Object.entries(params).map(([name, value]) => [name, value * (factors[name] ?? 1)]));

/** A level's two worlds at a start: its parameters scaled, then the What-if's variables set to their stated values. */
export function worldsAt(level: BuiltLevel, start: Start): { readonly here: Params; readonly there: Params } {
  const parse = (params: Params): Params => level.primitive.paramSchema.parse(params) as Params;
  if (Object.keys(start.factors).length === 0) return { here: level.params, there: level.fork.params };
  const here = parse(scaled(level.params, start.factors));
  const there = parse({ ...here, ...Object.fromEntries(level.fork.overrides.map((override) => [override.variable, override.to])) });
  return { here, there };
}

/** One world, sampled every SAMPLE_STEPS steps from step 0, with every observable at each sample. */
function sampled(primitive: Primitive<unknown, unknown>, params: Params, setup: readonly PlaceEvent[], seed: number, time: number): Record<string, number>[] {
  let state = primitive.init(params, seed);
  for (const event of setup) {
    if (!primitive.apply) throw new Error(`${primitive.id} has no entities to place`);
    state = primitive.apply(state, event);
  }
  const samples = [primitive.measure(state)];
  const count = sampleCount(time, primitive.fixedTimestep);
  for (let sample = 1; sample < count; sample++) {
    for (let step = 0; step < SAMPLE_STEPS; step++) state = primitive.step(state, params, primitive.fixedTimestep);
    samples.push(primitive.measure(state));
  }
  return samples;
}

/** Runs each distinct world once per start, to the longest time any level asks of it. */
function worldCache(primitive: Primitive<unknown, unknown>) {
  const runs = new Map<string, Record<string, number>[]>();
  return (params: Params, setup: readonly PlaceEvent[], seed: number, time: number): Record<string, number>[] => {
    const key = JSON.stringify([params, setup, seed]);
    const known = runs.get(key);
    const needed = sampleCount(time, primitive.fixedTimestep);
    if (known && known.length >= needed) return known.slice(0, needed);
    const fresh = sampled(primitive, params, setup, seed, time);
    runs.set(key, fresh);
    return fresh;
  };
}

export interface SkyResult {
  /** The start's number, which for a model with chance in it is its seed. */
  readonly seed: number;
  readonly here: number;
  readonly there: number;
  readonly holds: boolean;
}

export interface LevelResult {
  readonly id: string;
  readonly order: number;
  readonly title: string;
  readonly prompt: string;
  readonly effect: string;
  readonly label: string;
  readonly unit: string;
  readonly claim: BuiltLevel["fork"]["difference"]["claim"];
  /** The level's time, in the world's time unit. */
  readonly time: number;
  readonly skies: readonly SkyResult[];
  readonly holds: number;
  readonly meets: boolean;
}

export function sweepLevels(world: BuiltWorld, starts: readonly Start[] = startsOf(world)): LevelResult[] {
  const primitive = world.levels[0]?.primitive;
  if (!primitive) throw new Error("the world has no levels");
  const run = worldCache(primitive);
  const at = (level: BuiltLevel) => starts.map((start) => ({ start, ...worldsAt(level, start) }));
  // The longest each world is needed, so a shared world is run once, to that time.
  const longest = new Map<string, number>();
  const note = (params: Params, setup: readonly PlaceEvent[], seed: number, time: number) => {
    const key = JSON.stringify([params, setup, seed]);
    longest.set(key, Math.max(longest.get(key) ?? 0, time));
  };
  for (const level of world.levels) {
    const setup = level.setup.map((placement) => placement.event);
    for (const { start, here, there } of at(level)) {
      note(here, setup, start.seed, level.fork.difference.time);
      note(there, setup, start.seed, level.fork.difference.time);
    }
  }
  const series = (params: Params, setup: readonly PlaceEvent[], seed: number, time: number, metric: string): number[] => {
    const all = run(params, setup, seed, longest.get(JSON.stringify([params, setup, seed])) ?? time);
    return all.slice(0, sampleCount(time, primitive.fixedTimestep)).map((observed) => observed[metric] ?? Number.NaN);
  };

  return world.levels.map((level) => {
    const { difference } = level.fork;
    const setup = level.setup.map((placement) => placement.event);
    const results = at(level).map(({ start, here: params, there: other }) => {
      const here = summarise(difference, series(params, setup, start.seed, difference.time, difference.metricId), primitive.fixedTimestep);
      const there = summarise(difference, series(other, setup, start.seed, difference.time, difference.metricId), primitive.fixedTimestep);
      return { seed: start.start, here, there, holds: claimHolds(difference.claim, here, there) };
    });
    const holds = results.filter((result) => result.holds).length;
    const meets = difference.claim.kind === "each" ? holds >= RULE_HOLDS : holds === difference.claim.holds;
    return {
      id: level.id,
      order: level.order,
      title: level.title,
      prompt: level.fork.prompt,
      effect: level.fork.effect,
      label: difference.label,
      unit: difference.unit,
      claim: difference.claim,
      time: difference.time,
      skies: results,
      holds,
      meets,
    };
  });
}

/** The accuracy check (ADR-0028) over every run the sweep makes: the most any compartment moves when the step is halved, as a share of what the check allows. */
export interface AccuracyResult {
  readonly order: number;
  readonly title: string;
  /** Below 1 passes; Infinity when a run broke down. */
  readonly ratio: number;
  readonly deviation: number;
  readonly allowance: number;
  /** Where it moved most: the compartment, the time, the start and the world. */
  readonly where: string;
}

export function sweepAccuracy(world: BuiltWorld, starts: readonly Start[] = startsOf(world)): AccuracyResult[] {
  return world.levels.map((level) => {
    const model = level.primitive as CompartmentModel;
    if (!("spec" in model)) throw new Error(`${level.primitive.id} is not a compartment model`);
    const steps = Math.round(level.fork.difference.time / model.fixedTimestep);
    let worst: AccuracyResult = { order: level.order, title: level.title, ratio: 0, deviation: 0, allowance: 0, where: "" };
    for (const start of starts) {
      const worlds = worldsAt(level, start);
      for (const [name, params] of [["this world", worlds.here], ["the other world", worlds.there]] as const) {
        const report = accuracyReport(model, params, steps);
        if ("failure" in report) return { ...worst, ratio: Number.POSITIVE_INFINITY, where: `start ${start.start}, ${name}: ${report.failure}` };
        if (report.ratio > worst.ratio) {
          const compartment = model.spec.compartments[report.compartment];
          const when = `${TIME_WORDS[model.time.unit].one} ${(report.step * model.fixedTimestep).toFixed(1)}`;
          worst = { ...worst, ratio: report.ratio, deviation: report.deviation, allowance: report.allowance, where: `${compartment?.name ?? "?"} (${compartment?.id ?? "?"}), ${when}, start ${start.start}, ${name}` };
        }
      }
    }
    return worst;
  });
}
