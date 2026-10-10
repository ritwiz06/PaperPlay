import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AxeBuilder } from "@axe-core/playwright";
import { buildWorld } from "@paperplay/pipeline";
import { registry } from "@paperplay/primitives";
import { expect, test, type Page } from "@playwright/test";

// The split-screen fork on /world/hook (ADR-0008): two worlds from the same moment, side by
// side on a desktop and stacked on a phone, with the measured difference charted beneath.

const built = buildWorld(JSON.parse(readFileSync(fileURLToPath(new URL("../../fixtures/worldspecs/flocking-reference.json", import.meta.url)), "utf8")), registry);
if (!built.ok) throw new Error("the reference world must build");
const LEVELS = built.world.levels;
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];

const here = (page: Page) => page.getByRole("application", { name: "World stage, this world" });
const there = (page: Page) => page.getByRole("application", { name: "World stage, what if" });
const frames = async (page: Page, stage: ReturnType<typeof here>) => Number((await stage.getAttribute("data-frames")) ?? 0);

async function openHook(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/world/hook");
  await expect.poll(async () => Number((await page.getByRole("application", { name: "World stage" }).getAttribute("data-frames")) ?? 0)).toBeGreaterThan(0);
}

async function walkTo(page: Page, to: number): Promise<void> {
  for (let at = 0; at < to; at++) {
    const level = LEVELS[at];
    const next = LEVELS[at + 1];
    if (!level || !next) throw new Error(`no level ${at + 2}`);
    await page.getByRole("slider", { name: level.action.label, exact: true }).focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("End");
    await page.locator(`.level-map li[data-level="${next.id}"] button`).click();
  }
}

/** Opens the level's fork the first time: every level asks for a prediction first, and the answer opens it. */
async function openFork(page: Page, choice = 0): Promise<void> {
  await page.locator(".level-whatif").getByRole("button", { name: "What if" }).click();
  const ask = page.locator(".guide-choices button");
  await expect(ask).toHaveCount(2);
  await ask.nth(choice).click();
  await expect(page.locator("main")).toHaveAttribute("data-fork", "open");
  await expect.poll(() => frames(page, here(page))).toBeGreaterThan(0);
  await expect.poll(() => frames(page, there(page))).toBeGreaterThan(0);
}

async function violations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return results.violations.map((violation) => `${violation.id}: ${violation.help}. ${violation.nodes.map((node) => node.target.join(" ")).join("; ")}`);
}

