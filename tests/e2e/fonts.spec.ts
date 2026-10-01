import { expect, test } from "@playwright/test";

// ADR-0002: the fonts are self-hosted. Every request that would leave the page's origin is
// blocked and recorded, so a font (or anything else) fetched from the network fails here.
test("loads its fonts from its own origin, in the shipped weights only", async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? "").origin;
  const offOrigin: string[] = [];
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith("data:") || url.startsWith("blob:") || new URL(url).origin === origin) return route.continue();
    offOrigin.push(url);
    return route.abort();
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  // The page's own text needs Fredoka in both shipped weights, and nothing else.
  const loaded = await page.evaluate(() =>
    [...document.fonts].filter((face) => face.status === "loaded").map((face) => `${face.family.replaceAll('"', "")} ${face.weight}`),
  );
  expect([...new Set(loaded)].sort()).toEqual(["Fredoka 400", "Fredoka 600"]);
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/^"?Fredoka"?,/);

  // Literata is declared for paper passages, which arrive at G2; it must load offline too.
  const literata = await page.evaluate(async () => (await document.fonts.load('400 16px "Literata"', "Flocks")).map((face) => face.status));
  expect(literata).toContain("loaded");

  // Every element with text asks for a weight that ships, so the browser never fakes a bold.
  const weights = await page.evaluate(() => [
    ...new Set(
      [...document.querySelectorAll("body *")]
        .filter((element) => [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()))
        .map((element) => getComputedStyle(element).fontWeight),
    ),
  ]);
  expect(weights.length).toBeGreaterThan(0);
  for (const weight of weights) expect(["400", "600"]).toContain(weight);

  expect(offOrigin).toEqual([]);
});
