import { expect, test, type Page } from "@playwright/test";
import type { RunEvent } from "@paperplay/contracts";
import { flockDefaultParams, flockNeighbours, flockPlanarWeighted as flock, runEvents, type FlockParams } from "@paperplay/primitives";
import { HOOK_SEED, LOCAL_ACTIONS } from "../../apps/web/src/world/local-world.ts";

// The local world, driven as a learner would. Each test emulates reduced motion, so the world
// opens still and moves only when Play is pressed. Readouts carry their full-precision value in
// data-value, and every expected number is computed here in Node from the same primitive.

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function openWorld(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/world/local");
  await expect.poll(async () => Number((await page.getByRole("application", { name: "World stage" }).getAttribute("data-frames")) ?? 0)).toBeGreaterThan(0);
}

const world = (page: Page) => page.locator("[data-seed]");
const attribute = async (page: Page, name: string) => Number(await world(page).getAttribute(`data-${name}`));
const observed = async (page: Page, observable: string) => Number(await page.locator(`[data-observable="${observable}"]`).getAttribute("data-value"));

/** Plays until at least `steps` steps have run, then pauses and returns the step it stopped at. */
async function playAtLeast(page: Page, steps: number): Promise<number> {
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => attribute(page, "step"), { timeout: 20_000 }).toBeGreaterThanOrEqual(steps);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(world(page)).toHaveAttribute("data-playing", "false");
  return attribute(page, "step");
}

/** What the primitive measures after `steps` steps from `seed` with these events, run here in Node. */
function expected(seed: number, steps: number, events: RunEvent[], params: FlockParams = flockDefaultParams) {
  const { finalState } = runEvents(
    { primitive: flock, params, actions: LOCAL_ACTIONS },
    { initialState: flock.init(params, seed), events, totalSteps: steps, sampleInterval: Math.max(steps, 1), timestep: flock.fixedTimestep },
  );
  return { state: finalState, observed: flock.measure(finalState) };
}

const alignmentToFour: RunEvent = { kind: "param", step: 0, actionId: "alignment-strength", value: 4 };

