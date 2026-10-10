import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildWorld, claimHolds, SAMPLE_STEPS, summarise, type BuiltLevel } from "@paperplay/pipeline";
import { registry } from "@paperplay/primitives";
import { flockPlanarWeighted as flock, type FlockObservables, type FlockParams } from "@paperplay/primitives/flock";
import { expect, test, type Page } from "@playwright/test";

// A prediction before every What-if (owner, 2026-10-09; ADR-0018): two choices, never scored.
// The guide asks before the fork opens, saves the choice in the run's record, and at the
// level's time reports what was measured on this sky, with Node's own result as the check.
// Level 2, whose claim is a count across 20 skies, has its own tests in guided.spec.ts.

const built = buildWorld(JSON.parse(readFileSync(fileURLToPath(new URL("../../fixtures/worldspecs/flocking-reference.json", import.meta.url)), "utf8")), registry);
if (!built.ok) throw new Error("the reference world must build");
const LEVELS = built.world.levels;
const SEED = 5;
const SCORING = /\b(right|wrong|correct|incorrect|score|points?)\b/i;

/** Whether the level's stated effect holds on seed 5, from the level's start, as the fork measures it. */
function holdsOnThisSky(level: BuiltLevel): boolean {
  const { difference } = level.fork;
  const steps = Math.round(difference.time / flock.fixedTimestep);
  const metric = difference.metricId as keyof FlockObservables;
  const overrides = Object.fromEntries(level.fork.overrides.map((override) => [override.variable, override.to]));
  const summary = (params: FlockParams): number => {
    let state = flock.init(params, SEED);
    for (const placement of level.setup) state = flock.apply(state, placement.event);
    const values = [flock.measure(state)[metric]];
    for (let step = 1; step <= steps; step++) {
      state = flock.step(state, params, flock.fixedTimestep);
      if (step % SAMPLE_STEPS === 0) values.push(flock.measure(state)[metric]);
    }
    return summarise(difference, values, flock.fixedTimestep);
  };
  const here = level.params as FlockParams;
  return claimHolds(difference.claim, summary(here), summary({ ...here, ...overrides }));
}

async function openAt(page: Page, index: number): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/world/hook");
  await expect.poll(async () => Number((await page.getByRole("application", { name: "World stage" }).getAttribute("data-frames")) ?? 0)).toBeGreaterThan(0);
  for (let at = 0; at < index; at++) {
    const current = LEVELS[at];
    const next = LEVELS[at + 1];
    if (!current || !next) throw new Error(`no level ${at + 2}`);
    await page.getByRole("slider", { name: current.action.label, exact: true }).focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("End");
    await page.locator(`.level-map li[data-level="${next.id}"] button`).click();
  }
  await expect(page.locator("main")).toHaveAttribute("data-level", LEVELS[index]?.id ?? "");
}

test.use({ viewport: { width: 1440, height: 900 } });

test("[R06] every level asks for a prediction before its What-if, with two choices", () => {
  for (const level of LEVELS) {
    expect(level.exploration, level.id).not.toBeNull();
    expect(level.exploration?.choices, level.id).toHaveLength(2);
  }
});

for (const [index, level] of LEVELS.entries()) {
  const exploration = level.exploration;
  if (!exploration || level.fork.difference.claim.kind !== "each") continue;
  const [first = "", second = ""] = exploration.choices;

  test(`[R06] level ${level.order} asks first, saves the prediction in the run, then reports what was measured on this sky, scoring nothing`, async ({ page }) => {
    test.setTimeout(90_000);
    await openAt(page, index);
    const speed = page.locator(".hud-buttons .speed-button");
    await speed.click();
    await speed.click();
    await page.locator(".level-whatif").getByRole("button", { name: "What if" }).click();

    // Asked before the fork opens.
    const choices = page.getByRole("group", { name: exploration.predictPrompt });
    await expect(choices.getByRole("button")).toHaveText([first, second]);
    await expect(page.locator("main")).toHaveAttribute("data-fork", "closed");
    await expect(page.locator("#what-if")).toHaveCount(0);

    // The answer opens the fork, and is saved in the run's record at this step.
    await choices.getByRole("button", { name: second }).click();
    await expect(page.locator("main")).toHaveAttribute("data-fork", "open");
    await expect(page.locator("main")).toHaveAttribute("data-predictions", `${level.id}@0:1`);
    const note = page.locator(".fork-guide");
    await expect(note).toContainText(`You predicted: ${second}.`);

    // At the level's time, what was measured: this sky, then across 20.
    await page.locator(".fork").getByRole("button", { name: "Play both" }).click();
    await expect(note).toContainText(`On this sky: ${holdsOnThisSky(level) ? first : second}.`, { timeout: 75_000 });
    await expect(note).toContainText("Across 20 skies, the level's statement holds on at least 16.");
    await expect(note).toContainText(exploration.explanation.text);
    await expect(note).toContainText(exploration.explainPrompt);
    await expect(page.locator("[data-effect]")).toContainText(level.fork.effect);
    await expect(page.locator("main")).not.toContainText(SCORING);
  });
}
