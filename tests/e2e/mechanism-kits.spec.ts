import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

// The six generic scene kits a generated mechanism draws in (ADR-0058), each drawing a hand-made
// frame on /check/kits, a development page. Every canvas must draw more than its cream ground, at
// the screen's pixel density, and the page must pass the axe scan, at a desktop size and on a
// phone. Screenshots go to KITS_SCREENSHOTS when it names a folder, for a person to look at, and
// to the test's own output folder otherwise.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];
const KITS = ["towers", "grid", "particles", "network", "landscape", "charts"] as const;
const SIZES = [
  { name: "desktop", width: 1440, height: 900, ratio: 1 },
  { name: "phone", width: 390, height: 844, ratio: 2 },
] as const;

/** Each canvas's share of sampled pixels that are not the cream ground: one read, once every canvas has drawn. */
async function inked(page: Page): Promise<{ kit: string; inked: number }[]> {
  return page.locator("canvas[role=img]").evaluateAll((canvases) =>
    canvases.map((canvas) => {
      const element = canvas as HTMLCanvasElement;
      const kit = element.parentElement?.dataset["kit"] ?? "";
      const { data } = element.getContext("2d")?.getImageData(0, 0, element.width, element.height) ?? { data: new Uint8ClampedArray() };
      let [seen, inked] = [0, 0];
      // Every seventh pixel is plenty to tell a drawing from a blank ground.
      for (let i = 0; i < data.length; i += 4 * 7) {
        seen += 1;
        if (Math.abs((data[i] ?? 0) - 0xf8) + Math.abs((data[i + 1] ?? 0) - 0xfa) + Math.abs((data[i + 2] ?? 0) - 0xee) > 24) inked += 1;
      }
      return { kit, inked: seen > 0 ? inked / seen : 0 };
    }),
  );
}

/** Canvases that have not yet drawn a frame, or whose bitmap does not match their size at the screen's density. */
async function undrawn(page: Page): Promise<string[]> {
  return page.locator("canvas[role=img]").evaluateAll((canvases) =>
    canvases
      .filter((canvas) => {
        const element = canvas as HTMLCanvasElement;
        const box = element.getBoundingClientRect();
        const sharp = Math.abs(element.width - box.width * window.devicePixelRatio) <= 1 && Math.abs(element.height - box.height * window.devicePixelRatio) <= 1;
        return !(Number(element.dataset["frames"] ?? 0) > 0 && sharp);
      })
      .map((canvas) => canvas.parentElement?.dataset["kit"] ?? ""),
  );
}

async function open(page: Page, query = ""): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/check/kits${query}`);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect(page.locator("canvas[role=img]")).toHaveCount(query ? 1 : KITS.length);
  await expect.poll(() => undrawn(page)).toEqual([]);
}

async function shoot(page: Page, info: TestInfo, name: string): Promise<void> {
  const folder = process.env["KITS_SCREENSHOTS"];
  const path = folder ? join(folder, `${name}.png`) : info.outputPath(`${name}.png`);
  if (folder) mkdirSync(folder, { recursive: true });
  await page.screenshot({ path, fullPage: true });
}

for (const size of SIZES) {
  test.describe(`/check/kits at ${size.width} × ${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.ratio });

    test(`every kit draws its frame at the screen's density, on a ${size.name}`, async ({ page }, info) => {
      await open(page);
      const canvases = await inked(page);
      expect(canvases.map((canvas) => canvas.kit)).toEqual([...KITS]);
      for (const canvas of canvases) expect(canvas.inked, canvas.kit).toBeGreaterThan(0.01);
      for (const kit of KITS) await expect(page.locator(`[data-kit=${kit}] canvas`)).toHaveAttribute("aria-label", /\w/);
      await shoot(page, info, `all-${size.name}`);
    });

    test(`[R12] /check/kits passes the axe scan, on a ${size.name}`, async ({ page }) => {
      await open(page);
      const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(results.violations.map((violation) => `${violation.id}: ${violation.help}. ${violation.nodes.map((node) => node.target.join(" ")).join("; ")}`)).toEqual([]);
    });

    test(`each kit alone fills the window, on a ${size.name}`, async ({ page }, info) => {
      test.setTimeout(60_000);
      for (const kit of KITS) {
        await open(page, `?kit=${kit}`);
        const box = await page.locator("canvas[role=img]").boundingBox();
        expect(box?.width ?? 0, kit).toBeGreaterThan(size.width * 0.8);
        expect(box?.height ?? 0, kit).toBeGreaterThan(size.height * 0.6);
        expect((await inked(page))[0]?.inked ?? 0, kit).toBeGreaterThan(0.01);
        await shoot(page, info, `${kit}-${size.name}`);
      }
    });
  });
}
