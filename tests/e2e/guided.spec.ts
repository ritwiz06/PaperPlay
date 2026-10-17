import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Guided exploration on level 2 (ADR-0018): the guide asks for a prediction before the fork
// opens, the fork names the intervention, and, at the level's time, the guide reports what was
// measured. Nothing is scored.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];
const SIZES = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
] as const;

async function toLevel2(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/world/hook");
  await expect.poll(async () => Number((await page.getByRole("application", { name: "World stage" }).getAttribute("data-frames")) ?? 0)).toBeGreaterThan(0);
  await page.getByRole("slider", { name: "Move together", exact: true }).focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("End");
  await page.locator('.level-map li[data-level="background"] button').click();
  await expect(page.locator("main")).toHaveAttribute("data-level", "background");
}

const whatIf = (page: Page) => page.locator(".level-whatif").getByRole("button", { name: "What if" });

for (const size of SIZES) {
  test.describe(`at ${size.width} × ${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test(`[R06] level 2 asks for a prediction before its fork opens, then names the intervention, scoring nothing, on a ${size.name}`, async ({ page }) => {
      await toLevel2(page);
      await whatIf(page).click();
      const guide = page.getByRole("group", { name: "Guide" }).first();
      await expect(guide).toContainText("If every bird could see the whole flock, would the flock come to agree faster?");
      const choices = page.getByRole("group", { name: "If every bird could see the whole flock, would the flock come to agree faster?" });
      await expect(choices.getByRole("button")).toHaveText(["Faster", "About the same, or slower"]);
      await expect(choices.getByRole("button", { name: "Faster" })).toBeFocused();
      await expect(page.locator("main")).toHaveAttribute("data-fork", "closed");
      await expect(page.locator("#what-if")).toHaveCount(0);

      await choices.getByRole("button", { name: "About the same, or slower" }).click();
      await expect(page.locator("main")).toHaveAttribute("data-fork", "open");
      const note = page.locator(".fork-guide");
      await expect(note).toContainText("You said: About the same, or slower.");
      await expect(note).toContainText("Now both worlds run, the other with “How far a bird sees” at 50.");
      // The surprise waits for the level's time.
      await expect(page.locator("[data-effect]")).toHaveCount(0);
      await expect(page.locator("main")).not.toContainText(/\b(right|wrong|correct|incorrect|score|points?)\b/i);

      // Asked once: What if then opens its card.
      await page.getByRole("button", { name: "Back to one world" }).click();
      await whatIf(page).click();
      await expect(page.locator("#what-if")).toBeVisible();
    });

    test(`[R06] at the level's time the guide reports this sky and the 20 skies as measured, then the paper and a question, on a ${size.name}`, async ({ page }) => {
      test.setTimeout(90_000);
      await toLevel2(page);
      await page.locator(".hud-buttons .speed-button").click();
      await page.locator(".hud-buttons .speed-button").click();
      await whatIf(page).click();
      await page.getByRole("button", { name: "Faster" }).click();
      await page.locator(".fork").getByRole("button", { name: "Play both" }).click();
      const note = page.locator(".fork-guide");
      await expect(note).toContainText("Across 20 skies: Faster on 6, about the same, or slower on 14.", { timeout: 75_000 });
      await expect(note).toContainText("You said: Faster.");
      // Seed 5: seeing the whole flock reaches agreement 0.9 at 19.6 s, against 17.7 s.
      await expect(note).toContainText("On this sky: About the same, or slower.");
      await expect(note).toContainText("The paper argues that a bird perceives only the flockmates near it");
      await expect(note.locator(".origin-tag-placeholder")).toHaveCount(0);
      await expect(note).toContainText("Why might seeing more birds not help a flock agree sooner?");
      await expect(page.locator("[data-effect]")).toContainText("Seeing the whole flock does not reliably bring order sooner");
      await expect(page.locator("main")).not.toContainText(/\b(right|wrong|correct|incorrect|score|points?)\b/i);
    });

    test(`[R12] the guide's question passes the axe scan, on a ${size.name}`, async ({ page }) => {
      await toLevel2(page);
      await whatIf(page).click();
      await expect(page.getByRole("button", { name: "Faster" })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join("; ")}`)).toEqual([]);
    });
  });
}
