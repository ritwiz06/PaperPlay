# ADR-0001: Stack for month one

- Status: accepted
- Date: 2026-09-28
- Decided by: the project owner in the build brief (§2), recorded in the G1 kickoff
  session with the version pins found that day

## Context

PaperPlay has to be deterministic, testable and reproducible from a clean checkout. One
developer builds it in 30 days, on Windows PowerShell and macOS alike. The brief fixes
the month-one stack and asks for the productization path to be written down so that
nobody reaches for it early.

## Decision

- **Workspaces:** npm workspaces over `apps/*` and `packages/*`. No orchestration
  framework: plain functions and a small state machine.
- **Runtime:** Node 24 LTS, pinned exactly to 24.21.0 in `.node-version`. `engines` with
  `engine-strict` blocks installs on other majors, and `check:gate` refuses evidence
  produced on any other version.
- **Language:** TypeScript 6.0, strict, NodeNext resolution, with
  `noUncheckedIndexedAccess`, `verbatimModuleSyntax` and `erasableSyntaxOnly`. It is
  pinned below 6.1 because typescript-eslint 8.71 supports only TypeScript below 6.1.
  TypeScript 7 (the native compiler, npm's `latest` today) is revisited once
  typescript-eslint supports it.
- **Packages run from source:** each package's `exports` points at `src/index.ts`,
  relative imports carry `.ts` extensions, and Node 24 runs TypeScript directly by type
  stripping (scripts, the API). Vite and Vitest compile the same files, so there is no
  build step between packages.
- **Web:** React 19.3 on Vite 8 with `@vitejs/plugin-react` 6. The renderer was planned
  as Canvas 2D at G1, behind an interface a Three.js renderer could replace later; ADR-0004
  (2026-09-30) supersedes this and uses Three.js from G1.
- **API:** Fastify 5. Artifacts are JSON files on disk; SQLite through `better-sqlite3`
  only if listing and filtering become painful.
- **Contracts:** Zod 4.6 with strict objects throughout. Documents persisted on their own
  carry a `schemaVersion` literal.
- **Tests:** Vitest 5, one project per workspace, a JSON report, no `passWithNoTests`, and
  `.only` is an error. Playwright 1.63 on Chromium only, with no retries.
- **Lint:** ESLint 10 flat config with type-aware typescript-eslint,
  `eslint-plugin-react-hooks`, and boundary rules. Primitives cannot call `Math.random`,
  read the clock, or import UI, app or Node modules; contracts import only zod.
- **Companion dev packages** approved by the owner on 2026-09-28: `typescript-eslint`,
  `@eslint/js`, `@types/react`, `@types/react-dom`, `@types/node@24`,
  `@vitejs/plugin-react`, `eslint-plugin-react-hooks`.
- **`@axe-core/playwright`** approved by the owner on 2026-10-01, for the R12 accessibility
  scan in `test:e2e`. It is to be added at the start of G2.

## Productization path: after G5, not now

Port the `apps/api` job runner to Trigger.dev, artifacts to Neon Postgres with Drizzle,
auth to Clerk, and the shell to Next.js (the `code-with-antonio/sandbox` reference stack).
`packages/*` stay framework-agnostic so they move unchanged. Starting any of this before
G5 needs a new ADR.

## Consequences

- There is no compile step in development. `npm run typecheck` is the type gate, and it
  checks every workspace's source and tests separately, so primitives and contracts
  source cannot see DOM or Node types.
- Code that Node runs directly must use erasable TypeScript only (no enums, namespaces or
  parameter properties); the compiler enforces this.
- Moving past TypeScript 6.0 is blocked on typescript-eslint.
- Every script is plain Node, so it behaves the same under `npm.cmd` on Windows and `npm`
  on macOS.
