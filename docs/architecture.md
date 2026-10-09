# Architecture

How PaperPlay fits together today. The concepts named here are explained in
[concepts.md](concepts.md); why things are this way is in [decisions/](decisions/).

## Package map

| Path | Job | Key exports or entry points |
|---|---|---|
| `packages/contracts` | Zod schemas and inferred types: the shared language | `Origin`, `Anchor`, `SourceManifest`, `PrimitiveRef`, `Action`, `RunEvent`, `RunRecord`, `JobState`, `WorldSpec` (with `Level`, `Counterfactual`, `DepthVariant`, `DesignSpec`, `PlaceholderAnchor`, `PendingSource`) |
| `packages/primitives` | Deterministic, fixed-step scientific models, their registry, and run replay | `flockPlanarWeighted`, `flockNeighbours` (Q1), `flockHeadings` (Q2), `flockReadsAsOneGroup` (O1), `mulberry32`, `registry`, `runEvents`, `replayRecord` |
| `packages/ui` | Design tokens, fonts, the stage, the bench and the game-first HUD | `@paperplay/ui/tokens`, `fonts.css`, `components.css`, `hud.css`, `stage-core`, `three-adapter`, `react` |
| `packages/pipeline` | Agent roles, model adapters, checks, controller | `buildWorld`, the deterministic builder in `src/builder/` (ADR-0016); the agents and adapters arrive at G3 |
| `apps/web` | React shell: owns the run, renders state, submits actions | `src/world/session.ts`, `src/world/LocalWorld.tsx` at `/world/local`, `src/world/local-world.ts`; `src/hook/HookWorld.tsx` at `/world/hook`, the hook level on the game-first shell, hard-coded until WorldSpec; the dev-only capture page `capture.html` with `src/capture/` (ADR-0010) |
| `apps/api` | Fastify API: will hold secrets and run jobs | `GET /health` only, until G3 |
| `scripts/` | Gate, docs checker, defaults sweep, hook seed, group-measure sweep, demo capture | `check-gate.ts`, `check-docs.ts`, `sweep-defaults.ts`, `hook-seed.ts`, `group-measure.ts`, `capture-demo.ts` |
| `fixtures/oracles/` | Hand-derived expected behaviours for primitives | See `fixtures/oracles/README.md` |
| `fixtures/worldspecs/` | Authored WorldSpecs | `flocking-reference.json`, a draft with placeholder anchors until the source map exists |
| `fixtures/bindings/` | Hand-written binding fixtures: the variable each level's control must move, its fork and setup | `flocking-reference.json` |
| `eval/` | Sweeps now; the frozen protocol and raw attempts from G4 | `eval/sweeps/` |
| `tests/e2e/` | Playwright browser tests on Chromium | `world.spec.ts` [R04], `hook.spec.ts` [R05] [R06], `accessibility.spec.ts` [R12], `stage.spec.ts`, `fonts.spec.ts`, `smoke.spec.ts` |

Inside `packages/ui`:
- **`src/tokens.ts`:** the accepted palette.
- **`src/fonts/`:** the self-hosted typefaces, Fredoka and Literata, declared in
  `fonts.css` as `@paperplay/ui/fonts.css` (ADR-0002).
- **`src/stage-core/`:** pure presentation; turns states into a `FrameDescription`. It also
  holds the view window and free rectangle (`screen.ts`) and the compass's geometry
  (`compass.ts`) (ADR-0012).
- **`src/three-adapter/`:** turns a `FrameDescription` into a Three.js scene: birds as a
  body and two hinged wings, trails as ribbons, and the valley with its meadow, lake, trees,
  rocks, sky and sun (ADR-0013).
- **`src/react/`:** they display what a driver gives them and report what the learner does.
  - From G1: WorldStage, LabBench, Readout, and the origin chip and legend (ADR-0007).
  - The game-first HUD (ADR-0008, ADR-0012), styled by `hud.css`: LevelCard, Guide,
    PaperJournal, LevelMap, DepthToggle, HeadingCompass, OriginTag and `useFreeRect`.

