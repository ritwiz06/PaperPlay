import { defineConfig, devices } from "@playwright/test";
import { HOST, testBuiltPort, testWebPort } from "./scripts/machine/ports.ts";

// The tests' own servers, on their own ports from settings, never the ones a person has open (ADR-0059).
const port = testWebPort();
const origin = `http://${HOST}:${port}`;
/** The production build, served as Vercel will serve it, with vercel.json's headers (ADR-0017). */
const BUILT_ORIGIN = `http://${HOST}:${testBuiltPort()}`;

// Chromium only. No retries, so a flaky test fails instead of passing on a second try.
// WebGL is forced onto SwiftShader (software) so the stage renders the same way on any
// machine, with or without a GPU; the stage test asserts that this really happened.
export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: true,
  retries: 0,
  fullyParallel: true,
  // A third of the cores locally. On 2026-10-19 the suite took 122 s at 6 workers and 139 s at 9 on a
  // 12-core M3 Pro; by 2026-10-28 it had grown to 127 tests, and 6 workers' software WebGL, beside
  // another app's work on the same machine, loaded it past 40 and cost first frames their 5 s.
  // Fewer workers, never longer timeouts (ADR-0051, ADR-0059).
  workers: process.env["CI"] ? undefined : "33%",
  reporter: [["list"], ["json", { outputFile: "reports/playwright.json" }]],
  use: { baseURL: origin, trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
      },
    },
  ],
  webServer: [
    {
      command: "npm run dev --workspace @paperplay/web",
      env: { PAPERPLAY_WEB_PORT: String(port) },
      url: origin,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "npm run build && node scripts/serve-dist.ts",
      url: BUILT_ORIGIN,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
