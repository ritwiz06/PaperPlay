import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findSecrets, secretValues } from "../bundle/secrets.ts";

// The production bundle, built for real into a scratch folder: the Three.js stage arrives as its
// own chunk, after the page and its HUD, so the first chunk a learner downloads holds no Three.js.

const web = fileURLToPath(new URL("../../apps/web/", import.meta.url));
const out = mkdtempSync(join(tmpdir(), "paperplay-bundle-"));
let chunks: { name: string; text: string }[] = [];

beforeAll(async () => {
  // Built as the deploy builds it: Vitest sets NODE_ENV to "test", which would make a development build.
  const environment = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await build({ root: web, configFile: join(web, "vite.config.ts"), logLevel: "silent", mode: "production", build: { outDir: out, emptyOutDir: true } });
  } finally {
    process.env.NODE_ENV = environment;
  }
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

describe("[R09] the production bundle's secrets", () => {
  it("holds no key, key variable or model gateway, nor any value from apps/api/.env where it is present (ADR-0030)", () => {
    const envFile = fileURLToPath(new URL("../../apps/api/.env", import.meta.url));
    const values = existsSync(envFile) ? secretValues(readFileSync(envFile, "utf8")) : [];
    const html = readFileSync(join(out, "index.html"), "utf8");
    expect(findSecrets([...chunks, { name: "index.html", text: html }], values)).toEqual([]);
  });
});

describe("[R09] the production bundle's reach", () => {
  it("holds no /create page and calls no API: the public site only plays worlds built beforehand (ADR-0030)", () => {
    for (const chunk of chunks) {
      expect(chunk.text, chunk.name).not.toContain("/api/");
      expect(chunk.text, chunk.name).not.toContain("Make a world from a paper");
      expect(chunk.text, chunk.name).not.toContain("EventSource");
    }
  });
});

describe("the static deploy configuration (ADR-0017)", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const deploy = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")) as Record<string, unknown>;
  const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;

  it("builds the app with the repository's own build, from a clean install, into Vite's output folder", () => {
    expect(deploy.installCommand).toBe("npm ci");
    expect(deploy.buildCommand).toBe("npm run build");
    // The build is the web app's, then the bundle secret check, so the deploy fails on a leak too (ADR-0030).
    expect(scripts.build).toBe("npm run build --workspace @paperplay/web && node scripts/check-bundle.ts");
    expect(deploy.outputDirectory).toBe("apps/web/dist");
  });

  it("serves the app for every path, so /world/hook loads on a fresh visit", () => {
    expect(deploy.rewrites).toEqual([{ source: "/(.*)", destination: "/index.html" }]);
  });
});
