import { claimHolds, SAMPLE_STEPS, summarise, type BuiltLevel } from "@paperplay/pipeline";
import type { CompartmentModel } from "@paperplay/primitives/compartments";
import { DEFAULT_CAMERA } from "@paperplay/ui/stage-core";
import { describeTown, townDay } from "@paperplay/ui/stage-core/town";
import { describe, expect, it } from "vitest";
import { openFork } from "../src/world/fork.ts";
import { sampleIntervalOf } from "../src/world/session.ts";
import { createTownSession, sharesOf } from "../src/world/town.ts";
import { THRESHOLD_TOWN, townOptionsFor } from "../src/worlds/epidemic.tsx";

// Threshold Town (ADR-0029): Kermack and McKendrick's special case, played by the app's own
// session and fork, drawn by the town kit. The fork measures what an independent run of the
// model measures; the town's figures are a picture of the solver's shares, so drawing them
// changes no measurement (R02); and the clock shows the model's days at the world's pace.

const LEVELS = THRESHOLD_TOWN.levels;
const modelOf = (level: BuiltLevel): CompartmentModel => level.primitive as CompartmentModel;
const level = (id: string): BuiltLevel => {
  const found = LEVELS.find((entry) => entry.id === id);
  if (!found) throw new Error(`no level ${id}`);
  return found;
};

/** The level's measured difference for one world, run straight from the model, sampled as the levels sweep samples it. */
function independently(entry: BuiltLevel, params: Readonly<Record<string, number>>): number {
  const model = modelOf(entry);
  const { difference } = entry.fork;
  let state = model.init(params, THRESHOLD_TOWN.openingSeed);
  const samples = [model.measure(state)[difference.metricId] ?? Number.NaN];
  const steps = Math.round(difference.time / model.fixedTimestep);
  for (let step = 1; step <= steps; step++) {
    state = model.step(state, params, model.fixedTimestep);
    if (step % SAMPLE_STEPS === 0) samples.push(model.measure(state)[difference.metricId] ?? Number.NaN);
  }
  return summarise(difference, samples, model.fixedTimestep);
}

describe("Threshold Town in the app's own session and fork", () => {
  it("[R08] builds five levels on one model, compartments.ode bound to Kermack and McKendrick's special case, drawn in the town", () => {
    expect(LEVELS.map((entry) => entry.id)).toEqual(["hook", "background", "idea", "evaluation", "result"]);
    expect(THRESHOLD_TOWN.kit.id).toBe("town");
    expect(THRESHOLD_TOWN.family.id).toBe("compartments");
    expect(THRESHOLD_TOWN.status).toBe("draft");
    for (const entry of LEVELS) expect(JSON.stringify(modelOf(entry).spec)).toBe(JSON.stringify(modelOf(LEVELS[0] as BuiltLevel).spec));
  });

  for (const entry of LEVELS) {
    it(`[R06] level ${entry.order}'s fork starts both towns from day 0 and measures what the model run on its own measures`, () => {
      const session = createTownSession(modelOf(entry), townOptionsFor(entry, false));
      // Whenever the fork is opened, both worlds tell the epidemic from its start.
      session.stepBy(400);
      const fork = openFork(entry, session, { playing: true });
      expect(fork.snapshot().restarts).toBe(true);
      while (!fork.snapshot().done) fork.tick(0.25);
      const { summary, holds } = fork.snapshot();
      expect(summary.here).toBe(independently(entry, entry.params));
      expect(summary.there).toBe(independently(entry, entry.fork.params));
      expect(holds).toBe(claimHolds(entry.fork.difference.claim, summary.here, summary.there));
      // The world's own values are the level rule's first start: an "each" claim holds there, a count of none does not.
      expect(holds).toBe(entry.fork.difference.claim.kind === "each");
    });
  }

  it("[R02] never changes a measurement by drawing the town", () => {
    const entry = level("hook");
    const drawn = createTownSession(modelOf(entry), townOptionsFor(entry, false));
    const undrawn = createTownSession(modelOf(entry), townOptionsFor(entry, false));
    for (let step = 0; step < 600; step++) {
      const frame = describeTown(drawn.stageInput(), DEFAULT_CAMERA, townDay);
      expect(frame.figures).toHaveLength(120);
      drawn.stepBy(1);
      undrawn.stepBy(1);
    }
    expect(drawn.state()).toEqual(undrawn.state());
    expect(drawn.snapshot().observed).toEqual(undrawn.snapshot().observed);
  });

  it("[R02] shows the solver's own compartments as shares of the whole, which add up to 1", () => {
    const entry = level("hook");
    const session = createTownSession(modelOf(entry), townOptionsFor(entry, false));
    session.stepBy(300);
    const state = session.state();
    const shares = session.snapshot().shares;
    const total = Object.values(state.compartments).reduce((sum, value) => sum + value, 0);
    expect(shares.map((share) => share.name)).toEqual(["Still well", "Ill", "Removed"]);
    expect(shares.map((share) => share.share)).toEqual(sharesOf(modelOf(entry), state));
    expect(shares[1]?.share).toBe((state.compartments.y ?? Number.NaN) / total);
    expect(shares.reduce((sum, share) => sum + share.share, 0)).toBeCloseTo(1, 12);
  });

  it("[R06] plays the model's days at the world's pace: four days a second at 1x, a step a fortieth of a second", () => {
    const entry = level("hook");
    expect(THRESHOLD_TOWN.perWatchSecond).toBe(4);
    const session = createTownSession(modelOf(entry), townOptionsFor(entry, true));
    expect(session.tick(0.1)).toBe(4);
    session.setSpeed(4);
    expect(session.tick(0.1)).toBe(16);
    expect(session.snapshot().time).toBeCloseTo(2, 12);
    // A run record samples once a second of watching at 1x: every 40 steps, four days.
    expect(sampleIntervalOf(modelOf(entry))).toBe(40);
  });

  it("[R06] starts again from day 0 with the control where the learner left it, as a new run", () => {
    const entry = level("hook");
    const session = createTownSession(modelOf(entry), townOptionsFor(entry, false));
    session.stepBy(500);
    session.setAction(entry.action.actionId, 0.0006);
    session.predict(entry.id, "a prompt", 0, "a choice");
    session.stepBy(100);
    session.startAgain();
    const snapshot = session.snapshot();
    expect(snapshot.step).toBe(0);
    expect(snapshot.params[entry.action.variable]).toBe(0.0006);
    expect(snapshot.events).toEqual([]);
    expect(snapshot.predictions).toEqual([]);
    expect(snapshot.observed.ill).toBe(5);
  });
});
