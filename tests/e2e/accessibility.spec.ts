import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// R12's axe scan: every WCAG 2.0, 2.1 and 2.2 rule at levels A and AA that axe can decide.
// Each page is scanned in the states a learner reaches without playing, at a desktop size
// and at 360 px, the narrowest width the brief supports. Any violation fails the test, and
// the message names the rule and the elements that broke it.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];
const SIZES = [
  { name: "desktop", width: 1280, height: 720 },
  { name: "phone", width: 360, height: 740 },
] as const;

async function violations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return results.violations.map(
    (violation) => `${violation.id} (${violation.impact ?? "unrated"}): ${violation.help}. ${violation.nodes.map((node) => node.target.join(" ")).join("; ")}`,
  );
}

async function openWorld(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/world/local");
  await expect.poll(async () => Number((await page.getByRole("application", { name: "World stage" }).getAttribute("data-frames")) ?? 0)).toBeGreaterThan(0);
}

for (const size of SIZES) {
  test.describe(`at ${size.width} × ${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test(`[R12] /world/local passes the axe scan as it opens, on a ${size.name}`, async ({ page }) => {
      await openWorld(page);
      expect(await violations(page)).toEqual([]);
    });

    test(`[R12] /world/local passes the axe scan with its rules open, a bird picked and a beacon placed, on a ${size.name}`, async ({ page }) => {
      await openWorld(page);
      await page.getByText("Rules of this world").click();
      await expect(page.getByRole("slider", { name: "Personal space" })).toBeVisible();

      const stage = page.getByRole("application", { name: "World stage" });
      await page.getByRole("button", { name: "Pick a bird" }).click();
      await stage.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("[data-bird]")).toBeVisible();

      await page.getByRole("button", { name: "Place a beacon" }).click();
      await stage.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("list", { name: "Placed in this world" }).getByText(/^Beacon 1 at/)).toBeVisible();

      expect(await violations(page)).toEqual([]);
    });
  });
}

async function openHook(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/world/hook");
  await expect.poll(async () => Number((await page.getByRole("application", { name: "World stage" }).getAttribute("data-frames")) ?? 0)).toBeGreaterThan(0);
}

for (const size of SIZES) {
  test.describe(`/world/hook at ${size.width} × ${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test(`[R12] /world/hook passes the axe scan as it opens, after the control moves, and with What if open, on a ${size.name}`, async ({ page }) => {
      await openHook(page);
      expect(await violations(page)).toEqual([]);
      const slider = page.getByRole("slider", { name: "Move together" });
      await slider.focus();
      await page.keyboard.press("End");
      await expect(page.getByRole("group", { name: "Guide" })).toBeVisible();
      expect(await violations(page)).toEqual([]);
      await page.getByRole("button", { name: "What if" }).click();
      await expect(page.getByRole("heading", { name: /What if birds ignored/ })).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test(`[R12] /world/hook passes the axe scan with the paper journal open, on a ${size.name}`, async ({ page }) => {
      await openHook(page);
      await page.getByRole("button", { name: "Journal" }).click();
      await expect(page.getByRole("complementary", { name: "Paper journal" })).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  });
}
