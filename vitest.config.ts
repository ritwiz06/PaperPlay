import { defineConfig } from "vitest/config";

// One project per workspace that has unit tests. A run with no test files fails
// (passWithNoTests stays false) and `.only` is an error, so nothing is skipped silently.
export default defineConfig({
  test: {
    passWithNoTests: false,
    allowOnly: false,
    reporters: ["default", "json"],
    outputFile: { json: "reports/vitest.json" },
    projects: [
      {
        extends: true,
        test: { name: "contracts", environment: "node", include: ["packages/contracts/test/**/*.test.ts"] },
      },
      {
        extends: true,
        test: { name: "primitives", environment: "node", include: ["packages/primitives/test/**/*.test.ts"] },
      },
      {
        extends: true,
        test: { name: "api", environment: "node", include: ["apps/api/test/**/*.test.ts"] },
      },
      {
        extends: true,
        test: { name: "tooling", environment: "node", include: ["scripts/test/**/*.test.ts"] },
      },
    ],
  },
});
