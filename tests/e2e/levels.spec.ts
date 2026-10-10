import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DepthElement, WorldSpec } from "@paperplay/contracts";
import { buildWorld } from "@paperplay/pipeline";
import { registry } from "@paperplay/primitives";
import { flockPlanarWeighted as flock, type FlockObservables, type FlockParams } from "@paperplay/primitives/flock";
import { expect, test, type Page } from "@playwright/test";
import { HOOK_SEED } from "../../apps/web/src/world/local-world.ts";

// /world/hook through all six levels of the authored WorldSpec (ADR-0016). Expectations come
// from the spec itself: titles, controls, depth variants and what-ifs. Readouts are compared
// with the primitive run in Node. Each test emulates reduced motion, so the world opens still.

const spec = WorldSpec.parse(JSON.parse(readFileSync(fileURLToPath(new URL("../../fixtures/worldspecs/flocking-reference.json", import.meta.url)), "utf8")));
const built = buildWorld(spec, registry);
if (!built.ok) throw new Error("the reference world must build");
const LEVELS = built.world.levels;
const DEPTH_LABELS = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" } as const;

test.use({ viewport: { width: 1440, height: 900 } });

const stage = (page: Page) => page.getByRole("application", { name: "World stage" });
const card = (page: Page) => page.locator(".level-card");
const mapButton = (page: Page, id: string) => page.locator(`.level-map li[data-level="${id}"] button`);

async function openHook(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/world/hook");
  await expect.poll(async () => Number((await stage(page).getAttribute("data-frames")) ?? 0)).toBeGreaterThan(0);
}

/** Moves the current level's control through its range, as a learner sweeping it end to end. */
async function sweep(page: Page, label: string): Promise<void> {
  const slider = page.getByRole("slider", { name: label, exact: true });
  await slider.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("End");
}

/** Plays each level's control through its range and enters the next, up to level `to` (0-based). */
async function walkTo(page: Page, to: number): Promise<void> {
  for (let at = 0; at < to; at++) {
    const level = LEVELS[at];
    const next = LEVELS[at + 1];
    if (!level || !next) throw new Error(`no level ${at + 2}`);
    await sweep(page, level.action.label);
    await mapButton(page, next.id).click();
    await expect(page.locator("main")).toHaveAttribute("data-level", next.id);
  }
}

/** Whether an element is there and seen: not removed, hidden, transparent or empty. */
async function seen(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((query) => {
    const element = document.querySelector<HTMLElement>(query);
    if (!element) return false;
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && box.width > 0 && box.height > 0;
  }, selector);
}

test("[R06] the six levels play in order from the WorldSpec: each opens once the one before has been moved through its range", async ({ page }) => {
  await openHook(page);
  for (const [at, level] of LEVELS.entries()) {
    await expect(page.locator("main")).toHaveAttribute("data-level", level.id);
    await expect(page.getByRole("region", { name: level.title })).toBeVisible();
    await expect(card(page).locator(".level-kicker")).toHaveText(level.bonus ? `Bonus level, ${level.order} of 6` : `Level ${level.order} of 6`);
    await expect(page.getByRole("slider", { name: level.action.label, exact: true })).toBeVisible();

    // The level's one readout shows the primitive's own value at step 0, its setup applied.
    let state = flock.init(level.params as FlockParams, HOOK_SEED);
    for (const placement of level.setup) state = flock.apply(state, placement.event);
    const metric = level.observable.metricId as keyof FlockObservables;
    const readout = card(page).locator(`[data-observable="${metric}"]`);
    await expect(readout).toHaveCount(1);
    expect(Number(await readout.getAttribute("data-value"))).toBe(flock.measure(state)[metric]);
    // The spread level draws a ring around the flock on the ground; the others draw none.
    if (metric === "groupSpread") await expect(stage(page)).toHaveAttribute("data-spread-ring", /radius/);
    else await expect(stage(page)).not.toHaveAttribute("data-spread-ring", /radius/);

    const next = LEVELS[at + 1];
    if (!next) break;
    await expect(mapButton(page, next.id)).toBeDisabled();
    await sweep(page, level.action.label);
    await expect(mapButton(page, next.id)).toBeEnabled();
    await expect(page.getByRole("group", { name: "Guide" })).toContainText(`is open on the map: ${next.title}`);
    await mapButton(page, next.id).click();
  }
  await expect(page.locator('.level-map li[data-level="result"]')).toHaveClass(/bonus/);
  await expect(mapButton(page, "result")).toContainText("Bonus: Order from the bottom up");
});

