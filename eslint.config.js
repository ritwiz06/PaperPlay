// @ts-check
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    "**/node_modules/",
    "**/dist/",
    "reports/",
    "test-results/",
    "playwright-report/",
    "reference/",
  ]),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      eqeqeq: ["error", "always"],
      // `const { key: _key, ...rest } = value` is how tests drop one key; the rest is what's used.
      "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }],
    },
  },
  {
    // Files outside a type-aware tsconfig still get syntax-level linting.
    files: ["**/*.js", "apps/web/vite.config.ts"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}", "packages/ui/src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    // Primitives compute science: seeded, clock-free, and unaware of any UI or runtime.
    files: ["packages/primitives/src/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Primitives are seeded: draw from mulberry32 in prng.ts." },
        { object: "Date", property: "now", message: "Primitives must not read the clock." },
        { object: "performance", property: "now", message: "Primitives must not read the clock." },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "NewExpression[callee.name='Date']", message: "Primitives must not read the clock." },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!zod$|@paperplay/contracts$|\\.{1,2}/)",
              message: "Primitives may import only zod, @paperplay/contracts and their own modules.",
            },
          ],
        },
      ],
    },
  },
  {
    // Contracts are the shared language: no runtime dependency besides zod.
    files: ["packages/contracts/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ regex: "^(?!zod$|\\.{1,2}/)", message: "Contracts may depend only on zod." }] },
      ],
    },
  },
);
