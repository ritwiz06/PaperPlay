/**
 * The levels sweep (ADR-0018): every level's stated effect, checked on skies 1 to 20 before
 * it stands in a fixture. Pure and deterministic. For each level and sky, both worlds of its
 * fork run from the same seed, with the level's setup, for the level's time; each is summarised
 * as its measured difference says, and the claim is checked. A level meets the rule when an
 * "each" claim holds on at least 16 of 20 skies, or a "count" claim's count is exactly right.
 *
 * It also re-measures level 4's rejected candidate (b), so that decision can be reproduced.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RULE_HOLDS, RULE_SEEDS, type PlaceEvent } from "@paperplay/contracts";
import { buildWorld, claimHolds, SAMPLE_STEPS, sampleCount, summarise, type BuiltLevel, type BuiltWorld } from "@paperplay/pipeline";
import { registry } from "@paperplay/primitives";
import { flockDefaultParams, flockPlanarWeighted as flock, type FlockObservables, type FlockParams } from "@paperplay/primitives/flock";

export const SKIES: readonly number[] = Array.from({ length: RULE_SEEDS }, (_, index) => index + 1);
export const FIXTURE = join(import.meta.dirname, "..", "..", "fixtures", "worldspecs", "flocking-reference.json");

export function referenceWorld(): BuiltWorld {
  const built = buildWorld(JSON.parse(readFileSync(FIXTURE, "utf8")), registry);
  if (!built.ok) throw new Error(`the reference world does not build: ${JSON.stringify(built.problems)}`);
  return built.world;
}

/** One world, sampled every SAMPLE_STEPS steps from step 0, with every observable at each sample. */
function sampled(params: FlockParams, setup: readonly PlaceEvent[], seed: number, seconds: number): FlockObservables[] {
  let state = flock.init(params, seed);
  for (const event of setup) state = flock.apply(state, event);
  const samples = [flock.measure(state)];
  const count = sampleCount(seconds, flock.fixedTimestep);
  for (let sample = 1; sample < count; sample++) {
    for (let step = 0; step < SAMPLE_STEPS; step++) state = flock.step(state, params, flock.fixedTimestep);
    samples.push(flock.measure(state));
  }
  return samples;
}

/** Runs each distinct world once per sky, to the longest time any level asks of it. */
function worldCache() {
  const runs = new Map<string, FlockObservables[]>();
  return (params: FlockParams, setup: readonly PlaceEvent[], seed: number, seconds: number): FlockObservables[] => {
    const key = JSON.stringify([params, setup, seed]);
    const known = runs.get(key);
    const needed = sampleCount(seconds, flock.fixedTimestep);
    if (known && known.length >= needed) return known.slice(0, needed);
    const fresh = sampled(params, setup, seed, seconds);
    runs.set(key, fresh);
    return fresh;
  };
}

export interface SkyResult {
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
  readonly seconds: number;
  readonly skies: readonly SkyResult[];
  readonly holds: number;
  readonly meets: boolean;
}

export function sweepLevels(world: BuiltWorld = referenceWorld(), skies: readonly number[] = SKIES): LevelResult[] {
  const run = worldCache();
  // The longest each world is needed, so a shared world is run once, to that time.
  const longest = new Map<string, number>();
  const note = (params: Readonly<Record<string, number>>, setup: readonly PlaceEvent[], seconds: number) => {
    const key = JSON.stringify([params, setup]);
    longest.set(key, Math.max(longest.get(key) ?? 0, seconds));
  };
  for (const level of world.levels) {
    const setup = level.setup.map((placement) => placement.event);
    note(level.params, setup, level.fork.difference.seconds);
    note(level.fork.params, setup, level.fork.difference.seconds);
  }
  const series = (params: Readonly<Record<string, number>>, setup: readonly PlaceEvent[], seed: number, seconds: number, metric: string): number[] => {
    const all = run(params as FlockParams, setup, seed, longest.get(JSON.stringify([params, setup])) ?? seconds);
    return all.slice(0, sampleCount(seconds, flock.fixedTimestep)).map((observed) => observed[metric as keyof FlockObservables]);
  };

  return world.levels.map((level) => {
    const { difference } = level.fork;
    const setup = level.setup.map((placement) => placement.event);
    const results = skies.map((seed) => {
      const here = summarise(difference, series(level.params, setup, seed, difference.seconds, difference.metricId), flock.fixedTimestep);
      const there = summarise(difference, series(level.fork.params, setup, seed, difference.seconds, difference.metricId), flock.fixedTimestep);
      return { seed, here, there, holds: claimHolds(difference.claim, here, there) };
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
      seconds: difference.seconds,
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
        `| ${level.order} · ${level.title} | ${level.prompt} | ${level.label} (${level.unit}) | ${level.seconds} s | ${claimInWords(level)} | ${level.holds} of ${RULE_SEEDS} | ${level.meets ? "yes" : "**no**"} |`,
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