## Dependency directions

An arrow means "may import". Dotted arrows are type-only imports.

```mermaid
flowchart LR
  web["apps/web"] --> primitives["packages/primitives"]
  web --> react["packages/ui · react"]
  web --> stagecore["packages/ui · stage-core"]
  web -.-> contracts
  react --> stagecore
  react --> adapter["packages/ui · three-adapter"]
  react -.-> contracts
  react --> reactlib(["react"])
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
- `three-adapter` importing `primitives` or `contracts` in any form;
- `react` (the components) importing simulation values: types only, and React, from outside its package.

`packages/pipeline` has no imports yet.

## Data flow

```mermaid
flowchart LR
  seed[("seed + params")] --> init["primitive.init"]
  init --> state["FlockState"]
  learner(["learner: controls, clicks, keys"]) --> session["apps/web session<br/>records events at the current step"]
  session --> events[("events: param · place · remove")]
  events --> loop
  state --> loop["fixed-step loop<br/>advance → step / apply"]
  loop --> state
  state --> query["primitive neighbourhood query"]
  query --> emphasis["emphasis: picked bird and neighbours"]
  emphasis --> describe
  state --> describe["stage-core.describeFrame<br/>(previous, current, alpha)"]
  describe --> frame["FrameDescription"]
  frame --> apply["three-adapter.applyFrame"]
  apply --> canvas["WebGL canvas"]
  state --> measure["primitive.measure"]
  measure --> readouts["readouts, at most 10 Hz"]
  record[("RunRecord runrecord/2")] --> replay["replayRecord · runEvents"]
  replay --> measure
