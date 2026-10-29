import { AxeBuilder } from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { BUILT } from "./origins.ts";

// The library (ADR-0049): every world with its paper, kind, status, levels and picture, linked from
// every world's title card, passing the axe scan at a desktop size and on a phone; the public build
// lists the worlds built beforehand and asks no API.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];
const index = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "apps", "web", "src", "library", "worlds.json"), "utf8")) as {
  worlds: { id: string; route: string | null; title: string; status: "verified" | "draft" | "generated" | "retired"; levels: unknown[]; thumbnail: string }[];
};

for (const size of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
] as const) {
  test(`[R12] /library lists every world with its status, levels and picture, and passes the axe scan, on a ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/library");
    await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
    for (const world of index.worlds) {
      const row = page.locator(`[data-world="${world.id}"]`);
      // A retired world has no link to play it, and says why (ADR-0051).
      if (world.route) await expect(row.getByRole("link", { name: world.title })).toHaveAttribute("href", world.route);
      else {
        await expect(row.locator("h3 a")).toHaveCount(0);
        await expect(row.locator(".library-retired")).toContainText("Retired on");
      }
      await expect(row.locator(".library-status")).toHaveText({ verified: "Verified", draft: "Draft", generated: "Generated", retired: "Retired" }[world.status]);
      await expect(row.getByRole("list", { name: `${world.title}'s levels` }).getByRole("listitem")).toHaveCount(world.levels.length);
      expect(await row.locator("img").evaluate((image: HTMLImageElement) => image.getAttribute("src"))).toBe(world.thumbnail);
    }
    // A phone stacks each picture over its words; nothing scrolls sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join("; ")}`)).toEqual([]);
  });
}

test("every world's title card links to the library, on a desktop and on a phone", async ({ page }) => {
  test.setTimeout(120_000);
  for (const size of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    for (const route of new Set(index.worlds.flatMap((world) => (world.route ? [world.route] : [])))) {
      await page.goto(route);
      const link = page.locator(".world-card").getByRole("link", { name: "Library" });
      await expect(link, `${route} at ${size.width} px`).toBeVisible({ timeout: 30_000 });
      await expect(link).toHaveAttribute("href", "/library");
    }
  }
});

test("on a development server, the library also says what this machine's API has made", async ({ page }) => {
  await page.route("**/api/jobs", (route) =>
    route.fulfill({ json: { jobs: [{ jobId: "a1b2c3d4-e5f6-7a8b", source: "pmc:PMC12334037", state: "ready", world: { title: "A world made here", levels: [{ order: 1, title: "First", bonus: false }] } }] } }),
  );
  await page.goto("/library");
  const section = page.getByRole("region", { name: "Made on this machine" });
  await expect(section.getByRole("link", { name: "A world made here" })).toHaveAttribute("href", "/world/job/a1b2c3d4-e5f6-7a8b");
});

test("[R09] the production build's library lists the worlds built beforehand and asks no API", async ({ page }) => {
  let called = false;
  await page.route("**/api/**", (route) => {
    called = true;
    return route.abort();
  });
  await page.goto(`${BUILT}/library`);
  await expect(page.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
  await expect(page.locator("[data-world]")).toHaveCount(index.worlds.length);
  await expect(page.getByRole("region", { name: "Made on this machine" })).toHaveCount(0);
  const picture = await page.request.get(`${BUILT}${index.worlds[0]?.thumbnail ?? ""}`);
  expect(picture.headers()["content-type"]).toBe("image/jpeg");
  expect(called).toBe(false);
});
