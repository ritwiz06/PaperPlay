# Architecture

How PaperPlay fits together today. The concepts named here are explained in
[concepts.md](concepts.md); why things are this way is in [decisions/](decisions/).

## Package map

| Path | Job | Key exports or entry points |
|---|---|---|
| `packages/contracts` | Zod schemas and inferred types: the shared language | `Origin`, `Anchor`, `SourceManifest`, `PrimitiveRef`, `Action`, `RunEvent`, `RunRecord`, `JobState` |
| `packages/primitives` | Deterministic, fixed-step scientific models, their registry, and run replay | `flockPlanarWeighted`, `mulberry32`, `registry`, `runEvents`, `replayRecord` |
| `packages/ui` | Design tokens and the stage, in three parts | `@paperplay/ui/tokens`, `@paperplay/ui/stage-core`, `@paperplay/ui/three-adapter` |
| `packages/pipeline` | Agent roles, model adapters, checks, controller | Empty until G3 |
| `apps/web` | React shell: owns the fixed-step loop, renders state, submits actions | `src/stage/local-stage.ts` |
| `apps/api` | Fastify API: will hold secrets and run jobs | `GET /health` only, until G3 |
| `scripts/` | Gate, docs checker, defaults sweep | `check-gate.ts`, `check-docs.ts`, `sweep-defaults.ts` |
| `fixtures/oracles/` | Hand-derived expected behaviours for primitives | See `fixtures/oracles/README.md` |
| `eval/` | Sweeps now; the frozen protocol and raw attempts from G4 | `eval/sweeps/` |
| `tests/e2e/` | Playwright browser tests on Chromium | `smoke.spec.ts`, `stage.spec.ts` |

Inside `packages/ui`:
- **`src/tokens.ts`:** the accepted palette.
- **`src/stage-core/`:** pure presentation; turns states into a `FrameDescription`.
- **`src/three-adapter/`:** turns a `FrameDescription` into a Three.js scene.

## Dependency directions

An arrow means "may import". Dotted arrows are type-only imports.

```mermaid
flowchart LR
  web["apps/web"] --> primitives["packages/primitives"]
  web --> stagecore["packages/ui · stage-core"]
  web --> adapter["packages/ui · three-adapter"]
  primitives --> contracts["packages/contracts"]
  stagecore -.-> primitives
  stagecore --> tokens["packages/ui · tokens"]
  adapter -.-> stagecore
  contracts --> zod(["zod"])
  primitives --> zod
  adapter --> three(["three"])
  api["apps/api"] --> fastify(["fastify"])
```

Forbidden, and enforced (see the invariants table below):
- `contracts` importing anything but zod;
- `primitives` importing UI, apps, the pipeline or Node;
- `stage-core` importing Three.js, React or DOM libraries, or importing simulation values;
- `three-adapter` importing `primitives` or `contracts` in any form.

`packages/pipeline` has no imports yet.

## Data flow

```mermaid
flowchart LR
  seed[("seed + params")] --> init["primitive.init"]
  init --> state["FlockState"]
  events[("events: param · place · remove")] --> loop
  state --> loop["fixed-step loop<br/>advance → step / apply"]
  loop --> state
  state --> describe["stage-core.describeFrame<br/>(previous, current, alpha)"]
  describe --> frame["FrameDescription"]
  frame --> apply["three-adapter.applyFrame"]
  apply --> canvas["WebGL canvas"]
  state --> measure["primitive.measure"]
  measure --> readouts["readouts, at most 10 Hz"]
  record[("RunRecord runrecord/2")] --> replay["replayRecord · runEvents"]
  replay --> measure
```

1. **The simulation moves only in fixed steps.** `apps/web` takes whole 1/60 s steps from
   `advance`, applies learners' edits through `apply`, and calls `step`.
2. **Drawing reads finished states.** `describeFrame` receives the two latest states. The
   adapter draws the resulting description, and nothing flows back into the simulation.
3. **Replay rebuilds a run from a record.** It takes a `RunRecord`'s initial state and
   events, then compares every sample within the record's tolerance.

## Contracts and versions

