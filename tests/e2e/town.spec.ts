import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { pixelStats } from "./pixels.ts";

// Threshold Town on /world/epidemic (ADR-0029): Kermack and McKendrick's special case in the
// town kit. The town draws, the run starts again from day 0, a fork tells the epidemic from its
// start and measures it, the journal says what the world cannot show, and every state a learner
// reaches passes the axe scan at a desktop size and at 360 px.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];
const SIZES = [
  { name: "desktop", width: 1280, height: 720 },
  { name: "phone", width: 360, height: 740 },
] as const;

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

async function openTown(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/world/epidemic");
  await expect.poll(async () => Number((await page.getByRole("application", { name: "World stage" }).getAttribute("data-frames")) ?? 0)).toBeGreaterThan(0);
}

test("[R02] draws Threshold Town: its figures in their compartments' colours, and nothing in the console", async ({ page }) => {
  const errors = collectErrors(page);
  await openTown(page);
  await expect(page.getByRole("heading", { name: "Threshold Town", level: 1 })).toBeVisible();
  const canvas = page.getByRole("img", { name: /120 figures, each standing for one in 120 of the town's people/ });
  const { variance, colours } = await pixelStats(page, await canvas.screenshot());
  expect(variance).toBeGreaterThan(64);
  expect(colours).toBeGreaterThan(16);
  await expect(page.locator(".compartments [data-observable='stillWell']")).toHaveAttribute("data-value", "995");
  expect(errors).toEqual([]);
});

test("[R06] starts again from day 0 with the control where it was left", async ({ page }) => {
  await openTown(page);
  await page.getByRole("button", { name: "Play" }).click();
  await expect.poll(async () => Number(await page.locator("main").getAttribute("data-step"))).toBeGreaterThan(40);
  const slider = page.getByRole("slider", { name: "How easily it passes on" });
  await slider.focus();
  await page.keyboard.press("End");
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: "Start again" }).click();
  await expect(page.locator("main")).toHaveAttribute("data-step", "0");
  await expect(slider).toHaveValue("0.001");
});

test("[R06] at 4x level 1's fork tells both towns from day 0, measures them, and says where the rule checked it", async ({ page }) => {
  test.setTimeout(90_000);
  await openTown(page);
  await page.locator(".level-whatif").getByRole("button", { name: "What if" }).click();
  await page.locator(".guide-choices button").first().click();
  const fork = page.locator(".fork");
  await expect(fork.locator("[data-restarts]")).toHaveText("Both worlds start again from day 0.");
  await fork.locator(".speed-button").click();
  await fork.locator(".speed-button").click();
  await fork.getByRole("button", { name: "Play both" }).click();
  // The world's own values, the level rule's first start, as eval/sweeps/levels-kermack-mckendrick-1927.md records it.
  await expect(fork.locator(".fork-guide")).toContainText("In this town: Far fewer.", { timeout: 60_000 });
  await expect(fork.locator(".fork-guide")).toContainText("Across 20 towns, this world's values and 19 within a tenth of them, the level's statement holds on at least 16.");
  await expect(fork.locator("[data-measured]")).toContainText("this world 306.11 people, what if 37.92 people");
});

test("[R05] the journal says what Threshold Town cannot show, each statement with its origin", async ({ page }) => {
  await openTown(page);
  await page.getByRole("button", { name: "Journal" }).click();
  const cannotShow = page.getByRole("region", { name: "What this world cannot show" });
  await expect(cannotShow).toContainText("The paper's general theory, where both may change with how long someone has been ill, is not shown.");
  await expect(cannotShow).toContainText("This world reproduces neither that comparison nor any of the paper's data.");
  await expect(cannotShow).toContainText("The town's 120 figures are a picture of the model's shares, not people the model follows");
  await expect(cannotShow.locator("li")).toHaveCount(9);
  await expect(page.getByRole("button", { name: /Kermack and McKendrick 1927/ })).toBeVisible();
});

for (const size of SIZES) {
  test.describe(`/world/epidemic at ${size.width} × ${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test(`[R12] passes the axe scan as it opens, with What if's prediction asked, with its fork open, and with the journal open, on a ${size.name}`, async ({ page }) => {
      await openTown(page);
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
