import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { pixelStats } from "./pixels.ts";

// The momentum world on /world/momentum (ADR-0047): the learning family's reference, in the
// landscape kit. The surface and its ball draw; the miniature label is on the world card and the
// level card at every depth; a fork draws both worlds' balls on the one surface and tells both runs
// from step 0; and every state a learner reaches passes the axe scan at a desktop size and at 360 px.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];
const SIZES = [
  { name: "desktop", width: 1280, height: 720 },
  { name: "phone", width: 360, height: 740 },
] as const;
const MINIATURE = "miniature: the idea at toy scale";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function violations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return results.violations.map(
    (violation) => `${violation.id} (${violation.impact ?? "unrated"}): ${violation.help}. ${violation.nodes.map((node) => node.target.join(" ")).join("; ")}`,
  );
}

async function openMomentum(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/world/momentum");
  await expect.poll(async () => Number((await page.getByRole("application", { name: "World stage" }).getAttribute("data-frames")) ?? 0)).toBeGreaterThan(0);
}

test("[R02] draws the loss surface as terrain with the optimizer's ball on it, and nothing in the console", async ({ page }) => {
  const errors = collectErrors(page);
  await openMomentum(page);
  await expect(page.getByRole("heading", { name: "Momentum Valley", level: 1 })).toBeVisible();
  const canvas = page.getByRole("img", { name: /a loss surface drawn as terrain, an oblong bowl, 25 times as curved across as along/ });
  const { variance, colours } = await pixelStats(page, await canvas.screenshot());
  expect(variance).toBeGreaterThan(64);
  expect(colours).toBeGreaterThan(16);
  await expect(page.getByRole("application", { name: "World stage" })).toHaveAttribute("data-balls", /^here:/);
  expect(errors).toEqual([]);
});

test("[R06] shows the miniature label on the world card, and on the level card at every depth", async ({ page }) => {
  await openMomentum(page);
  await expect(page.locator(".world-card [data-family-label]")).toHaveText(MINIATURE);
  for (const depth of ["Beginner", "Intermediate", "Advanced"]) {
    await page.getByRole("radio", { name: depth }).first().check();
    await expect(page.locator(".level-card [data-family-label]")).toHaveText(MINIATURE);
    await expect(page.locator(".level-card [data-family-label]")).toBeVisible();
  }
  await page.getByRole("button", { name: "Journal" }).click();
  await expect(page.getByRole("region", { name: "What this world cannot show" })).toContainText("Miniature: the idea at toy scale.");
});

test("[R06] at 4x level 1's fork draws both balls on one surface, tells both runs from step 0, and measures them", async ({ page }) => {
  test.setTimeout(90_000);
  await openMomentum(page);
  await page.locator(".level-whatif").getByRole("button", { name: "What if" }).click();
  await page.locator(".guide-choices button").first().click();
  const fork = page.locator(".fork");
  await expect(fork.locator("[data-restarts]")).toHaveText("Both worlds start again from step 0.");
  for (const pane of ["here", "there"]) await expect(fork.locator(`[data-pane="${pane}"] [data-balls]`)).toHaveAttribute("data-balls", /^here:\S+ there:\S+$/);
  await fork.locator(".speed-button").click();
  await fork.locator(".speed-button").click();
  await fork.getByRole("button", { name: "Play both" }).click();
  await expect(fork.locator(".fork-guide")).toContainText("Across 20 starts, this world's values and 19 within a tenth of them, the level's statement holds on at least 16.", { timeout: 60_000 });
});

for (const size of SIZES) {
  test.describe(`/world/momentum at ${size.width} × ${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test(`[R12] passes the axe scan as it opens, with What if's prediction asked, with its fork open, and with the journal open, on a ${size.name}`, async ({ page }) => {
      await openMomentum(page);
      await expect(page.locator(".level-card [data-family-label]")).toBeVisible();
      expect(await violations(page)).toEqual([]);
      await page.locator(".level-whatif").getByRole("button", { name: "What if" }).click();
      await expect(page.locator(".guide-choices button")).toHaveCount(2);
      expect(await violations(page)).toEqual([]);
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
