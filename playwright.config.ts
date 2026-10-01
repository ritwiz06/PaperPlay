import { defineConfig, devices } from "@playwright/test";

const port = 4317;
const origin = `http://127.0.0.1:${port}`;

// Chromium only. No retries, so a flaky test fails instead of passing on a second try.
// WebGL is forced onto SwiftShader (software) so the stage renders the same way on any
// machine, with or without a GPU; the stage test asserts that this really happened.
export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: true,
  retries: 0,
  fullyParallel: true,
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
  webServer: {
    command: `npm run dev --workspace @paperplay/web -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: origin,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