test.describe("on a desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("[R06] the fork shows two worlds side by side, names the What-if, and charts the measured difference as both play", async ({ page }) => {
    await openHook(page);
    const level = LEVELS[0];
    if (!level) throw new Error("no hook");
    await openFork(page);
    const fork = page.getByRole("region", { name: level.fork.prompt });
    await expect(fork.getByRole("heading", { name: level.fork.prompt })).toBeFocused();
    await expect(fork).toContainText("The other world runs with “Move together” at 0 (here 2).");
    await expect(fork.locator("[data-restarts]")).toHaveCount(0);
    // After a prediction, the level's statement waits for the level's time.
    await expect(fork.locator("[data-effect]")).toHaveCount(0);

    const [a, b] = [await here(page).boundingBox(), await there(page).boundingBox()];
    expect(a && b && a.x + a.width <= b.x + 1 && Math.abs(a.y - b.y) < 2, JSON.stringify({ a, b })).toBe(true);

    const chart = fork.locator(".difference-chart");
    await expect(chart).toHaveAttribute("data-here-samples", "1");
    await fork.getByRole("button", { name: "Play both" }).click();
    await expect.poll(async () => Number(await chart.getAttribute("data-here-samples")), { timeout: 15_000 }).toBeGreaterThan(5);
    // Both worlds are sampled together, sample for sample.
    expect(await chart.getAttribute("data-there-samples")).toBe(await chart.getAttribute("data-here-samples"));
    await expect(fork.locator("[data-measured]")).toContainText("Agreement after 20 seconds:");
  });

  test("[R06] a What-if that changes a start-up variable says both worlds restart", async ({ page }) => {
    await openHook(page);
    await walkTo(page, 5);
    await openFork(page);
    await expect(page.getByRole("region", { name: LEVELS[5]?.fork.prompt ?? "" }).locator("[data-restarts]")).toHaveText("Both worlds restart from the same seed.");
  });

  test("Escape closes the fork, back to the one world, with focus on What if", async ({ page }) => {
    await openHook(page);
    await openFork(page);
    await page.keyboard.press("Escape");
    await expect(page.locator("main")).toHaveAttribute("data-fork", "closed");
    await expect(page.getByRole("application", { name: "World stage" })).toBeVisible();
    await expect(page.locator(".level-whatif").getByRole("button", { name: "What if" })).toBeFocused();
  });

  test("[R06] the speed control cycles 1x, 2x, 4x, and the fork opens at the speed in use", async ({ page }) => {
    await openHook(page);
    const speed = page.locator(".hud-buttons .speed-button");
    await expect(speed).toHaveText("Speed 1×");
    await speed.click();
    await expect(page.locator("main")).toHaveAttribute("data-speed", "2");
    await speed.click();
    await expect(speed).toHaveText("Speed 4×");
    await expect(speed).toHaveAccessibleName("Speed 4×. Change to 1×");
    await openFork(page);
    await expect(page.locator(".fork .speed-button")).toHaveText("Speed 4×");
  });

  test("[R06] at 4x the fork runs to the level's time, measures this sky, and the guide says what this sky showed", async ({ page }) => {
    await openHook(page);
    await openFork(page);
    const fork = page.locator(".fork");
    await fork.locator(".speed-button").click();
    await fork.locator(".speed-button").click();
    await expect(fork.locator(".speed-button")).toHaveText("Speed 4×");
    await fork.getByRole("button", { name: "Play both" }).click();
    // Seed 5 at the level's start, as eval/sweeps/levels.md records it: 0.93 against 0.08, holds.
    // The level asked for a prediction, so the guide says so: by the choice that holds.
    await expect(fork.locator(".fork-guide")).toContainText(`On this sky: ${LEVELS[0]?.exploration?.choices[0] ?? ""}.`, { timeout: 45_000 });
    await expect(fork.locator("[data-measured]")).toContainText("this world 0.93");
    await expect(fork.locator("[data-measured]")).toContainText("what if 0.08");
    await expect(fork.locator(".difference-chart")).toHaveAttribute("data-here-samples", "201");
    await expect(fork.getByRole("button", { name: "Done" })).toBeDisabled();
  });

  test("closing the fork releases both of its stages' WebGL contexts at once", async ({ page }) => {
    await openHook(page);
    await openFork(page);
    // Keep the fork's two canvases, close it, then ask each whether its context was released.
    await page.evaluate(() => {
      (window as unknown as { forkCanvases: HTMLCanvasElement[] }).forkCanvases = [...document.querySelectorAll<HTMLCanvasElement>(".fork canvas")];
    });
    await page.getByRole("button", { name: "Back to one world" }).click();
    await expect(page.locator("main")).toHaveAttribute("data-fork", "closed");
    const lost = await page.evaluate(() =>
      (window as unknown as { forkCanvases: HTMLCanvasElement[] }).forkCanvases.map((canvas) => canvas.getContext("webgl2")?.isContextLost() ?? null),
    );
    expect(lost).toEqual([true, true]);
  });

  test("[R12] the fork passes the axe scan, on a desktop", async ({ page }) => {
    await openHook(page);
    await openFork(page);
    expect(await violations(page)).toEqual([]);
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("[R06] the fork stacks the two worlds, one above the other", async ({ page }) => {
    await openHook(page);
    await openFork(page);
    const [a, b] = [await here(page).boundingBox(), await there(page).boundingBox()];
    expect(a && b && a.y + a.height <= b.y + 1 && a.height > 150 && b.height > 150, JSON.stringify({ a, b })).toBe(true);
    await expect(page.locator(".difference-chart")).toBeVisible();
  });

  test("[R12] the fork's chart spans its card and is drawn at its own size, so its labels stay readable, on a phone", async ({ page }) => {
    await openHook(page);
    await openFork(page);
    const chart = await page.locator(".difference-chart").evaluate((figure) => {
      const svg = figure.querySelector("svg");
      const card = figure.closest(".fork-result");
      const tick = figure.querySelector(".chart-tick");
      if (!svg || !card || !tick) throw new Error("no chart");
      const style = getComputedStyle(card);
      const inner = card.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return {
        share: svg.getBoundingClientRect().width / inner,
        scale: svg.getBoundingClientRect().width / svg.viewBox.baseVal.width,
        tick: parseFloat(getComputedStyle(tick).fontSize),
        tickHeight: tick.getBoundingClientRect().height,
      };
    });
    expect(chart.share, JSON.stringify(chart)).toBeGreaterThan(0.98);
    expect(chart.scale, JSON.stringify(chart)).toBeCloseTo(1, 2);
    expect(chart.tick).toBeGreaterThanOrEqual(12);
    expect(chart.tickHeight).toBeGreaterThanOrEqual(10);
  });

  test("[R12] the fork passes the axe scan, on a phone", async ({ page }) => {
    await openHook(page);
    await openFork(page);
    expect(await violations(page)).toEqual([]);
  });
});
