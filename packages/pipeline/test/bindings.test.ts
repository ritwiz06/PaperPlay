import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { RunEvent } from "@paperplay/contracts";
import { registry, runEvents } from "@paperplay/primitives";
import { flockPlanarWeighted as flock, type FlockParams, type FlockState } from "@paperplay/primitives/flock";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildWorld, type BuiltLevel } from "../src/index.ts";

// The binding fixtures are written by hand (fixtures/bindings/), never from the builder. Each
// level's control is set through the built world and run in the engine; the result must equal
// the primitive stepped directly with the fixture's parameter, so the test reads the engine
// parameter, not the slider's label (R08).

const root = (path: string): string => fileURLToPath(new URL(`../../../${path}`, import.meta.url));

const Fixture = z.strictObject({
  about: z.string(),
  worldSpec: z.string(),
  primitive: z.strictObject({ id: z.string(), version: z.string() }),
  seed: z.int(),
  steps: z.int().positive(),
  levels: z.array(
    z.strictObject({
      levelId: z.string(),
      actionId: z.string(),
      variable: z.string(),
      start: z.number(),
      set: z.number(),
      fork: z.record(z.string(), z.number()),
      restarts: z.boolean(),
      setup: z.array(z.strictObject({ entityId: z.string(), entity: z.enum(["beacon", "obstacle"]), x: z.number(), y: z.number() })),
    }),
  ),
});

const fixture = Fixture.parse(JSON.parse(readFileSync(root("fixtures/bindings/flocking-reference.json"), "utf8")));
const built = buildWorld(JSON.parse(readFileSync(root(fixture.worldSpec), "utf8")), registry);
if (!built.ok) throw new Error(`the reference world does not build: ${JSON.stringify(built.problems)}`);
const { world } = built;

/** The primitive's own defaults, from its description: what a level starts from unless the fixture says otherwise. */
const defaults = Object.fromEntries(Object.entries(flock.describe().variables).map(([name, variable]) => [name, variable.defaultValue])) as FlockParams;

/** Runs a built level through the engine with the given events, as the web session and replay do. */
function runBuilt(level: BuiltLevel, events: readonly RunEvent[]): FlockState {
  const params = level.params as FlockParams;
  return runEvents(
    { primitive: flock, params, actions: level.actions },
    { initialState: flock.init(params, fixture.seed), events, totalSteps: fixture.steps, sampleInterval: 60, timestep: flock.fixedTimestep },
  ).finalState;
}

/** The same run done by hand: the primitive stepped directly with the fixture's parameters. */
function runByHand(params: FlockParams, setup: (typeof fixture.levels)[number]["setup"]): FlockState {
  let state = flock.init(params, fixture.seed);
  for (const placement of setup) state = flock.apply(state, { kind: "place", ...placement });
  for (let step = 0; step < fixture.steps; step++) state = flock.step(state, params, flock.fixedTimestep);
  return state;
}

describe("[R08] binding fixtures for the flocking world", () => {
  it("cover every level of the reference world, in order, on its primitive", () => {
    expect(fixture.levels.map((level) => level.levelId)).toEqual(world.levels.map((level) => level.id));
    for (const level of world.levels) expect(level.primitiveRef).toEqual(fixture.primitive);
  });

  for (const expected of fixture.levels) {
    describe(`level ${expected.levelId}`, () => {
      const level = (): BuiltLevel => {
        const found = world.levels.find((entry) => entry.id === expected.levelId);
        if (!found) throw new Error(`no level ${expected.levelId}`);
        return found;
      };

      it(`binds ${expected.actionId} to ${expected.variable}, starting at ${expected.start}`, () => {
        expect(level().action.actionId).toBe(expected.actionId);
        expect(level().actions).toEqual({ [expected.actionId]: expected.variable });
        expect(level().params).toEqual({ ...defaults, [expected.variable]: expected.start });
      });

      it(`setting it to ${expected.set} moves the engine's ${expected.variable}, and nothing else`, () => {
        const setup = level().setup.map((placement) => placement.event);
        const moved = runBuilt(level(), [...setup, { kind: "param", step: 0, actionId: expected.actionId, value: expected.set }]);
        expect(moved).toEqual(runByHand({ ...defaults, [expected.variable]: expected.set }, expected.setup));
        // And the variable matters within the run, so the comparison above has teeth.
        expect(runBuilt(level(), setup)).not.toEqual(moved);
      });

      it(`places its setup at step 0 as ordinary place events`, () => {
        expect(level().setup.map((placement) => placement.event)).toEqual(expected.setup.map((placement) => ({ kind: "place", step: 0, ...placement })));
        expect(runBuilt(level(), level().setup.map((placement) => placement.event))).toEqual(runByHand({ ...defaults, [expected.variable]: expected.start }, expected.setup));
      });

      it(`forks with ${JSON.stringify(expected.fork)}, and ${expected.restarts ? "restarts both worlds" : "keeps both worlds running"}`, () => {
        expect(level().fork.params).toEqual({ ...defaults, [expected.variable]: expected.start, ...expected.fork });
        expect(level().fork.restarts).toBe(expected.restarts);
      });
    });
  }
});
