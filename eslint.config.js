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
    // Claude Code's agent worktrees: full copies of the repository, linted where they live.
    "**/.claude/worktrees/",
    // The modules the writer comparison kept: a model's output, kept as data for review (ADR-0058).
    "eval/bakeoff/writer/",
    // The training's own Python environment, which git ignores (ADR-0057).
    "**/.venv/",
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
    // A generated mechanism is a plain script whose one name, `mechanism`, its sandbox reads (ADR-0058).
    files: ["fixtures/mechanisms/**/*.js"],
    languageOptions: { sourceType: "script" },
    rules: { "@typescript-eslint/no-unused-vars": ["error", { varsIgnorePattern: "^mechanism$" }] },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}", "packages/ui/src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    // Primitives compute science: seeded, clock-free, and unaware of any UI or runtime.
    files: ["packages/primitives/src/**/*.ts"],
    rules: {
      // A model given as data is interpreted by closures, never compiled from text (the deploy's CSP forbids it too).
      "no-eval": "error",
      "no-new-func": "error",
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
    // The stage core is pure presentation: it may read simulation types, never run the
    // simulation, and it knows nothing of Three.js, React or the DOM.
    files: ["packages/ui/src/stage-core/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@paperplay/primitives", allowTypeImports: true, message: "The stage core reads simulation state; it never runs the simulation." },
            { name: "@paperplay/contracts", allowTypeImports: true, message: "The stage core reads contract types only." },
          ],
          patterns: [
            { regex: "^@paperplay/primitives/", allowTypeImports: true, message: "The stage core reads a family's simulation types; it never runs the simulation." },
            {
              regex: "^(?!@paperplay/(primitives|contracts)(/[a-z]+)?$|\\.{1,2}/)",
              message: "The stage core is framework-free: no Three.js, React or DOM libraries.",
            },
          ],
        },
      ],
    },
  },
  {
    // The adapter draws frame descriptions; it cannot even import the packages that hold simulation state.
    files: ["packages/ui/src/three-adapter/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^@paperplay/(primitives|contracts)",
              message: "The Three.js adapter never reads or writes simulation state: draw from the FrameDescription.",
            },
          ],
        },
      ],
    },
  },
  {
    // The React stage and bench display state and report actions. They may read simulation
    // types, but never import simulation code: the app hands them a driver.
    files: ["packages/ui/src/react/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@paperplay/primitives", allowTypeImports: true, message: "The React stage and bench display state; they never run the simulation." },
            { name: "@paperplay/contracts", allowTypeImports: true, message: "The React stage and bench read contract types only." },
          ],
          patterns: [
            { regex: "^@paperplay/primitives/", allowTypeImports: true, message: "The React stage and bench read a family's simulation types; they never run the simulation." },
            {
              regex: "^(?!react$|react/|@paperplay/(primitives|contracts)(/[a-z]+)?$|\\.{1,2}/)",
              message: "The React layer imports React, its own package's modules, and simulation types only.",
            },
          ],
        },
      ],
    },
  },
  {
    // The builder is deterministic: it interprets a WorldSpec against the registry and calls no model.
    files: ["packages/pipeline/src/builder/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!@paperplay/(contracts|primitives)(/[a-z]+)?$|\\.{1,2}/)",
              message: "The builder may import only @paperplay/contracts, @paperplay/primitives (a family's entry point included) and its own modules: no model client, network or UI.",
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