| Contract | Version | Defined in |
|---|---|---|
| SourceManifest | `sourcemanifest/1` | `packages/contracts/src/provenance.ts` |
| RunRecord, with RunEvent (`param` · `place` · `remove`) | `runrecord/2` | `packages/contracts/src/run.ts` |
| Origin, Anchor, PrimitiveRef, Action, JobState | Versioned with the documents that embed them | `packages/contracts/src/` |
| WorldSpec | `worldspec/1`, planned | G2 |
| `flock.planar.weighted` | 2.1.0: equations E1–E17, defaults per ADR-0003 | `packages/primitives/src/flock/MODEL.md` |
| Oracle fixtures | `oracle/1` | `fixtures/oracles/README.md` |
| FrameDescription | Unversioned: in-process only, never persisted | `packages/ui/src/stage-core/frame.ts` |
| Gate definitions | Requirements per gate | `gates.json` |

## Invariants and where they are enforced

| Invariant | Enforced by | Where |
|---|---|---|
| Primitives are seeded and never read a clock | Lint (`Math.random`, `Date.now`, `performance.now` and `new Date` are banned); tests tagged [R01] | `eslint.config.js`, `packages/primitives/test/` |
| Primitives never mutate their inputs | Tests on deep-frozen states | `packages/primitives/test/flock.step.test.ts`, `packages/primitives/test/flock.edits.test.ts` |
| Same seed and events give bit-identical observables | The replay oracle and determinism tests [R01] | `packages/primitives/test/flock.determinism.test.ts` |
| Primitive behaviour matches hand-derived equations | Oracle fixtures [R01] | `fixtures/oracles/`, `packages/primitives/test/flock.oracles.test.ts` |
| Contracts depend only on zod | Lint | `eslint.config.js` |
| Contracts reject unknown keys and enforce their refinements | Tests [R03] | `packages/contracts/test/` |
| The renderer never changes an observable | Test [R02] | `packages/ui/test/render-invariance.test.ts` |
| The stage core is framework-free, with type-only simulation imports | A tsconfig without the DOM library; lint | `packages/ui/src/stage-core/tsconfig.json`, `eslint.config.js` |
| The adapter never reads or writes simulation state | Lint and an import test | `packages/ui/test/three-adapter.test.ts` |
| Replay refuses another primitive version and out-of-range events | Tests [R07] | `packages/primitives/test/replay.test.ts` |
| Evidence comes only from the pinned runtime | The gate's runtime check | `scripts/check-gate.ts` |
| No skipped tests, no missing scripts, no pass-with-no-tests | The gate's evidence rules; Vitest (`passWithNoTests` and `allowOnly` both false); Playwright (`forbidOnly`, no retries) | `scripts/gate/evidence.ts`, `vitest.config.ts`, `playwright.config.ts` |
| Each gate requirement has passing tagged tests | `check:gate` | `gates.json` |
| Docs stay consistent with the repository | `check:docs`, inside `check:gate` | `scripts/docs/check.ts` |
| Browser tests render WebGL in software | Launch flags, and a test that asserts SwiftShader was used | `playwright.config.ts`, `tests/e2e/stage.spec.ts` |
| Secrets stay server-side | Not yet enforced (G3) | — |

## Runtime and tooling

- **Node 24.21.0,** pinned three ways: `.node-version`, `engines` with `engine-strict`, and
  the gate's runtime check. Node runs TypeScript directly (type stripping), so scripts and
  the API need no build.
- **TypeScript 6.0, strict and NodeNext.** Each workspace typechecks its source and its tests
  separately. It is pinned below 6.1 for typescript-eslint (ADR-0001).
- **Web:** Vite 8, React 19.3, and Three.js 0.186 (ADR-0004).
- **Tests and lint:** Vitest 5, with one project per workspace and a JSON report. Playwright
  1.63 runs on Chromium with forced SwiftShader. ESLint 10 has type-aware rules and the
  boundary rules above.
- **Libraries:** Zod 4.6 for contracts, Fastify 5 for the API.
- **Scripts:**
  - `check:gate` runs typecheck, lint, check:docs, test, build and test:e2e, then checks
    the evidence;
  - `check:docs` checks the documentation;
  - `sweep:defaults` reproduces ADR-0003's sweep.

## Changes

| Date | Commit | Change |
|---|---|---|
| 2026-09-28 | c18488d | Monorepo skeleton; contracts (G1 subset); `flock.planar.weighted@1.0.0`; `check:gate` with requirement evidence |
| 2026-09-30 | a5ca4df | `runrecord/2`; flock 2.0.0 (named entities, `apply`, `stateSchema`); the replay engine |
| 2026-09-30 | cdaf66f | Flock 2.1.0 defaults; the sweep scripts and `eval/sweeps/` |
| 2026-09-30 | f89a2db | `packages/ui` (tokens, stage-core, three-adapter); `apps/web` draws the stage; Playwright on SwiftShader |
