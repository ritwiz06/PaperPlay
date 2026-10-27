import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// A generated world in the shell (ADR-0058): the heat-plate fixture, a world the generated tier's
// job made from a synthetic paper, served as the API's cache serves it, with its module. The module
// runs in the browser's sandbox and draws in its kit's 2D stage; every level carries the generated
// tier's label; the fork runs both worlds from the start in the sandbox and measures them; and every
// state a learner reaches passes the axe scan. Screenshots go to MECHANISM_SCREENSHOTS when it is set.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];
const KEY = "fixture-heatplate";
const kept = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "fixtures", "mechanisms", "heat-plate.world.json"), "utf8")) as { world: unknown; mechanism: unknown };
const shots = process.env["MECHANISM_SCREENSHOTS"];

async function openPlate(page: Page): Promise<void> {
  await page.route(`**/api/worlds/${KEY}`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(kept.world) }));
  await page.route(`**/api/worlds/${KEY}/mechanism`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(kept.mechanism) }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/world/cached/${KEY}`);
  await expect.poll(async () => Number((await page.locator(".game > .stage-mechanism canvas").getAttribute("data-frames")) ?? 0), { timeout: 15_000 }).toBeGreaterThan(0);
}

async function violations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return results.violations.map((violation) => `${violation.id}: ${violation.help}. ${violation.nodes.map((node) => node.target.join(" ")).join("; ")}`);
}

test("[R08] plays a generated world: its module in the sandbox, drawn in its kit, its readings the module's own, labelled as generated", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openPlate(page);
  await expect(page.getByRole("heading", { name: "The Warm Plate", level: 1 })).toBeVisible();
  await expect(page.locator("[data-family-label]").first()).toContainText("generated model: behaviour checked, not verified against the paper");
  await expect(page.getByRole("img", { name: /the module's own drawing of its state, as a grid of cells/ })).toBeVisible();
  // Its reading is the module's measurement at step 0, as the sandbox measured it.
  await expect.poll(async () => Number(await page.locator("[data-observable='mean']").first().getAttribute("data-value"))).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Play" }).click();
  await expect.poll(async () => Number(await page.locator("main").getAttribute("data-step"))).toBeGreaterThan(20);
  if (shots) await page.screenshot({ path: join(shots, `plate-${info.project.name}-world.png`) });
  expect(errors).toEqual([]);
});

test("[R06] [R08] runs a generated world's fork from the start in the sandbox, measures both worlds, and says whether the level's statement holds", async ({ page }, info) => {
  test.setTimeout(90_000);
  await openPlate(page);
  await page.locator(".level-whatif").getByRole("button", { name: "What if" }).click();
  await page.locator(".guide-choices button").first().click();
  const fork = page.locator(".fork");
  await expect.poll(async () => Number((await fork.locator('[data-pane="there"] canvas').getAttribute("data-frames")) ?? 0), { timeout: 15_000 }).toBeGreaterThan(0);
  await fork.locator(".speed-button").click();
  await fork.locator(".speed-button").click();
  await fork.getByRole("button", { name: "Play both" }).click();
  // A prediction was asked, so the guide gives the fork's account: this run's answer, then the level rule's.
  await expect(fork.locator(".fork-guide")).toContainText("In this run: Yes.", { timeout: 60_000 });
  await expect(fork.locator(".fork-guide")).toContainText("Across 20 runs, the level's statement holds on at least 16.");
  await expect(fork.locator("[data-measured]")).toContainText(/Average temperature at step 300: this world 0\.0\d+, what if 0\.0\d+\./);
  if (shots) await page.screenshot({ path: join(shots, `plate-${info.project.name}-fork.png`) });
});

for (const size of [
  { name: "desktop", width: 1280, height: 720 },
  { name: "phone", width: 360, height: 740 },
] as const) {
  test.describe(`a generated world at ${size.width} × ${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });
    test(`[R12] passes the axe scan as it opens, with its fork open, and with the journal open, on a ${size.name}`, async ({ page }) => {
      test.setTimeout(60_000);
      await openPlate(page);
      expect(await violations(page)).toEqual([]);
      if (shots) await page.screenshot({ path: join(shots, `plate-${size.name}.png`) });
      await page.locator(".level-whatif").getByRole("button", { name: "What if" }).click();
      await page.locator(".guide-choices button").first().click();
      await expect(page.locator("main")).toHaveAttribute("data-fork", "open");
      expect(await violations(page)).toEqual([]);
      await page.getByRole("button", { name: "Back to one world" }).click();
      await page.getByRole("button", { name: "Journal" }).click();
      await expect(page.getByRole("complementary", { name: "Paper journal" })).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  });
}
