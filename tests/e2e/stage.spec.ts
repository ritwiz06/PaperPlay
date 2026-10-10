import { expect, test, type Page } from "@playwright/test";
import { pixelStats } from "./pixels.ts";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("the stage draws a non-blank frame with software WebGL", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");

  const stage = page.getByRole("application", { name: "World stage" });
  await expect.poll(async () => Number((await stage.getAttribute("data-frames")) ?? 0), { timeout: 15_000 }).toBeGreaterThanOrEqual(30);

  const renderer = await page.evaluate(() => {
    const gl = document.querySelector("canvas")?.getContext("webgl2");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    return gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null;
  });
  expect(renderer).toContain("SwiftShader");

  const canvas = page.getByRole("img", { name: /flock of 72 birds/ });
  const { variance, colours } = await pixelStats(page, await canvas.screenshot());
  expect(variance).toBeGreaterThan(64);
  expect(colours).toBeGreaterThan(16);
  expect(errors).toEqual([]);
});

test("explains itself plainly when WebGL is unavailable", async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- re-invoked below with .call(this) on the same canvas
    const original = HTMLCanvasElement.prototype.getContext;
    const blocked = new Set(["webgl", "webgl2", "experimental-webgl"]);
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
      return blocked.has(kind) ? null : (original as (this: HTMLCanvasElement, ...args: unknown[]) => unknown).call(this, kind, ...rest);
    } as typeof original;
  });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "This world needs WebGL" })).toBeVisible();
  await expect(page.getByText("hardware acceleration")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(errors).toEqual([]);
});
