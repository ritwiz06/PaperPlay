import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The production bundle, built for real into a scratch folder: the Three.js stage arrives as its
// own chunk, after the page and its HUD, so the first chunk a learner downloads holds no Three.js.

const web = fileURLToPath(new URL("../../apps/web/", import.meta.url));
const out = mkdtempSync(join(tmpdir(), "paperplay-bundle-"));
let chunks: { name: string; text: string }[] = [];

beforeAll(async () => {
  await build({ root: web, configFile: join(web, "vite.config.ts"), logLevel: "silent", build: { outDir: out, emptyOutDir: true } });
  const assets = join(out, "assets");
  chunks = readdirSync(assets)
    .filter((name) => name.endsWith(".js"))
    .map((name) => ({ name, text: readFileSync(join(assets, name), "utf8") }));
}, 60_000);

afterAll(() => rmSync(out, { recursive: true, force: true }));

describe("the production bundle", () => {
  it("loads the Three.js stage as its own chunk, never in the entry chunk", () => {
    const html = readFileSync(join(out, "index.html"), "utf8");
    const entries = chunks.filter((chunk) => html.includes(chunk.name));
    expect(entries.map((chunk) => chunk.name)).toHaveLength(1);
    // Three.js names its renderer's class in the bundle; only the stage chunk may hold it.
    const holding = chunks.filter((chunk) => chunk.text.includes("WebGLRenderer"));
    expect(holding.map((chunk) => chunk.name)).toEqual([expect.stringMatching(/^three-adapter-/)]);
    expect(entries[0]?.text.includes("WebGLRenderer")).toBe(false);
  });
});

describe("the static deploy configuration (ADR-0017)", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const deploy = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")) as Record<string, unknown>;
  const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;

  it("builds the app with the repository's own build, from a clean install, into Vite's output folder", () => {
    expect(deploy.installCommand).toBe("npm ci");
    expect(deploy.buildCommand).toBe("npm run build");
    expect(scripts.build).toBe("npm run build --workspace @paperplay/web");
    expect(deploy.outputDirectory).toBe("apps/web/dist");
  });

  it("serves the app for every path, so /world/hook loads on a fresh visit", () => {
    expect(deploy.rewrites).toEqual([{ source: "/(.*)", destination: "/index.html" }]);
  });
});
