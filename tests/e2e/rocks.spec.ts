import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildWorld, type BuiltLevel } from "@paperplay/pipeline";
import { flockAtRocks, flockPlanarWeighted as flock, registry, type FlockParams, type FlockState } from "@paperplay/primitives";
import { expect, test, type Page } from "@playwright/test";

// Level 5's readout (ADR-0018): the birds inside rocks, counted on the card, and the rocks that
// light up on the stage while a bird is at them. Every number and every lit rock is the
// primitive's own (E20, Q4), compared here with Node.

const built = buildWorld(JSON.parse(readFileSync(fileURLToPath(new URL("../../fixtures/worldspecs/flocking-reference.json", import.meta.url)), "utf8")), registry);
if (!built.ok) throw new Error("the reference world must build");
const LEVELS = built.world.levels;
const ROCKS = LEVELS.findIndex((level) => level.observable.metricId === "birdsAtObstacles");
const level = LEVELS[ROCKS] as BuiltLevel;
const SEED = 5;

/** The level's world in Node: the seed, its setup at step 0, then `steps` steps. */
function nodeRun(params: FlockParams, steps: number): FlockState {
  let state = flock.init(params, SEED);
  for (const placement of level.setup) state = flock.apply(state, placement.event);
  for (let step = 0; step < steps; step++) state = flock.step(state, params, flock.fixedTimestep);
  return state;
}
const litIn = (state: FlockState): string =>
  flockAtRocks(state)
    .rocks.filter((rock) => rock.birds.length > 0)
    .map((rock) => rock.id)
    .join(" ");

async function openLevel(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/world/hook");
  await expect.poll(async () => Number((await page.getByRole("application", { name: "World stage" }).getAttribute("data-frames")) ?? 0)).toBeGreaterThan(0);
  for (let at = 0; at < ROCKS; at++) {
    const current = LEVELS[at];
    const next = LEVELS[at + 1];
    if (!current || !next) throw new Error(`no level ${at + 2}`);
    await page.getByRole("slider", { name: current.action.label, exact: true }).focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("End");
    await page.locator(`.level-map li[data-level="${next.id}"] button`).click();
  }
  await expect(page.locator("main")).toHaveAttribute("data-level", level.id);
}

test.use({ viewport: { width: 1440, height: 900 } });

test("[R06] level 5's card counts the birds inside rocks and shows each rock, and the stage lights the same rocks, as the primitive reports them", async ({ page }) => {
  await openLevel(page);
  const start = nodeRun(level.params as FlockParams, 0);
  const counter = page.locator(".level-card .dial.rocks");
  await expect(counter.locator('[data-observable="birdsAtObstacles"]')).toHaveAttribute("data-value", String(flock.measure(start).birdsAtObstacles));
  const rocks = flockAtRocks(start).rocks;
  expect(rocks.length).toBe(4);
  for (const rock of rocks) await expect(counter.locator(`[data-rock="${rock.id}"]`)).toHaveAttribute("data-birds", String(rock.birds.length));
  expect(litIn(start), "a bird starts at a rock on this sky, so the check is not empty").not.toBe("");
  await expect(page.getByRole("application", { name: "World stage" })).toHaveAttribute("data-touched-rocks", litIn(start));
  await expect(counter.getByRole("img")).toHaveAccessibleName(/^Rocks counter: \d+ birds? (is|are) inside a rock; \d of 4 rocks have a bird at it$/);
});

test("[R06] in level 5's fork, the world with no rule for rocks lights the rocks its birds fly through, and this world does not", async ({ page }) => {
  // Walking to level 5 and running its fork at 4x took 16 s locally and over 30 s on CI's runner.
  test.setTimeout(90_000);
  await openLevel(page);
  // The level asks for a prediction first; the answer opens its fork.
  await page.locator(".level-whatif").getByRole("button", { name: "What if" }).click();
  await page.getByRole("button", { name: level.exploration?.choices[0] ?? "" }).click();
  const fork = page.locator(".fork");
  await fork.locator(".speed-button").click();
  await fork.locator(".speed-button").click();
  await fork.getByRole("button", { name: "Play both" }).click();
  await expect(fork.getByRole("button", { name: "Done" })).toBeDisabled({ timeout: 60_000 });
  // The fork opened at the level's start, so at its end both worlds have taken the level's time in steps.
  const steps = Math.round(level.fork.difference.seconds / flock.fixedTimestep);
  const overrides = Object.fromEntries(level.fork.overrides.map((override) => [override.variable, override.to]));
  const here = nodeRun(level.params as FlockParams, steps);
  const there = nodeRun({ ...(level.params as FlockParams), ...overrides }, steps);
  expect(litIn(there), "the other world has a bird inside a rock at the end, so the check is not empty").not.toBe("");
  await expect(page.getByRole("application", { name: "World stage, this world" })).toHaveAttribute("data-touched-rocks", litIn(here));
  await expect(page.getByRole("application", { name: "World stage, what if" })).toHaveAttribute("data-touched-rocks", litIn(there));
});
