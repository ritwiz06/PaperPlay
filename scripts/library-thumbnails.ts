/**
 * npm run library:thumbnails
 *
 * Makes the library's pictures (ADR-0049): serves the app on a port of its own, opens every world
 * the library's index lists, plays it for three seconds with its HUD hidden, and saves its stage as
 * a small JPEG in apps/web/public/library/, which the public build serves. Run it after
 * `npm run library` when a world is added: it makes the pictures that are missing, and with --all,
 * when worlds change how they look, every picture again. The pictures are committed.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const root = join(import.meta.dirname, "..");
const PORT = 4417;
const origin = `http://127.0.0.1:${PORT}`;
const out = join(root, "apps", "web", "public", "library");
const index = JSON.parse(readFileSync(join(root, "apps", "web", "src", "library", "worlds.json"), "utf8")) as { worlds: { id: string; route: string; title: string }[] };

async function waitFor(url: string, seconds: number): Promise<void> {
  for (let tries = 0; tries < seconds * 4; tries++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${url} did not answer within ${seconds} s`);
}

const server = spawn("npm", ["run", "dev", "--workspace", "@paperplay/web", "--", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { cwd: root, stdio: "ignore" });
try {
  await waitFor(origin, 60);
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const all = process.argv.includes("--all");
  for (const world of index.worlds.filter((entry) => all || !existsSync(join(out, `${entry.id}.jpg`)))) {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    await page.goto(`${origin}${world.route}`);
    const stage = page.getByRole("application", { name: "World stage" });
    await stage.waitFor({ timeout: 60_000 });
    await page.waitForFunction("Number(document.querySelector('[data-frames]')?.getAttribute('data-frames') ?? 0) > 0", undefined, { timeout: 60_000 });
    // The picture is of the world, not its controls.
    await page.addStyleTag({ content: ".hud, .guide, .journal, [data-hud] { visibility: hidden !important; }" });
    const play = page.getByRole("button", { name: "Play", exact: true });
    if (await play.isVisible().catch(() => false)) await play.click({ force: true });
    await page.waitForTimeout(3000);
    const file = join(out, `${world.id}.jpg`);
    await page.screenshot({ path: file, type: "jpeg", quality: 72 });
    console.log(`${world.id}: ${Math.round(statSync(file).size / 1024)} KB`);
    await page.close();
  }
  await browser.close();
} finally {
  server.kill();
}
