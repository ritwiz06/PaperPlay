import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

// The production build under the headers the first deploy will send (vercel.json, ADR-0017),
// served by scripts/serve-dist.ts as Vercel would. Every page must run with no
// Content-Security-Policy violation and no console error.

const BUILT = "http://127.0.0.1:4318";
const deploy = JSON.parse(readFileSync(fileURLToPath(new URL("../../vercel.json", import.meta.url)), "utf8")) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
// The headers every page of the app gets: every path but the mechanism sandbox's frame, which has its own (ADR-0058).
const everyPage = deploy.headers.find((rule) => rule.source === "/((?!sandbox\\.html).*)")?.headers ?? [];

async function watched(page: Page): Promise<{ violations: () => Promise<string[]>; errors: string[] }> {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { cspViolations: string[] }).cspViolations = seen;
    document.addEventListener("securitypolicyviolation", (event) => seen.push(`${event.violatedDirective} blocked ${event.blockedURI}`));
  });
  return { violations: () => page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations), errors };
}

const frames = async (page: Page) => Number((await page.getByRole("application", { name: "World stage" }).getAttribute("data-frames")) ?? 0);

test.describe("the built app under the deploy's headers", () => {
  test.use({ baseURL: BUILT, viewport: { width: 1440, height: 900 } });

  test("sends every security header in vercel.json, the Content-Security-Policy first among them", async ({ page }) => {
    expect(everyPage.map((header) => header.key)).toContain("Content-Security-Policy");
    const response = await page.goto("/world/hook");
    const headers = response?.headers() ?? {};
    for (const { key, value } of everyPage) expect(headers[key.toLowerCase()], key).toBe(value);
  });

  test("/world/hook runs through its levels, journal and What-if with no policy violation and no console error", async ({ page }) => {
    const watch = await watched(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/world/hook");
    await expect.poll(() => frames(page)).toBeGreaterThan(0);
    await expect(page.getByRole("application", { name: "World stage" })).toHaveAttribute("data-webgl", "on");
    for (const [label, next] of [
      ["Move together", "background"],
      ["How far a bird sees", "idea"],
      ["Personal space", "method"],
      ["Stay close", "evaluation"],
    ] as const) {
      await page.getByRole("slider", { name: label, exact: true }).focus();
      await page.keyboard.press("Home");
      await page.keyboard.press("End");
      await page.locator(`.level-map li[data-level="${next}"] button`).click();
    }
    await page.getByRole("button", { name: "What if" }).click();
    await page.getByRole("button", { name: "Journal" }).click();
    await expect(page.getByRole("complementary", { name: "Paper journal" })).toBeVisible();
    expect(await watch.violations()).toEqual([]);
    expect(watch.errors).toEqual([]);
  });

  test("/world/local runs with no policy violation and no console error", async ({ page }) => {
    const watch = await watched(page);
    await page.goto("/world/local");
    await expect.poll(() => frames(page)).toBeGreaterThan(0);
    expect(await watch.violations()).toEqual([]);
    expect(watch.errors).toEqual([]);
  });

  test("caches hashed assets for a year", async ({ request, page }) => {
    await page.goto("/world/hook");
    const script = await page.locator('script[type="module"]').first().getAttribute("src");
    const response = await request.get(`${BUILT}${script ?? ""}`);
    expect(response.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
  });
});
