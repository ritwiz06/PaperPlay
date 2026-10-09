import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SAMPLE_STEPS, summarise } from "@paperplay/pipeline";
import { flockPlanarWeighted as flock, type FlockObservables, type FlockParams } from "@paperplay/primitives";
import { describe, expect, it } from "vitest";
import { FLOCKING, sessionOptionsFor } from "../src/world/authored-world.ts";
import { forkParams, openFork } from "../src/world/fork.ts";
import { HOOK_SEED } from "../src/world/local-world.ts";
import { createWorldSession } from "../src/world/session.ts";

const record = readFileSync(fileURLToPath(new URL("../../../eval/sweeps/levels.md", import.meta.url)), "utf8");
/** Seed 5's row in a level's table of eval/sweeps/levels.md: this world, the other, holds. */
function recorded(title: string): [string, string, string] {
  const table = record.slice(record.indexOf(`## Level ${title}`));
  const row = /\n\| 5 \| ([^|]+) \| ([^|]+) \| (yes|no) \|/.exec(table);
  if (!row?.[1] || !row[2] || !row[3]) throw new Error(`no seed 5 row for ${title}`);
  return [row[1].trim(), row[2].trim(), row[3]];
}
const shown = (value: number): string => (Number.isFinite(value) ? value.toFixed(2) : "never");

/** Runs a fork to the end of the level's time with large frames. */
function runOut(fork: ReturnType<typeof openFork>): void {
  fork.play();
  for (let frame = 0; frame < 100_000 && !fork.snapshot().done; frame++) {
    fork.tick(0.2);
    expect(fork.here.state().stepIndex).toBe(fork.there.state().stepIndex);
  }
}

describe("[R06] the fork", () => {
  for (const level of FLOCKING.levels) {
    it(`level ${level.order}: opened at the start of seed ${HOOK_SEED}, it measures what the levels sweep recorded for that sky`, () => {
      const trunk = createWorldSession(sessionOptionsFor(level, false));
      const fork = openFork(level, trunk, { playing: false });
      runOut(fork);
      const end = fork.snapshot();
      expect(end.steps).toBe(Math.round(level.fork.difference.seconds / flock.fixedTimestep));
      expect(end.playing).toBe(false);

      // The same two worlds, stepped directly from the primitive, sampled every 6 steps.
      const params = forkParams(level, level.params as FlockParams);
      const series = (p: FlockParams): number[] => {
        let state = flock.init(p, HOOK_SEED);
        for (const placement of level.setup) state = flock.apply(state, placement.event);
        const metric = level.fork.difference.metricId as keyof FlockObservables;
        const values = [flock.measure(state)[metric]];
        for (let step = 1; step <= end.totalSteps; step++) {
          state = flock.step(state, p, flock.fixedTimestep);
          if (step % SAMPLE_STEPS === 0) values.push(flock.measure(state)[metric]);
        }
        return values;
      };
      const here = summarise(level.fork.difference, series(params.here), flock.fixedTimestep);
      const there = summarise(level.fork.difference, series(params.there), flock.fixedTimestep);
      expect(end.summary).toEqual({ here, there });
      expect([shown(end.summary.here), shown(end.summary.there), end.holds ? "yes" : "no"]).toEqual(recorded(`${level.order} · ${level.title}`));
    });
  }

  it("branches both worlds from the moment it opens when the What-if changes only live variables", () => {
    const level = FLOCKING.levels[0];
    if (!level) throw new Error("no hook");
    const trunk = createWorldSession(sessionOptionsFor(level, false));
    trunk.stepBy(240);
    const fork = openFork(level, trunk, { playing: true });
    expect(fork.snapshot().restarts).toBe(false);
    expect(fork.here.state()).toBe(trunk.state());
    expect(fork.there.state()).toBe(trunk.state());
    expect(fork.there.snapshot().params.alignmentWeight).toBe(0);
  });

  it("restarts both worlds from the seed, with the setup, when the What-if changes a start-up variable", () => {
    const level = FLOCKING.levels.find((entry) => entry.fork.restarts);
    if (!level) throw new Error("no restarting level");
    const trunk = createWorldSession(sessionOptionsFor(level, false));
    trunk.stepBy(240);
    const fork = openFork(level, trunk, { playing: true });
    expect(fork.snapshot().restarts).toBe(true);
    expect([fork.here.state().stepIndex, fork.there.state().stepIndex]).toEqual([0, 0]);
    expect([fork.here.state().width, fork.there.state().width]).toEqual([32, 64]);
  });

  it("keeps the learner's own setting in both worlds, and applies the What-if on top", () => {
    const level = FLOCKING.levels.find((entry) => entry.id === "evaluation");
    if (!level) throw new Error("no evaluation level");
    const trunk = createWorldSession(sessionOptionsFor(level, false));
    trunk.setAction(level.action.actionId, 5.5);
    const fork = openFork(level, trunk, { playing: false });
    expect(fork.here.snapshot().params.obstacleRadius).toBe(5.5);
    expect(fork.there.snapshot().params).toMatchObject({ obstacleRadius: 5.5, obstacleWeight: 0 });
  });

  it("stops at the level's time, and plays no further", () => {
    const level = FLOCKING.levels[0];
    if (!level) throw new Error("no hook");
    const fork = openFork(level, createWorldSession(sessionOptionsFor(level, false)), { playing: false });
    expect(fork.tick(1)).toBe(0);
    runOut(fork);
    fork.play();
    expect(fork.tick(1)).toBe(0);
    expect(fork.snapshot().samples.here).toHaveLength(Math.round(level.fork.difference.seconds / 0.1) + 1);
  });
});