test("[R04] /world/local opens still on the hook seed, with measured readouts and the origin legend", async ({ page }) => {
  const errors = collectErrors(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page).toHaveURL(/\/world\/local$/);
  await openWorld(page);

  expect([await attribute(page, "seed"), await attribute(page, "step"), await attribute(page, "events")]).toEqual([HOOK_SEED, 0, 0]);
  await expect(world(page)).toHaveAttribute("data-playing", "false");
  const start = expected(HOOK_SEED, 0, []).observed;
  expect(await observed(page, "directionalAgreement")).toBe(start.directionalAgreement);
  expect(await observed(page, "clusterCount")).toBe(start.clusterCount);
  expect(await observed(page, "meanNeighbourDistance")).toBe(start.meanNeighbourDistance);

  const legend = page.getByRole("list", { name: "Where each statement comes from" });
  for (const origin of ["Paper-derived", "Teaching choice", "Computed observation", "Generated inference"]) {
    await expect(legend.getByText(origin, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("region", { name: "Measured live state" }).getByText("Computed observation")).toBeVisible();
  await expect(page.getByRole("slider", { name: "Move together" })).toHaveValue("2");
  expect(errors).toEqual([]);
});

test("[R04] the alignment control moves the engine parameter and the agreement readout", async ({ page }) => {
  const errors = collectErrors(page);
  await openWorld(page);

  const slider = page.getByRole("slider", { name: "Move together" });
  await slider.focus();
  await page.keyboard.press("End");
  await expect(slider).toHaveValue("4");
  expect(await attribute(page, "events")).toBe(1);

  const steps = await playAtLeast(page, 90);
  const agreement = await observed(page, "directionalAgreement");
  // The run in the browser is the run with alignment 4 from step 0, bit for bit, and not the default run.
  expect(agreement).toBe(expected(HOOK_SEED, steps, [alignmentToFour]).observed.directionalAgreement);
  expect(agreement).not.toBe(expected(HOOK_SEED, steps, []).observed.directionalAgreement);
  expect(errors).toEqual([]);
});

test("[R04] beacons and obstacles are placed on the field by pointer and by keyboard, and removed", async ({ page }) => {
  const errors = collectErrors(page);
  await openWorld(page);
  const placed = page.getByRole("list", { name: "Placed in this world" });

  await page.getByRole("button", { name: "Place a beacon" }).click();
  const stage = page.getByRole("application", { name: "World stage" });
  const box = await stage.boundingBox();
  if (!box) throw new Error("the stage has no size");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(placed.getByText(/^Beacon 1 at/)).toBeVisible();

  await page.getByRole("button", { name: "Place an obstacle" }).click();
  await stage.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(placed.getByText(/^Obstacle 1 at/)).toBeVisible();
  expect(await attribute(page, "events")).toBe(2);

  await placed.getByRole("button", { name: "Remove beacon 1" }).click();
  await expect(placed.getByText(/^Beacon 1 at/)).toHaveCount(0);
  expect(await attribute(page, "events")).toBe(3);
  expect(errors).toEqual([]);
});

test("[R04] picking a bird shows the birds it sees, exactly as the primitive counts them", async ({ page }) => {
  const errors = collectErrors(page);
  await openWorld(page);

  await page.getByRole("button", { name: "Pick a bird" }).click();
  await page.getByRole("application", { name: "World stage" }).focus();
  await page.keyboard.press("Enter");
  const bird = page.locator("[data-bird]");
  await expect(bird).toBeVisible();
  const index = Number(await bird.getAttribute("data-bird"));
  const neighbourhood = flockNeighbours(expected(HOOK_SEED, 0, []).state, flockDefaultParams, index);
  expect(Number(await bird.getAttribute("data-seen"))).toBe(neighbourhood.seen.length);
  expect(Number(await bird.getAttribute("data-crowding"))).toBe(neighbourhood.crowding.length);
  const seen = neighbourhood.seen.length;
  await expect(bird).toContainText(`sees ${seen} ${seen === 1 ? "bird" : "birds"} within`);
  expect(errors).toEqual([]);
});

test("[R04] replay same seed repeats the recorded run, and next seed starts afresh", async ({ page }) => {
  const errors = collectErrors(page);
  await openWorld(page);
  const slider = page.getByRole("slider", { name: "Move together" });
  await slider.focus();
  await page.keyboard.press("End");
  await playAtLeast(page, 60);

  await page.getByRole("button", { name: "Replay same seed" }).click();
  expect([await attribute(page, "seed"), await attribute(page, "step"), await attribute(page, "events")]).toEqual([HOOK_SEED, 0, 1]);
  const steps = await playAtLeast(page, 30);
  expect(await observed(page, "directionalAgreement")).toBe(expected(HOOK_SEED, steps, [alignmentToFour]).observed.directionalAgreement);

  await page.getByRole("button", { name: "Next seed" }).click();
  expect([await attribute(page, "seed"), await attribute(page, "step"), await attribute(page, "events")]).toEqual([HOOK_SEED + 1, 0, 0]);
  await expect(slider).toHaveValue("4");
  const fresh = expected(HOOK_SEED + 1, 0, [], { ...flockDefaultParams, alignmentWeight: 4 }).observed;
  expect(await observed(page, "directionalAgreement")).toBe(fresh.directionalAgreement);
  expect(errors).toEqual([]);
});

test("[R02] colouring birds by heading changes how the flock looks, never what it measures", async ({ page }) => {
  const errors = collectErrors(page);
  await openWorld(page);
  const stage = page.getByRole("application", { name: "World stage" });
  await expect(stage).toHaveAttribute("data-look", "plain");

  await page.getByText("Rules of this world").click();
  await page.getByRole("checkbox", { name: "Colour birds by heading" }).check();
  await expect(stage).toHaveAttribute("data-look", "heading");
  // A display option is not an action on the run: nothing is recorded.
  expect(await attribute(page, "events")).toBe(0);

  const steps = await playAtLeast(page, 90);
  expect(await observed(page, "directionalAgreement")).toBe(expected(HOOK_SEED, steps, []).observed.directionalAgreement);
  expect(await observed(page, "clusterCount")).toBe(expected(HOOK_SEED, steps, []).observed.clusterCount);
  expect(errors).toEqual([]);
});
