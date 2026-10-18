import { claimHolds, SAMPLE_STEPS, summarise, type BuiltLevel } from "@paperplay/pipeline";
import type { LandscapeModel } from "@paperplay/primitives/learning";
import { DEFAULT_CAMERA } from "@paperplay/ui/stage-core";
import { describeLandscape, landscapeDay } from "@paperplay/ui/stage-core/landscape";
import { describe, expect, it } from "vitest";
import { openFork } from "../src/world/fork.ts";
import { bothBalls, createLandscapeSession, type SessionOptions } from "../src/world/landscape.ts";
import { MOMENTUM_PLAY, MOMENTUM_WORLD } from "../src/worlds/momentum.tsx";

// The momentum world (ADR-0047): the learning family's reference, played by the app's own session
// and fork, drawn by the landscape kit. The fork measures what the rule run on its own measures; the
// ball is the primitive's own position, so drawing it changes no measurement (R02); and a fork's
// panes each draw both worlds' balls on the one surface.

const LEVELS = MOMENTUM_WORLD.levels;
const modelOf = (level: BuiltLevel): LandscapeModel => level.primitive as unknown as LandscapeModel;
const optionsFor = (level: BuiltLevel): SessionOptions => MOMENTUM_PLAY.options(level, false) as SessionOptions;

/** The level's measured difference for one world, run straight from the rule, sampled as the levels sweep samples it. */
function independently(entry: BuiltLevel, params: Readonly<Record<string, number>>): number {
  const model = modelOf(entry);
  const { difference } = entry.fork;
  let state = model.init(params, MOMENTUM_WORLD.openingSeed);
  const samples = [model.measure(state)[difference.metricId as "loss"]];
  const steps = Math.round(difference.time / model.fixedTimestep);
  for (let step = 1; step <= steps; step++) {
    state = model.step(state, params, model.fixedTimestep);
    if (step % SAMPLE_STEPS === 0) samples.push(model.measure(state)[difference.metricId as "loss"]);
  }
  return summarise(difference, samples, model.fixedTimestep);
}

describe("the momentum world in the app's own session and fork", () => {
  it("[R08] builds five levels on one rule and one surface, learning.landscape, drawn in the landscape kit", () => {
    expect(LEVELS.map((entry) => entry.id)).toEqual(["hook", "background", "idea", "evaluation", "result"]);
    expect(MOMENTUM_WORLD.kit.id).toBe("landscape");
    expect(MOMENTUM_WORLD.family.id).toBe("learning");
    expect(MOMENTUM_WORLD.timeUnit).toBe("step");
    for (const entry of LEVELS) expect(JSON.stringify(modelOf(entry).spec)).toBe(JSON.stringify(modelOf(LEVELS[0] as BuiltLevel).spec));
  });

  for (const entry of LEVELS) {
    it(`[R06] level ${entry.order}'s fork starts both runs from step 0 and measures what the rule run on its own measures`, () => {
      const session = createLandscapeSession(modelOf(entry), optionsFor(entry));
      session.stepBy(40);
      const fork = openFork(entry, session, { playing: true });
      expect(fork.snapshot().restarts).toBe(true);
      while (!fork.snapshot().done) fork.tick(0.25);
      const { summary, holds } = fork.snapshot();
      expect(summary.here).toBe(independently(entry, entry.params));
      expect(summary.there).toBe(independently(entry, entry.fork.params));
      expect(holds).toBe(claimHolds(entry.fork.difference.claim, summary.here, summary.there));
      expect(holds).toBe(true);
    });
  }

  it("[R02] never changes a measurement by drawing the landscape, its balls or their trails", () => {
    const entry = LEVELS[2] as BuiltLevel;
    const drawn = createLandscapeSession(modelOf(entry), optionsFor(entry));
    const undrawn = createLandscapeSession(modelOf(entry), optionsFor(entry));
    for (let step = 0; step < 200; step++) {
      const frame = describeLandscape(drawn.stageInput(), DEFAULT_CAMERA, landscapeDay);
      expect(frame.balls).toHaveLength(1);
      drawn.stepBy(1);
      undrawn.stepBy(1);
    }
    expect(drawn.state()).toEqual(undrawn.state());
    expect(drawn.snapshot().observed).toEqual(undrawn.snapshot().observed);
  });

  it("[R06] draws both worlds' balls in each pane of a fork, this world's always as \"here\"", () => {
    const entry = LEVELS[0] as BuiltLevel;
    const session = createLandscapeSession(modelOf(entry), optionsFor(entry));
    const fork = openFork(entry, session, { playing: false });
    fork.here.stepBy(12);
    fork.there.stepBy(12);
    const here = bothBalls(fork.here.stageInput(), fork.there.stageInput(), "here");
    const there = bothBalls(fork.there.stageInput(), fork.here.stageInput(), "there");
    expect(here.balls.map((ball) => ball.role)).toEqual(["here", "there"]);
    expect(there.balls).toEqual(here.balls);
    expect(here.balls[0]?.current).toEqual([fork.here.state().x.theta, fork.here.state().y.theta]);
  });
});
