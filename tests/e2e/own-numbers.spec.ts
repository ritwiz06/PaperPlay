import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Running the paper's own numbers (ADR-0040): level 1 says what the check confirmed, beside its
// goal, and the journal carries the check's page, each statement with its origin. The first
// generated world, as a job's world on the development server, with a page and an observation
// added here.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];
const OBSERVATION = "At the values the paper lists in Table 1, R0 stays between 0.65 and 0.78 for every adherence from 0 to 1, so the 52% threshold doesn't appear here; the paper's figure may use values it doesn't list.";

function worldWithOwnNumbers(): unknown {
  const world = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "fixtures", "worldspecs", "retired", "pmc-PMC12334037.json"), "utf8")) as { levels: Record<string, unknown>[]; digest: { hookResult: { anchors: unknown[] } } };
  const [first, ...rest] = world.levels;
  return {
    ...world,
    levels: [{ ...first, observation: { text: OBSERVATION, origin: "computed-observation", anchors: [] } }, ...rest],
    ownNumbers: {
      verdict: "mismatch",
      statements: [
        { text: "The paper's headline, as it writes it.", origin: "paper-derived", anchors: world.digest.hookResult.anchors },
        { text: "R0 by the paper's own formula, equation (7), at the values it lists: 0.762; the model's own equations give the same.", origin: "computed-observation", anchors: [] },
        { text: OBSERVATION, origin: "computed-observation", anchors: [] },
      ],
    },
  };
}

async function open(page: Page): Promise<void> {
  const world = worldWithOwnNumbers();
  await page.route("**/api/jobs/own-numbers/world", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(world) }));
  await page.goto("/world/job/own-numbers");
  await expect(page.getByRole("heading", { name: "HCV adherence in Zimbabwe", level: 1 })).toBeVisible({ timeout: 30_000 });
}

test("[R05] level 1 says what running the paper's own numbers found, and the journal's page says each statement's origin", async ({ page }) => {
  await open(page);
  const observation = page.locator("[data-observation]");
  await expect(observation).toContainText(OBSERVATION);
  await expect(observation).toContainText("Measured");
  await page.getByRole("button", { name: "Journal" }).click();
  const own = page.getByRole("region", { name: "Running the paper's own numbers" });
  await expect(own.locator("li")).toHaveCount(3);
  await expect(own.locator("li").first()).toContainText("Paper");
  await expect(own).toContainText("0.762; the model's own equations give the same");
});

for (const size of [
  { name: "desktop", width: 1280, height: 720 },
  { name: "phone", width: 360, height: 740 },
] as const) {
  test(`[R12] the page of the paper's own numbers passes the axe scan, on a ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await open(page);
    await page.getByRole("button", { name: "Journal" }).click();
    await expect(page.getByRole("region", { name: "Running the paper's own numbers" })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });
}
