import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { pixelStats } from "./pixels.ts";

// WebGL context loss (ADR-0022): a browser may take a page's graphics away, as
// phones do with background tabs. The stage says so and offers "Tap to reload the world"; if the
// browser gives the context back first, drawing resumes by itself. The run never notices.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];
const stage = (page: Page) => page.getByRole("application", { name: "World stage" });
const frames = async (page: Page) => Number((await stage(page).getAttribute("data-frames")) ?? 0);
const context = (page: Page) => stage(page).locator("[data-context]");

async function open(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/world/hook");
  await expect.poll(() => frames(page)).toBeGreaterThan(0);
  await expect(context(page)).toHaveAttribute("data-context", "drawing");
}

/** Takes the stage's context away, as the browser would, keeping the means to give it back. */
async function loseContext(page: Page): Promise<void> {
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[role="application"][aria-label="World stage"] canvas');
    const lose = canvas?.getContext("webgl2")?.getExtension("WEBGL_lose_context");
    if (!canvas || !lose) throw new Error("no WebGL context to lose");
    Object.assign(window, { lostCanvas: canvas, lose });
    lose.loseContext();
  });
  await expect(context(page)).toHaveAttribute("data-context", "lost");
}

async function drawsAgain(page: Page, before: number): Promise<void> {
  await expect.poll(() => frames(page)).toBeGreaterThan(before);
  const canvas = page.getByRole("img", { name: /flock of 72 birds/ });
  const { variance, colours } = await pixelStats(page, await canvas.screenshot());
  expect(variance).toBeGreaterThan(64);
  expect(colours).toBeGreaterThan(16);
}

test.use({ viewport: { width: 1440, height: 900 } });

test("[R12] when the browser takes the world's graphics away, the stage says so plainly, and passes the axe scan", async ({ page }) => {
  await open(page);
  await loseContext(page);
  const notice = stage(page).getByRole("region", { name: "The world stopped drawing" });
  await expect(notice).toBeVisible();
  await expect(notice.getByRole("status")).toContainText("Only the drawing stopped");
  await expect(notice.getByRole("button", { name: "Tap to reload the world" })).toBeVisible();
  const results = await new AxeBuilder({ page }).include(".stage-lost").withTags(WCAG).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
});

test("when the browser gives the context back, drawing resumes by itself, and the run is untouched", async ({ page }) => {
  await open(page);
  const step = await page.locator("main").getAttribute("data-step");
  await loseContext(page);
  const lostAt = await frames(page);
  await page.evaluate(() => (window as unknown as { lose: WEBGL_lose_context }).lose.restoreContext());
  await expect(context(page)).toHaveAttribute("data-context", "restored");
  await expect(stage(page).locator(".stage-lost")).toHaveCount(0);
  await drawsAgain(page, lostAt);
  await expect(page.locator("main")).toHaveAttribute("data-step", step ?? "");
});

test("Tap to reload the world draws it again on a new canvas, focus back on the stage, and the run is untouched", async ({ page }) => {
  await open(page);
  const step = await page.locator("main").getAttribute("data-step");
  await loseContext(page);
  const lostAt = await frames(page);
  await stage(page).getByRole("button", { name: "Tap to reload the world" }).click();
  await expect(context(page)).toHaveAttribute("data-context", "reloaded");
  await expect(stage(page).locator(".stage-lost")).toHaveCount(0);
  await expect(stage(page).locator("canvas")).toHaveCount(1);
  const fresh = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[role="application"][aria-label="World stage"] canvas');
    return { replaced: canvas !== (window as unknown as { lostCanvas: HTMLCanvasElement }).lostCanvas, lost: canvas?.getContext("webgl2")?.isContextLost() ?? null };
  });
  expect(fresh).toEqual({ replaced: true, lost: false });
  await expect(stage(page)).toBeFocused();
  await drawsAgain(page, lostAt);
  await expect(page.locator("main")).toHaveAttribute("data-step", step ?? "");
});