```

1. **The simulation moves only in fixed steps.** The session in `apps/web` takes whole
   1/60 s steps from `advance`, records each learner action as an event at the current
   step, applies it through `apply` or the parameter schema, and calls `step`. Its own
   plan replays through `runEvents` to the same state, bit for bit.
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
| WorldSpec, with Level, Counterfactual, DepthVariant, DesignSpec; drafts may hold placeholder anchors and a pending source | `worldspec/1` | `packages/contracts/src/worldspec.ts` (ADR-0016) |
| `flock.planar.weighted` | 3.0.0: equations E1–E18, with the group measure of ADR-0015 (E14 groups, E18 stray share) and its reading O1, "one group"; defaults per ADR-0003, alignment range 0–4; and the read-only queries Q1 (neighbourhoods) and Q2 (headings), which do not change the version | `packages/primitives/src/flock/MODEL.md` |
| Oracle fixtures | `oracle/1` | `fixtures/oracles/README.md` |
| FrameDescription, with FrameEmphasis | Unversioned: in-process only, never persisted | `packages/ui/src/stage-core/frame.ts` |
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
| Every WorldSpec level has exactly one manipulable and one counterfactual; the hook comes first; paper-derived statements carry anchors; counterfactuals override parameters only; a bonus level claims nothing from the paper; a reviewed spec holds no placeholder | Zod refinements, with tests [R03] | `packages/contracts/src/worldspec.ts`, `packages/contracts/test/worldspec.test.ts` |
| Each level's control moves its declared engine variable, its fork applies exactly its overrides, and its setup lands at step 0 | Hand-written binding fixtures, run through the engine and compared with the primitive stepped directly [R08] | `fixtures/bindings/`, `packages/pipeline/test/bindings.test.ts` |
| The builder refuses what the registry contradicts and what the shell cannot draw, is deterministic, and calls no model | Tests [R08]; lint keeps it to contracts and primitives | `packages/pipeline/test/builder.test.ts`, `eslint.config.js` |
| The renderer never changes an observable, even with a bird picked, the view framed in a HUD's window, or the flock coloured by heading with wingbeats and trails | Test [R02]; in the browser, colour by heading records nothing and the run matches Node bit for bit [R02] | `packages/ui/test/render-invariance.test.ts`, `tests/e2e/world.spec.ts` |
| Every colour on the heading wheel keeps 3:1 against the meadow; trails never cross a seam and stay under 3.5 units | Tests | `packages/ui/test/world-art.test.ts` |
| The following camera keeps the flock's centre inside the HUD's free rectangle, and is the still overview under reduced motion | Browser tests | `tests/e2e/hook.spec.ts` |
| The HUD at rest covers at most 25% of 1440 × 900 and 35% of 390 × 844, and the stage frames the field inside the rectangle it leaves free | Browser tests that measure the HUD's boxes and read the stage's own fit; unit tests on the fit | `tests/e2e/hook.spec.ts`, `packages/ui/test/screen.test.ts` |
| The compass's arrow is the primitive's mean heading (Q2) and agreement (E12), and its ticks point where the birds fly on screen | Tests | `packages/primitives/test/flock.headings.test.ts`, `packages/ui/test/compass.test.ts` |
| The stage core is framework-free, with type-only simulation imports | A tsconfig without the DOM library; lint | `packages/ui/src/stage-core/tsconfig.json`, `eslint.config.js` |
| The adapter never reads or writes simulation state | Lint and an import test | `packages/ui/test/three-adapter.test.ts` |
| The React stage and bench import no simulation code | Lint (types only) | `eslint.config.js` |
| A live session replays exactly from its own record | Test [R04]: `runEvents` on the session's plan reaches its state bit for bit | `apps/web/test/session.test.ts` |
| A control moves the engine parameter, and readouts show the primitive's values | Browser tests [R04], compared with Node bit for bit | `tests/e2e/world.spec.ts` |
| Readouts update at most ten times a second, never once per frame | `readoutDue`, tested; the stage's loop calls it | `packages/ui/test/fixed-step.test.ts`, `packages/ui/src/react/WorldStage.tsx` |
| The local world's controls are valid actions on the primitive's variables, within its ranges | Test | `apps/web/test/session.test.ts` |
| The page's palette equals the stage's tokens | Test | `packages/ui/test/tokens.test.ts` |
| The opening seed follows ADR-0003's rule, under the group measure's reading O1 | A test re-runs the rule | `scripts/test/hook-seed.test.ts` |
| The group measure meets the owner's criteria: random scatters read as one group in under 1% of seeds (95% upper bound), and seed 4 reads as one group at 20 s | A test re-runs the sweep, checks both, and holds `eval/sweeps/group-measure.md` to a fresh run byte for byte; its evaluation copy of the measure equals the primitive's | `scripts/test/group-measure.test.ts` |
| Replay refuses another primitive version and out-of-range events | Tests [R07] | `packages/primitives/test/replay.test.ts` |
| Evidence comes only from the pinned runtime | The gate's runtime check, locally and in CI | `scripts/check-gate.ts`, `.github/workflows/check-gate.yml` |
| No skipped tests, no missing scripts, no pass-with-no-tests | The gate's evidence rules; Vitest (`passWithNoTests` and `allowOnly` both false); Playwright (`forbidOnly`, no retries) | `scripts/gate/evidence.ts`, `vitest.config.ts`, `playwright.config.ts` |
| Each gate requirement has passing tagged tests | `check:gate` | `gates.json` |
| Docs stay consistent with the repository | `check:docs`, inside `check:gate` | `scripts/docs/check.ts` |
| Browser tests render WebGL in software | Launch flags, and a test that asserts SwiftShader was used | `playwright.config.ts`, `tests/e2e/stage.spec.ts` |
| Fonts come from the page's own origin, and only the shipped weights are declared or rendered | A unit test on the font files; a browser test that blocks off-origin requests | `packages/ui/test/fonts.test.ts`, `tests/e2e/fonts.spec.ts` |
| `/world/local` has no WCAG 2.x A or AA violation that axe can detect, in four states, at 1280 and 360 px | Browser tests [R12] | `tests/e2e/accessibility.spec.ts` |
| The demo capture advances a fixed two steps per video frame, replays from its own record, and ends on one group; its scripted camera never jumps and is the same every run | Tests, on both runtimes | `apps/web/test/demo-script.test.ts`, `scripts/test/capture.test.ts` |
| **Per runtime:** the demo capture's bytes are the same on every run | Two runs on macOS arm64 and two on Linux x86-64 in CI, each pair byte-identical. The two runtimes give different bytes (see Claims per runtime) | 2026-10-09 logs; `.github/workflows/check-gate.yml` (capture job) |
| The capture page never ships | The production build has one entry, `index.html` | `apps/web/vite.config.ts` (Vite's default input) |
| Secrets stay server-side | Not yet enforced (G3) | — |

## Runtime and tooling

- **Node 24.21.0,** pinned three ways: `.node-version`, `engines` with `engine-strict`, and
  the gate's runtime check. Node runs TypeScript directly (type stripping), so scripts and
  the API need no build.
- **TypeScript 6.0, strict and NodeNext.** Each workspace typechecks its source and its tests
  separately, and `npm run typecheck` covers the browser tests in `tests/e2e` too. It is pinned below 6.1 for typescript-eslint (ADR-0001).
- **Web:** Vite 8, React 19.3, and Three.js 0.186 (ADR-0004).
- **Tests and lint:** Vitest 5, with one project per workspace (`apps/web` included) and a JSON report. Playwright
  1.63 runs on Chromium with forced SwiftShader, and `@axe-core/playwright` 4.13 runs the
  axe scans. ESLint 10 has type-aware rules and the
  boundary rules above.
- **CI:** `.github/workflows/check-gate.yml` runs `check:gate` on ubuntu-latest, with the
  Node in `.node-version`, on every push and pull request. On `main` and on demand, a second
  job films the demo capture on Linux, so its hashes can be compared with the Mac's
  (ADR-0011). Every invariant below is checked on both runtimes:
  - macOS on arm64, locally;
  - Linux on x86-64, in CI.

  A claim that holds on one runtime only says so.

### Claims per runtime

Found on 2026-10-09, when CI first ran (session log 2026-10-09-2).

- **Hold on both runtimes:** every test in the gate. That includes:
  - the bitwise determinism and replay tests, within a runtime (R01);
  - the oracle fixtures;
  - the hook-seed rule (seed 5 since flock 3.0.0);
  - the group measure's sweep;
  - the demo script's one-group property;
  - render invariance (R02);
  - the browser tests.
- **Per runtime: the demo capture's bytes.**
  - Each runtime makes byte-identical frames and videos on every run.
  - macOS arm64 and Linux x86-64 make different bytes from the same code, Chromium
    153.0.8010.12 and SwiftShader.
  - The frames differ by rendering noise only. Mean difference 0.14–0.23 of 255, at most
    19, and under 0.07% of pixels differ by more than 8.
  - Bird pixels overlap 99.3–99.6% at 0, 7.5 and 14.9 s, so the run itself agrees across
    runtimes and the drawing differs. The likeliest cause is SwiftShader's code generation
    on the two architectures.
- **Canonical for published captures:** CI's capture job on a pinned `ubuntu-24.04` image
  (owner, 2026-10-09; ADR-0010).
- **Not compared across runtimes:** R01's bit-identical observables are a within-runtime
  claim, as R01 says ("on one runtime"). No test yet compares a Mac run with a Linux run
  bit for bit.
- **Libraries:** Zod 4.6 for contracts, Fastify 5 for the API.
- **Scripts:**
  - `check:gate` runs typecheck, lint, check:docs, test, build and test:e2e, then checks
    the evidence;
  - `check:docs` checks the documentation;
  - `sweep:defaults` reproduces ADR-0003's sweep;
  - `choose:hook-seed` re-applies ADR-0003's hook-seed rule;
  - `sweep:groups` re-runs ADR-0015's group-measure sweep, and exits 1 if a criterion fails;
  - `capture:demo` films the demo video into the git-ignored `captures/`, and with
    `-- --frames` a lossless PNG sequence too (ADR-0010).
- **The local world's settings** live in `apps/web/src/world/local-world.ts`. They are
  teaching choices: the hook seed now, and its levels until WorldSpec arrives at G2.

## Changes

| Date | Commit | Change |
|---|---|---|
| 2026-09-28 | c18488d | Monorepo skeleton; contracts (G1 subset); `flock.planar.weighted@1.0.0`; `check:gate` with requirement evidence |
| 2026-09-30 | a5ca4df | `runrecord/2`; flock 2.0.0 (named entities, `apply`, `stateSchema`); the replay engine |
| 2026-09-30 | cdaf66f | Flock 2.1.0 defaults; the sweep scripts and `eval/sweeps/` |
| 2026-09-30 | f89a2db | `packages/ui` (tokens, stage-core, three-adapter); `apps/web` draws the stage; Playwright on SwiftShader |
| 2026-10-01 | c84333d | `check:docs` runs inside every gate |
| 2026-10-01 | a93e033 | Flock 2.2.0: alignment's range widens to 0–4 |
| 2026-10-01 | ef7eb32 | The hook seed (4) in `apps/web/src/world/local-world.ts`, with `choose:hook-seed` and a drift test |
| 2026-10-01 | 788a1a3 | Self-hosted fonts in `packages/ui/src/fonts`, exported as `@paperplay/ui/fonts.css` |
| 2026-10-01 | 109e9c6 | The read-only neighbourhood query `flockNeighbours` (Q1) |
| 2026-10-01 | 73c491e | `FrameEmphasis`, picking, rings; the fit backs off in inverse proportion to the aspect; fog keeps its distance |
| 2026-10-01 | 107a38a | `packages/ui/src/react` (WorldStage, LabBench, origins); the session and `/world/local` in `apps/web`; a Vitest project for `apps/web`; `src/stage/local-stage.ts` removed |
| 2026-10-09 | 3639dfb | The axe scan in `test:e2e` [R12]; `npm run typecheck` covers `tests/e2e` |
| 2026-10-09 | edfadad | `npm run capture:demo`: the dev-only capture page, the demo script, Playwright's ffmpeg (ADR-0010) |
| 2026-10-09 | 0d740e4 | CI on GitHub Actions (ADR-0011) |
| 2026-10-09 | 90fc458 | Flock query Q2, headings |
| 2026-10-09 | a7e30ce | Stage core: the view window, `screen.ts`, `compass.ts`; the adapter draws the frame's projection (ADR-0012) |
| 2026-10-09 | 15673c8 | The game-first HUD in `packages/ui/src/react`, with `hud.css` (ADR-0008) |
| 2026-10-09 | 445912e | `/world/hook` on the shell |
| 2026-10-09 | 2d9768e | Stage core: colour by heading, wingbeats, trails, a camera target, `flockCentre` (ADR-0013) |
| 2026-10-09 | 4d3bcce | The adapter's low-poly valley and birds: wings, trails, terrain, lake, trees, rocks, sky, sun |
| 2026-10-09 | b27240e | WorldStage's `framing` and `look`; the session's trail history |
| 2026-10-09 | 7c12a97 | The capture's scripted camera path; `StageDriver.camera()` |
| 2026-10-09 | 5d87b66 | Flock 3.0.0: the group measure (E14, E18, O1); the hook seed moves to 5, and the demo capture names seed 4 (ADR-0015) |
| 2026-10-09 | f37c9a9 | `npm run sweep:groups` and `eval/sweeps/group-measure.md` |
| 2026-10-09 | 0afc49d | `worldspec/1` in `packages/contracts`; `Action` is built by `actionWith(anchor)` |
| 2026-10-09 | 211f13a | `fixtures/worldspecs/flocking-reference.json`, a draft |
| 2026-10-09 | 4d942fd | The builder in `packages/pipeline/src/builder/`, a Vitest project for the pipeline, and `fixtures/bindings/` |
