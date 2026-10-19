import { defineConfig, devices } from "@playwright/test";

const port = 4317;
const origin = `http://127.0.0.1:${port}`;
/** The production build, served as Vercel will serve it, with vercel.json's headers (ADR-0017). */
const BUILT_ORIGIN = "http://127.0.0.1:4318";

// Chromium only. No retries, so a flaky test fails instead of passing on a second try.
// WebGL is forced onto SwiftShader (software) so the stage renders the same way on any
// machine, with or without a GPU; the stage test asserts that this really happened.
export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: true,
  retries: 0,
  fullyParallel: true,
  // Half the cores locally, measured on 2026-10-19 on a 12-core M3 Pro: the suite took 122 s at 6
  // workers and 139 s at 9, one test failing its first frame; software WebGL is CPU-bound (ADR-0051).
  workers: process.env["CI"] ? undefined : "50%",
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
      command: `npm run dev --workspace @paperplay/web -- --host 127.0.0.1 --port ${port} --strictPort`,
      url: origin,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "npm run build && node scripts/serve-dist.ts --port 4318",
      url: BUILT_ORIGIN,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
