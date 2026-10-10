/**
 * The levels sweep (ADR-0018, ADR-0024): every level's stated effect, checked on 20 starts before
 * it stands in a fixture. Pure and deterministic. A model with chance in it, like the flock, starts
 * from seeds 1 to 20 (skies); a model with none, like a compartment model, from the world's own
 * values and 19 others, each parameter within a tenth of its value (its neighbourhood). For each
 * level and start, both worlds of its fork run from the same start, with the level's setup, for
 * the level's time, the What-if setting its variables to their stated values; each is summarised
 * as its measured difference says, and the claim is checked. A level meets the rule when an
 * "each" claim holds on at least 16 of 20 starts, or a "count" claim's count is exactly right.
 *
 * It also re-measures the flocking world's level 4 candidate (b), so that decision can be reproduced.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RULE_HOLDS, RULE_SEEDS, TIME_WORDS, type PlaceEvent } from "@paperplay/contracts";
import { buildWorld, claimHolds, SAMPLE_STEPS, sampleCount, summarise, type BuiltLevel, type BuiltWorld } from "@paperplay/pipeline";
import { mulberry32, registry, type Primitive } from "@paperplay/primitives";
import { accuracyReport, type CompartmentModel } from "@paperplay/primitives/compartments";
import { flockDefaultParams, flockPlanarWeighted as flock, type FlockParams } from "@paperplay/primitives/flock";

export const SKIES: readonly number[] = Array.from({ length: RULE_SEEDS }, (_, index) => index + 1);
export const FIXTURES = join(import.meta.dirname, "..", "..", "fixtures", "worldspecs");
export const FIXTURE = join(FIXTURES, "flocking-reference.json");
/** A deterministic model's neighbourhood: each parameter within this fraction of the world's value (ADR-0024). */
export const NEIGHBOURHOOD = 0.1;

export function referenceWorld(fixture: string = FIXTURE): BuiltWorld {
  const built = buildWorld(JSON.parse(readFileSync(fixture, "utf8")), registry);
  if (!built.ok) throw new Error(`the world in ${fixture} does not build: ${JSON.stringify(built.problems)}`);
  return built.world;
}

/** One start of the level rule: its number, its seed, and the factor each parameter is scaled by, none for the world's own values. */
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

