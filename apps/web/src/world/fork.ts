/**
 * A level's fork (ADR-0008, ADR-0018): two worlds from the same moment, one with the level's
 * What-if applied, run on one clock so they stay step for step together. A What-if that changes
 * only live variables branches both worlds from the moment the fork opens; one that changes a
 * start-up variable restarts both from the seed, with the level's setup (the builder derives
 * which). Both are sampled every SAMPLE_STEPS steps, as the levels sweep samples them, up to the
 * level's time; the measured difference is summarised by the same functions.
 *
 * Framework-free, like the session, so it is tested in Node.
 */
import { claimHolds, SAMPLE_STEPS, summarise, type BuiltLevel } from "@paperplay/pipeline";
import { advance, START_CLOCK, type BaseEmphasis, type Speed, type StepClock } from "@paperplay/ui/stage-core";
import { wallStepOf, type SessionOptions, type Stepped, type WorldSession } from "./session.ts";

export interface ForkSnapshot {
  /** Steps since the fork opened, and the level's time in steps. */
  readonly steps: number;
  readonly totalSteps: number;
  readonly done: boolean;
  readonly playing: boolean;
  readonly restarts: boolean;
  /** The difference's metric, sampled every SAMPLE_STEPS steps from the fork's first step. */
  readonly samples: { readonly here: readonly number[]; readonly there: readonly number[] };
  /**
   * Each world's summary so far. NaN until an "at" summary's time comes; Infinity while a
   * threshold is not yet reached, and, once done, when it never was.
   */
  readonly summary: { readonly here: number; readonly there: number };
  /** Whether the level's stated effect holds on this sky; null until the level's time is up. */
  readonly holds: boolean | null;
}

export interface Fork<Session> {
  readonly here: Session;
  readonly there: Session;
  /** Advances both worlds by the steps this much wall time allows, at the fork's speed; returns how many. */
  tick(frameSeconds: number): number;
  /** Runs both worlds at 1x, 2x or 4x: more fixed steps per frame, the same steps. */
  setSpeed(speed: Speed): void;
  play(): void;
  pause(): void;
  snapshot(): ForkSnapshot;
  version(): number;
}

/** The fork's two worlds' parameters: the learner's current ones, and those with the What-if applied. */
export function forkParams<P>(level: BuiltLevel, current: P): { readonly here: P; readonly there: P } {
  const overrides = Object.fromEntries(level.fork.overrides.map((override) => [override.variable, override.to]));
  return { here: current, there: level.primitive.paramSchema.parse({ ...current, ...overrides }) as P };
}

export function openFork<P, S extends Stepped, O extends Record<string, number>, Extra, Emphasis extends BaseEmphasis, Input>(
  level: BuiltLevel,
  from: WorldSession<P, S, O, Extra, Emphasis, Input>,
  options: { readonly playing: boolean; readonly speed?: Speed },
): Fork<WorldSession<P, S, O, Extra, Emphasis, Input>> {
  const { difference, restarts } = level.fork;
  const TIMESTEP = level.primitive.fixedTimestep;
  const WATCHED = wallStepOf(level.primitive);
  const now = from.snapshot();
  const params = forkParams(level, now.params);
  const base: Omit<SessionOptions<P, S>, "params"> = {
    seed: now.seed,
    actions: level.actions,
    emphasise: level.observable.metricId,
    ...(restarts ? { setup: level.setup.map((placement) => placement.event) } : { start: from.state() }),
  };
  const here = from.spawn({ ...base, params: params.here });
  const there = from.spawn({ ...base, params: params.there });
  const totalSteps = Math.round(difference.time / TIMESTEP);
  const metric = difference.metricId;
  const observed = (world: WorldSession<P, S, O, Extra, Emphasis, Input>): number => world.snapshot().observed[metric] ?? Number.NaN;
  const samples = { here: [observed(here)], there: [observed(there)] };
  let steps = 0;
  let playing = options.playing;
  let speed: Speed = options.speed ?? 1;
  let clock: StepClock = START_CLOCK;
  let version = 0;

  const take = (count: number): void => {
    for (let i = 0; i < count && steps < totalSteps; i++) {
      here.stepBy(1);
      there.stepBy(1);
      steps += 1;
      if (steps % SAMPLE_STEPS === 0) {
        samples.here.push(observed(here));
        samples.there.push(observed(there));
      }
    }
    if (steps >= totalSteps) playing = false;
    version += 1;
  };

  return {
    here,
    there,
    tick(frameSeconds) {
      if (!playing || steps >= totalSteps) return 0;
      const next = advance(clock, frameSeconds, WATCHED, undefined, speed);
      clock = next.clock;
      const count = Math.min(next.steps, totalSteps - steps);
      if (count > 0) take(count);
      return count;
    },
    setSpeed(next) {
      speed = next;
      version += 1;
    },
    play() {
      if (steps < totalSteps) playing = true;
      version += 1;
    },
    pause() {
      playing = false;
      clock = START_CLOCK;
      version += 1;
    },
    snapshot() {
      const done = steps >= totalSteps;
      const summarised = (values: readonly number[]): number => {
        const { summary } = difference;
        if (summary.kind === "at" && values.length <= Math.round(summary.time / (SAMPLE_STEPS * TIMESTEP))) return Number.NaN;
        return summarise(difference, values, TIMESTEP);
      };
      const summary = { here: summarised(samples.here), there: summarised(samples.there) };
      return {
        steps,
        totalSteps,
        done,
        playing,
        restarts,
        samples: { here: [...samples.here], there: [...samples.there] },
        summary,
        holds: done ? claimHolds(difference.claim, summary.here, summary.there) : null,
      };
    },
    version: () => version,
  };
}