test("[R06] the journal gains each level's page as it is reached; the bonus page claims nothing from the paper", async ({ page }) => {
  await openHook(page);
  const journal = page.getByRole("complementary", { name: "Paper journal" });
  await page.getByRole("button", { name: "Journal" }).click();
  await expect(journal.locator("[data-page]")).toHaveCount(1);
  await expect(journal.locator(".locked-list li")).toHaveCount(5);
  await page.keyboard.press("Escape");

  await walkTo(page, 5);
  await page.getByRole("button", { name: "Journal" }).click();
  await expect(journal.locator("[data-page]")).toHaveCount(6);
  await expect(journal.locator(".locked-list")).toHaveCount(0);
  for (const level of LEVELS.slice(0, 5)) {
    await expect(journal.locator(`[data-page="${level.id}"] .passage .origin-tag`)).toHaveText(/Paper.*placeholder/);
  }
  const bonus = journal.locator('[data-page="result"]');
  await expect(bonus.locator(".page-level")).toContainText("a bonus page");
  await expect(bonus.locator(".passage .origin-tag-paper-derived")).toHaveCount(0);
  await expect(bonus.locator(".passage .origin-tag-teaching-choice")).toBeVisible();
  await expect(bonus.locator(".page-detail")).toContainText("Further reading, beyond the paper");
  await expect(bonus.locator(".page-detail")).toContainText("Vicsek");
  // The bonus level's control is not from the paper, and says so.
  await page.keyboard.press("Escape");
  await expect(card(page).locator(".not-from-paper")).toBeVisible();
  await expect(card(page).locator(".control-line .origin-tag-paper-derived")).toHaveCount(0);
});

test("[R06] each level's depth variants show and hide the shell's elements by id", async ({ page }) => {
  test.setTimeout(60_000);
  await openHook(page);
  for (const [at, level] of LEVELS.entries()) {
    for (const [depth, label] of Object.entries(DEPTH_LABELS) as [keyof typeof DEPTH_LABELS, string][]) {
      await card(page).getByText(label, { exact: true }).click();
      const shown = new Set(spec.levels[at]?.explanation[depth].show);
      for (const element of DepthElement.options.filter((id) => id !== "analogy")) {
        expect(await seen(page, `.level-card [data-element="${element}"]`), `${level.id} at ${depth}: ${element}`).toBe(shown.has(element));
      }
      await page.getByRole("button", { name: "Journal" }).click();
      await expect(page.locator(".journal.open")).toBeVisible();
      expect(await seen(page, `[data-page="${level.id}"] [data-element="analogy"]`), `${level.id} at ${depth}: analogy`).toBe(shown.has("analogy"));
      await page.keyboard.press("Escape");
    }
    if (at < LEVELS.length - 1) {
      await sweep(page, level.action.label);
      const next = LEVELS[at + 1];
      if (next) await mapButton(page, next.id).click();
    }
  }
});

test("[R06] What if names each level's counterfactual and what the other world changes, and the bonus level's says both worlds restart", async ({ page }) => {
  // Every level now opens a fork, after its prediction: 24.8 s on CI's runner before that.
  test.setTimeout(90_000);
  await openHook(page);
  for (const [at, level] of LEVELS.entries()) {
    await card(page).getByRole("button", { name: "What if" }).click();
    if (level.exploration) {
      // A level that asks for a prediction asks first; the answer opens its fork.
      await page.getByRole("button", { name: level.exploration.choices[0] }).click();
      await expect(page.locator(".fork").getByRole("heading", { name: level.fork.prompt })).toBeVisible();
      await expect(page.locator(".fork [data-restarts]")).toHaveCount(level.fork.restarts ? 1 : 0);
    } else {
      const whatIf = page.locator("#what-if");
      await expect(whatIf.getByRole("heading", { name: level.fork.prompt })).toBeVisible();
      await expect(whatIf).toContainText("The other world runs with");
      await expect(whatIf.getByRole("button", { name: "Run both worlds" })).toBeVisible();
      await expect(whatIf.locator("[data-restarts]")).toHaveCount(level.fork.restarts ? 1 : 0);
      if (level.fork.restarts) await expect(whatIf).toContainText("Both worlds restart from the same seed.");
    }
    await page.getByRole("button", { name: "Back to one world" }).click();
    const next = LEVELS[at + 1];
    if (!next) break;
    await sweep(page, level.action.label);
    await mapButton(page, next.id).click();
  }
});