export function sweepLevels(world: BuiltWorld = referenceWorld(), starts: readonly Start[] = startsOf(world)): LevelResult[] {
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

/** Level 4's candidate (b): with the old rock in the path, the flock rejoins with cohesion and stays apart without. */
export interface RejoinResult {
  readonly seed: number;
  readonly withCohesion: number;
  readonly withoutCohesion: number;
  readonly holds: boolean;
}

export const REJOIN = { rock: { x: 15, y: 8.5 }, seconds: 60 } as const;

export function rejoinCandidate(skies: readonly number[] = SKIES): RejoinResult[] {
  const rock: PlaceEvent = { kind: "place", step: 0, entityId: "rock-in-path", entity: "obstacle", ...REJOIN.rock };
  const groupsAtEnd = (params: FlockParams, seed: number): number => {
    let state = flock.apply(flock.init(params, seed), rock);
    for (let step = 0; step < Math.round(REJOIN.seconds / flock.fixedTimestep); step++) state = flock.step(state, params, flock.fixedTimestep);
    return flock.measure(state).clusterCount;
  };
  return skies.map((seed) => {
    const withCohesion = groupsAtEnd(flockDefaultParams, seed);
    const withoutCohesion = groupsAtEnd({ ...flockDefaultParams, cohesionWeight: 0 }, seed);
    return { seed, withCohesion, withoutCohesion, holds: withCohesion === 1 && withoutCohesion >= 2 };
  });
}

const number = (value: number, digits = 2): string => (Number.isFinite(value) ? value.toFixed(digits) : "never");

function claimInWords(level: LevelResult): string {
  const { claim } = level;
  const direction = claim.relation === "higher" ? "higher" : "lower";
  const margin = claim.by > 0 ? ` by more than ${claim.by}` : "";
  const ratio = claim.kind === "each" && claim.times !== undefined ? `, and more than ${claim.times} times as ${claim.relation === "higher" ? "much" : "little"}` : "";
  return claim.kind === "each"
    ? `the other world ${direction}${margin}${ratio}, on at least ${RULE_HOLDS} of ${RULE_SEEDS} skies`
    : `the other world ${direction}${margin} on exactly ${claim.holds} of ${RULE_SEEDS} skies, stated as a count`;
}

export function toMarkdown(levels: readonly LevelResult[], rejoin: readonly RejoinResult[], meta: { readonly primitive: string; readonly runtime: string; readonly status: string }): string {
  const lines = [
    "# The levels sweep",
    "",
    "Generated by `npm run sweep:levels` (scripts/sweep/levels.ts). Do not edit by hand;",
    "`scripts/test/levels.test.ts` fails if this file drifts from a fresh run.",
    "",
    `Primitive: ${meta.primitive}. Runtime: ${meta.runtime}. WorldSpec: fixtures/worldspecs/flocking-reference.json, ${meta.status}. ADR-0018.`,
    "",
    "## The rule",
    "",
    `A level's stated effect must hold in its stated direction on at least ${RULE_HOLDS} of ${RULE_SEEDS} skies (seeds 1 to ${RULE_SEEDS}),`,
    "and show within the level's time: at most 80 simulated seconds, 20 s of watching at 4x. Both worlds of a",
    "fork run from the same seed, with the level's setup, sampled every 0.1 s. A level that fails is reworked or",
    "cut, never softened in wording. A count claim, allowed only where the level asks for a prediction first,",
    "states the surprise itself, and must be exactly right.",
    "",
    "## Results",
    "",
    "| Level | What if | Measured difference | Level's time | Claim | Holds | Meets the rule |",
    "|---|---|---|---|---|---|---|",
    ...levels.map(
      (level) =>
        `| ${level.order} · ${level.title} | ${level.prompt} | ${level.label} (${level.unit}) | ${level.time} s | ${claimInWords(level)} | ${level.holds} of ${RULE_SEEDS} | ${level.meets ? "yes" : "**no**"} |`,
    ),
    "",
  ];
  for (const level of levels) {
    lines.push(`## Level ${level.order} · ${level.title}`, "", `${level.prompt} The level states: “${level.effect}”`, "");
    lines.push(`| Sky | This world | Other world | Holds |`, "|---|---|---|---|");
    for (const sky of level.skies) lines.push(`| ${sky.seed} | ${number(sky.here)} | ${number(sky.there)} | ${sky.holds ? "yes" : "no"} |`);
    lines.push("");
  }
  const rejoined = rejoin.filter((row) => row.holds).length;
  lines.push(
    "## Level 4's candidate (b), not adopted",
    "",
    `Rejoining: with a rock at (${REJOIN.rock.x}, ${REJOIN.rock.y}), the flock is one group after ${REJOIN.seconds} s with cohesion, and two or more without.`,
    `It holds on ${rejoined} of ${RULE_SEEDS} skies, so it fails the rule: without cohesion the flock is one group again on ${rejoin.filter((row) => row.withoutCohesion < 2).length}.`,
    "Candidate (a), the spread of the largest group, is level 4 above.",
    "",
    "| Sky | Groups at the end, with cohesion | Without cohesion | Holds |",
    "|---|---|---|---|",
    ...rejoin.map((row) => `| ${row.seed} | ${row.withCohesion} | ${row.withoutCohesion} | ${row.holds ? "yes" : "no"} |`),
    "",
  );
  return lines.join("\n");
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

const SUPERSCRIPTS = "⁰¹²³⁴⁵⁶⁷⁸⁹";
/** Three significant figures, small numbers as a power of ten: 6.12 × 10⁻⁷. */
const significant = (value: number): string => {
  if (value === 0 || value >= 1e-3) return value.toPrecision(3);
  const [mantissa, power] = value.toExponential(2).split("e");
  return `${mantissa ?? ""} × 10${(power ?? "").replace("-", "⁻").replace(/\d/g, (digit) => SUPERSCRIPTS[Number(digit)] ?? digit)}`;
};
/** A step's multiple as people write it: 0.6, not 0.6000000000000001. */
const figure = (value: number): string => String(Number(value.toPrecision(12)));

/** The record for a world varied over its neighbourhood: its starts, its levels, and the accuracy check on every run. */
export function toNeighbourhoodMarkdown(
  world: BuiltWorld,
  fixture: string,
  levels: readonly LevelResult[],
  starts: readonly Start[],
  accuracy: readonly AccuracyResult[],
  meta: { readonly solver: string; readonly runtime: string },
): string {
  const first = world.levels[0];
  if (!first) throw new Error("the world has no levels");
  const model = first.primitive as CompartmentModel;
  const time = TIME_WORDS[world.timeUnit];
  const dt = model.fixedTimestep;
  const names = Object.keys(starts.at(-1)?.factors ?? {});
  const symbolOf = (name: string): string => model.spec.parameters.find((parameter) => parameter.id === name)?.symbol ?? name;
  const claimWords = (level: LevelResult): string => {
    const { claim } = level;
    const margin = claim.by > 0 ? ` by more than ${claim.by}` : "";
    return claim.kind === "each"
      ? `the other world ${claim.relation}${margin}, on at least ${RULE_HOLDS} of ${RULE_SEEDS} starts`
      : `the other world ${claim.relation}${margin} on exactly ${claim.holds} of ${RULE_SEEDS} starts, stated as a count`;
  };
  const lines = [
    `# The levels sweep: ${world.title}`,
    "",
    "Generated by `npm run sweep:levels` (scripts/sweep/levels.ts). Do not edit by hand;",
    "`scripts/test/levels.test.ts` fails if this file drifts from a fresh run.",
    "",
    `Solver: ${meta.solver}, RK4 at a step of ${figure(dt)} ${time.many}. Runtime: ${meta.runtime}. WorldSpec: fixtures/worldspecs/${fixture}, a ${world.status}. ADR-0018, ADR-0024, ADR-0028.`,
    "",
    "## The rule",
    "",
    `The model has no chance in it, so a level's stated effect is checked on ${RULE_SEEDS} starts: the world's own values, and ${RULE_SEEDS - 1}`,
    `others with each parameter within a tenth of its value. It must hold in its stated direction on at least ${RULE_HOLDS} of the ${RULE_SEEDS},`,
    "and show within 20 s of watching at 4x. Both worlds of a fork run from the same start, and the What-if sets its",
    `variables to their stated values in each. Both are sampled every ${figure(SAMPLE_STEPS * dt)} ${time.many}. A level that fails is reworked or cut, never`,
    "softened in wording. A count claim, which states the surprise itself, must be exactly right.",
    "",
    "## The starts",
    "",
    `Each parameter's value at each start, as a factor of the world's own: start k's factors are drawn from mulberry32(k), in the`,
    "parameters' alphabetical order, each between 0.9 and 1.1.",
    "",
    `| Start | ${names.map((name) => `${name} (${symbolOf(name)})`).join(" | ")} |`,
    `|---|${names.map(() => "---|").join("")}`,
    ...starts.map((start) => `| ${start.start} | ${names.map((name) => (start.factors[name] ?? 1).toFixed(4)).join(" | ")} |`),
    "",
    "## Results",
    "",
    "| Level | What if | Measured difference | Level's time | Claim | Holds | Meets the rule |",
    "|---|---|---|---|---|---|---|",
    ...levels.map(
      (level) =>
        `| ${level.order} · ${level.title} | ${level.prompt} | ${level.label} (${level.unit}) | ${level.time} ${time.many} | ${claimWords(level)} | ${level.holds} of ${RULE_SEEDS} | ${level.meets ? "yes" : "**no**"} |`,
    ),
    "",
    "## The accuracy check",
    "",
    `Every run above is solved again at half the step, ${figure(dt / 2)} ${time.many}, and a compartment may move by at most ${significant(model.spec.solver.tolerance)} of its`,
    `largest value. Each level's row gives the most any compartment moved, over both worlds at all ${RULE_SEEDS} starts, as a share`,
    "of what the check allows it: below 1 passes. A model that failed would be refused, never drawn.",
    "",
    "| Level | Most moved | Allowed there | Share of the allowance | Where | Passes |",
    "|---|---|---|---|---|---|",
    ...accuracy.map((row) => `| ${row.order} · ${row.title} | ${significant(row.deviation)} | ${significant(row.allowance)} | ${significant(row.ratio)} | ${row.where} | ${row.ratio <= 1 ? "yes" : "**no**"} |`),
    "",
  ];
  for (const level of levels) {
    lines.push(`## Level ${level.order} · ${level.title}`, "", `${level.prompt} The level states: “${level.effect}”`, "");
    lines.push(`| Start | This world | Other world | Holds |`, "|---|---|---|---|");
    for (const sky of level.skies) lines.push(`| ${sky.seed} | ${number(sky.here)} | ${number(sky.there)} | ${sky.holds ? "yes" : "no"} |`);
    lines.push("");
  }
  return lines.join("\n");
}
