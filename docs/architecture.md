# Architecture

How PaperPlay fits together today. The concepts named here are explained in
[concepts.md](concepts.md); why things are this way is in [decisions/](decisions/).

## Package map

| Path | Job | Key exports or entry points |
|---|---|---|
| `packages/contracts` | Zod schemas and inferred types: the shared language, and the families' catalogue as data | `Origin`, `Anchor`, `SourceManifest`, `PrimitiveRef`, `Action`, `RunEvent`, `RunRecord`, `JobState`, `WorldSpec` (with `Level`, `Counterfactual`, `DepthVariant`, `DesignSpec`, `PlaceholderAnchor`, `PendingSource`); `FamilyId`, `FAMILIES` (each with its variation and where its forks start, `forkFrom`, ADR-0029), `Variation`, `SpaceKind`, `TimeUnit` and `TIME_WORDS` (ADR-0025); `ModelSpec`, `Expr` and `Unit`, a compartment model as data (ADR-0028); `SourceRegister`, `SourceText` and `Licence`, what ingest makes of a source (ADR-0031); `WorldSpecV3`, the reader `WorldSpec` for either version, `upgradeWorldSpec`, and the scene kits' manifests `SCENE_KITS` (ADR-0027) |
| `packages/primitives` | Deterministic, fixed-step scientific models in families, their registry, and run replay | The root: the `Primitive` interface (with its `family`, `time`, `space`, `entities` and `queries`), `mulberry32`, `registry`, `runEvents`, `replayRecord`. `@paperplay/primitives/flock`, the agents family's flock in `src/agents/flock/`: `flockPlanarWeighted`, its queries Q1–Q4 by name and as `flockNeighbours`, `flockHeadings`, `flockSpread` and `flockAtRocks`, and `flockReadsAsOneGroup` (O1). `src/spaces/torus.ts`, the shared wrap-around space. `@paperplay/primitives/compartments`, in `src/compartments/` with its MODEL.md: `compartments.ode@1.0.0`, the solver that binds a ModelSpec into a primitive (`compartmentModel`), its RK4 step, its units and its checks (`accuracy` and its measurement `accuracyReport`, `positivity`, `conservation`, `steadyStates`); the registry holds it as a solver (`registry.solver`, ADR-0028) |
| `packages/ui` | Design tokens, fonts, the stage, the bench and the game-first HUD | `@paperplay/ui/tokens`, `fonts.css`, `components.css`, `hud.css`, `stage-core`, `three-adapter`, `react` |
| `packages/pipeline` | Agent roles, model adapters, checks, controller | `buildWorld`, the deterministic builder in `src/builder/` (ADR-0016); `@paperplay/pipeline/ingest`, Node only: the restricted archive, LaTeX, XML and JATS readers and the fetchers (ADR-0031); `@paperplay/pipeline/transcribe`: a transcription's form, its closed formula grammar, conversion to a `ModelSpec` with anchors found in the source, the structural match up to renaming, gold answers and the bake-off's scores (ADR-0032); several value sets in one paper, the rule that picks one and their comparison, in `valuesets.ts` (ADR-0036); `src/sanitise.ts`, the paper-text sanitiser (R09); `@paperplay/pipeline/models`, Node only and never imported by the web app: the vendor-neutral `ModelClient`, recording by the prompt's hash, replay, and the resuming client that replays what is recorded and records the rest, a job's token budget and trace, and structured replies with the plain-JSON fallback (ADR-0030); `summarise` and `claimHolds`, a fork's measured difference (ADR-0018); `sweepLevels`, the level rule, moved here from `scripts/` (ADR-0018); `@paperplay/pipeline/stages`: the router, reader, transcribers, planner, explainer and reviewer as bounded model calls with schemas, the paper sanitised and fenced in every prompt; `@paperplay/pipeline/assemble`: the solver's step, the model's behaviour in numbers, and the world assembled as `worldspec/3`; `src/checks/provenance.ts`; `@paperplay/pipeline/controller`: `runJob`, one job through real states with at most two scoped repairs (ADR-0033) |
| `apps/web` | React shell: owns the run, renders state, submits actions | `src/world/session.ts`, the generic session (`createSession(primitive, view, options)`, ADR-0026), paced by the model's time a second shows (`wallStepOf`), with `startAgain` for a run with an end; `src/world/valley.ts`, the valley kit's view of it and the flocking world's `createWorldSession`; `src/world/town.ts`, the town kit's view, the solver's compartments as shares (ADR-0029); `src/worlds/`, each world the shell plays as a `PlayableWorld`: `flocking.tsx`, and `epidemic.tsx`, which builds `fixtures/worldspecs/kermack-mckendrick-1927.json`; `town-world.tsx`, `townWorld`, any compartment world in the town kit; `GeneratedWorld.tsx` at `/world/generated/<id>`, from `fixtures/worldspecs/generated/`, and on a development server `/world/job/<id>` from the local API (ADR-0034); `src/create/CreatePage.tsx`, `/create`, on a development server only, its storyboard fed by the API's events; `src/world/LocalWorld.tsx` at `/world/local`, `src/world/local-world.ts`; `src/world/authored-world.ts`, which builds `fixtures/worldspecs/flocking-reference.json` with the builder at start-up; `src/hook/HookWorld.tsx`, the shell for any `PlayableWorld`, at `/world/hook` for the flocking world and `/world/epidemic` for Threshold Town, its words following the world's family, its journal with the page of what the world cannot show, and `src/hook/guide.ts`, the guide from each level's script; `src/world/fork.ts`, a level's fork (ADR-0019); `explorationLines` in `src/hook/guide.ts`, guided exploration; the dev-only capture page `capture.html` with `src/capture/` (ADR-0010) |
| `apps/api` | Fastify API: holds the model gateway's key in `apps/api/.env` (ADR-0030) and runs jobs (ADR-0033) | `GET /health`; `POST /jobs`, `GET /jobs/:id`, `DELETE /jobs/:id`, `GET /jobs/:id/events` (server-sent events, resumed by `Last-Event-ID`), `/artifacts/:name` and `/world` (409 until `ready`), bodies at most 16 KB; `src/jobs.ts`, the job store, kept under the git-ignored `apps/api/data/`; `src/runner.ts`, the controller with a per-job budget; `npm run dev:api` replays recordings only; `src/models/`: the Voyager client, its replies streamed and joined, the live client on `node-fetch.ts` (ADR-0030's amendment), `models.json`'s configuration, and the live client, made only under `npm run pipeline:live`; `.env.example` names `VOYAGER_API_KEY` |
| `scripts/` | Gate, docs checker, land, defaults sweep, hook seed, group-measure sweep, levels sweep, demo capture, the built app served as Vercel would | `check-gate.ts` (with `gate/worlds.ts`), `check-docs.ts`, `land.ts` (with `land/land.ts` and `land/guard.ts`, ADR-0009), `hooks/pre-push.ts` and `hooks/install.ts`, `sweep-defaults.ts`, `hook-seed.ts`, `group-measure.ts`, `levels.ts`, `capture-demo.ts`, `serve-dist.ts`, `check-bundle.ts` (with `bundle/secrets.ts`, ADR-0030); `pipeline-live.ts` (with `live/probe.ts` and `bakeoff/`), the only command that calls the model gateway: `models`, `probe`, `bakeoff`, `design`, `rescore` and `report` (which call nothing) and `serve`, the API with live calls for `/create` (ADR-0035); `routing-set.ts`, the router's eight papers; `ingest.ts`, which writes the source register; `threshold-town.ts` (with `fixtures/threshold-town.ts`, where Threshold Town is authored, ADR-0029); `scripts/test/bundle.test.ts` builds the production bundle |
| `fixtures/oracles/` | Hand-derived expected behaviours for primitives | See `fixtures/oracles/README.md` |
| `fixtures/worldspecs/` | Authored WorldSpecs, and generated ones | `flocking-reference.json`, a draft with placeholder anchors until the source map exists; `kermack-mckendrick-1927.json`, Threshold Town; `generated/pmc-PMC12334037.json`, the first generated world, made by a recorded live job (ADR-0035) |
| `fixtures/recordings/` | Every model call, by its prompt's hash: the model and its reply, never the prompt (ADR-0030) | The probe's, the bake-off's and the first generated world's job; tests replay them |
| `fixtures/jobs/` | What each recorded live job was made with: its stages' models, so it replays as made | `pmc-PMC12334037-2026-10-16.json`, the first generated world's job (ADR-0035) |
| `fixtures/records/` | Run records held bit for bit across a refactor | `flocking-seed5/`: the six levels on seed 5 and both worlds of each fork, made at `f0bc31c` before G3a's refactor |
| `fixtures/bindings/` | Hand-written binding fixtures: the variable each level's control must move, its fork and setup | `flocking-reference.json` |
| `eval/` | Sweeps now; the frozen protocol and raw attempts from G4 | `eval/sweeps/` |
| `.githooks/` | The repository's git hooks, which npm's `prepare` script tells git to use | `pre-push`, which refuses any push that would move `main` to a commit land has not recorded (ADR-0009) |
| `tests/e2e/` | Playwright browser tests on Chromium | `world.spec.ts` [R04], `hook.spec.ts` [R05] [R06], `accessibility.spec.ts` [R12], `stage.spec.ts`, `fonts.spec.ts`, `smoke.spec.ts` |

Inside `packages/ui`:
- **`src/tokens.ts`:** the accepted palette.
- **`src/fonts/`:** the self-hosted typefaces, Fredoka and Literata, declared in
  `fonts.css` as `@paperplay/ui/fonts.css` (ADR-0002).
- **Scene kits (ADR-0026):** each kit has a half in each layer below, under `kits/<id>/`, so
  the layer's lint rules and tsconfig cover it. The valley kit (`kits/valley/`) draws the flock
  over its valley; the town kit (`kits/town/`, ADR-0029) draws a compartment model's shares as
  120 figures in a town. A kit's own Three.js parts may not take a name the stage's fields
  take, checked by type (`Unshadowed`).
- **`src/stage-core/`:** pure presentation; turns states into a `FrameDescription` through a
  kit's pure half (`StageKit`). The generic frame is the stage's part (camera, field box,
  palette, rings) and the kit's own typed layers beside it. It also holds the view window and
  free rectangle (`screen.ts`) and ground picking (`picking.ts`) (ADR-0012). The valley kit's
  half, `@paperplay/ui/stage-core/valley`, holds the flock's frame, its palettes, bird picking
  and the compass's geometry; the town's, `@paperplay/ui/stage-core/town`, the figures' counts
  by largest remainder, their fixed walking loops and its palette.
- **`src/three-adapter/`:** turns a `FrameDescription` into a Three.js scene. The base makes
  the scene, camera, fog, lights, sky, sun and rings, and keeps their creation order; a kit's
  Three.js half (`ThreeKit`, registered in `THREE_KITS`) draws its layers. The valley kit's:
  birds as a body and two hinged wings, trails as ribbons, beacons and rocks, and the valley
  with its meadow, lake, trees and rocks (ADR-0013). The town kit's: figures as a body and a
  head, a ring under each ill one, houses round a plaza, and woods to the fog.
- **`src/react/`:** they display what a driver gives them and report what the learner does.
  WorldStage, ForkView and the guide take a kit; the valley kit's React half,
  `@paperplay/ui/react/valley`, holds its mark, its tools and the flock's readouts; the town
  kit's, `@paperplay/ui/react/town`, its mark and `CompartmentBar`, the labelled three-part
  readout. The paper journal holds the
  page of what a world cannot show.
  - From G1: WorldStage, LabBench, Readout, and the origin chip and legend (ADR-0007).
  - The game-first HUD (ADR-0008, ADR-0012), styled by `hud.css`: LevelCard, Guide,
    PaperJournal, LevelMap, DepthToggle, OriginTag and `useFreeRect`.
  - Each level's readout, by its observable (ADR-0014, ADR-0018), in the valley kit:
    HeadingCompass, SpacingGauge, SpreadDial, GroupsCounter and RocksCounter, sharing the
    `dial` styles.
  - The fork (ADR-0019): ForkView, with two WorldStages, and DifferenceChart.
  - The guide can ask a question with choices (`ask`), and speak inside a card (GuideNote).
  - SpeedButton, the speed control (ADR-0020); `advance` in `stage-core/fixed-step.ts` takes the speed. The level card shows and hides its elements by
    the id a depth variant names (ADR-0016).

## Dependency directions

An arrow means "may import". Dotted arrows are type-only imports.

```mermaid
flowchart LR
  web["apps/web"] --> primitives["packages/primitives"]
  web --> react["packages/ui · react"]
  web --> stagecore["packages/ui · stage-core"]
  web --> pipeline["packages/pipeline · builder"]
  web --> contracts
  pipeline --> contracts
  pipeline --> primitives
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
- `stage-core` importing Three.js, React or DOM libraries, or importing simulation values (a family's types, such as `@paperplay/primitives/flock`'s, are allowed);
- `three-adapter` importing `primitives` or `contracts` in any form;
- `react` (the components) importing simulation values: types only, and React, from outside its package;
- the builder (`packages/pipeline/src/builder/`) importing anything but `contracts` and `primitives`: no model client, network or UI.

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
  state --> describe["a kit's describe, in the stage core<br/>(previous, current, alpha)"]
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
| RunRecord, with RunEvent (`param` · `place` · `remove`) and the learner's predictions | `runrecord/3` (ADR-0023) | `packages/contracts/src/run.ts` |
| Origin, Anchor, PrimitiveRef, Action, JobState | Versioned with the documents that embed them | `packages/contracts/src/` |
| WorldSpec: `WorldSpecV3`, with LevelV3, CounterfactualV3 (its MeasuredDifferenceV3 in the world's time unit), Routing, DesignSpecV3 and Limit; drafts may hold placeholder anchors and a pending source | `worldspec/3` (ADR-0027) | `packages/contracts/src/worldspec-v3.ts` |
| WorldSpecV2, frozen: still read by `WorldSpec`, and upgraded to version 3 by `upgradeWorldSpec` before anything is built | `worldspec/2` (ADR-0016, ADR-0018) | `packages/contracts/src/worldspec.ts` |
| SceneKitManifest and `SCENE_KITS`: what each scene kit draws, what a run is called, its disclosures | Unversioned data; a kit is added by ADR | `packages/contracts/src/kits.ts` (ADR-0027) |
| `flock.planar.weighted` | 3.1.0: equations E1–E20, with the group measure of ADR-0015 (E14 groups, E18 stray share) and its reading O1, "one group"; E19 the largest group's spread and E20 birds at rocks (ADR-0018); defaults per ADR-0003, alignment range 0–4; and the read-only queries Q1 (neighbourhoods), Q2 (headings), Q3 (spread) and Q4 (birds at rocks), which do not change the version | `packages/primitives/src/agents/flock/MODEL.md` |
| ModelSpec, with Expr (a closed grammar) and Unit (powers of six base dimensions); carried in worldspec/3's `equations` binding | Versioned with the WorldSpec that holds it | `packages/contracts/src/model.ts` (ADR-0028) |
| `compartments.ode` | 1.0.0: RK4 at the model's fixed step, its units, and its checks C1–C4 | `packages/primitives/src/compartments/MODEL.md` |
| The families' catalogue (`FamilyId`, `FAMILIES`, `Variation`, `SpaceKind`) and `TimeUnit` | Unversioned data: a family, space or time unit is added by ADR | `packages/contracts/src/families.ts`, `packages/contracts/src/time.ts` (ADR-0025) |
| Oracle fixtures | `oracle/1` | `fixtures/oracles/README.md` |
| FrameDescription (the stage's part and a kit's layers), StageKit, ThreeKit; the valley kit's FlockFrame and FrameEmphasis | Unversioned: in-process only, never persisted | `packages/ui/src/stage-core/frame.ts`, `packages/ui/src/three-adapter/scene.ts`, `packages/ui/src/stage-core/kits/valley/frame.ts` (ADR-0026) |
| Gate definitions | Requirements per gate | `gates.json` |

## Invariants and where they are enforced

| Invariant | Enforced by | Where |
|---|---|---|
| Every registered primitive belongs to a catalogued family, counts its steps in a time unit, and sizes its space by its own start-up variables; the flock's named queries are its own Q1–Q4 | Tests [R01] | `packages/primitives/test/primitive-interface.test.ts` |
| A model given as data is interpreted, never compiled from text: no `eval` or `new Function` in primitives | Lint | `eslint.config.js` |
| `compartments.ode` matches hand-derived oracles: RK4's factor on decay and growth, the logistic curve, conservation of S + I + R, SIR's final size, a stiff decay refused, replay | Oracle fixtures [R01] | `fixtures/oracles/compartments.ode/`, `packages/primitives/test/compartments.oracles.test.ts` |
| A ModelSpec's names resolve, its expressions stay within the grammar and its limits, its units agree, and its tolerance is at most a thousandth | Zod refinements and the solver's unit check, with tests [R01] [R03] | `packages/contracts/test/model.test.ts`, `packages/primitives/test/compartments.units.test.ts` |
| The builder binds a model with its solver and runs the family's checks on both worlds of every fork, refusing a model whose units disagree, a stiff one, or a solver it does not hold | Tests [R08] | `packages/pipeline/test/builder-equations.test.ts`, `packages/pipeline/src/builder/families.ts` |
| Primitives are seeded and never read a clock | Lint (`Math.random`, `Date.now`, `performance.now` and `new Date` are banned); tests tagged [R01] | `eslint.config.js`, `packages/primitives/test/` |
| Primitives never mutate their inputs | Tests on deep-frozen states | `packages/primitives/test/flock.step.test.ts`, `packages/primitives/test/flock.edits.test.ts` |
| Same seed and events give bit-identical observables | The replay oracle and determinism tests [R01] | `packages/primitives/test/flock.determinism.test.ts` |
| Primitive behaviour matches hand-derived equations | Oracle fixtures [R01] | `fixtures/oracles/`, `packages/primitives/test/flock.oracles.test.ts` |
| Contracts depend only on zod | Lint | `eslint.config.js` |
| Contracts reject unknown keys and enforce their refinements | Tests [R03] | `packages/contracts/test/` |
| worldspec/3 asks every level for a prediction; routes tier A to a released primitive and tier B to an unmerged one, and keeps a world on an unmerged primitive a draft; counts time in the world's unit; says at least one thing the world cannot show. `WorldSpec` reads either version, and a version 2 spec upgrades to the same world | Zod refinements, tests [R03]; a test builds the flocking world from both versions [R08] | `packages/contracts/test/worldspec-v3.test.ts`, `packages/pipeline/test/builder-v3.test.ts` (ADR-0027) |
| The builder refuses a scene kit the shell does not have or one that cannot draw the primitive's family and space, a routing to another family, a time unit that is not the primitive's, and a level that takes more than 20 s to watch at 4x; it sizes placements from the primitive's space | Tests [R08] | `packages/pipeline/test/builder-v3.test.ts` |
| Every WorldSpec level has exactly one manipulable and one counterfactual; the hook comes first; paper-derived statements carry anchors; counterfactuals override parameters only; a bonus level claims nothing from the paper; a reviewed spec holds no placeholder | Zod refinements, with tests [R03] | `packages/contracts/src/worldspec.ts`, `packages/contracts/test/worldspec.test.ts` |
| Each level's control moves its declared engine variable, its fork applies exactly its overrides, and its setup lands at step 0 | Hand-written binding fixtures, run through the engine and compared with the primitive stepped directly [R08] | `fixtures/bindings/`, `packages/pipeline/test/bindings.test.ts` |
| The builder refuses what the registry contradicts and what the shell cannot draw, is deterministic, and calls no model | Tests [R08]; lint keeps it to contracts and primitives | `packages/pipeline/test/builder.test.ts`, `eslint.config.js` |
| `/world/hook` plays the six levels in order, each opening only once the one before has been moved through its range, and each readout shows the primitive's own value | Browser tests [R06], compared with Node | `tests/e2e/levels.spec.ts` |
| Each depth variant shows exactly the shell elements it names, and hides the rest | Browser test [R06] over every level and depth, read from the spec | `tests/e2e/levels.spec.ts` |
| Every level's stated effect holds on at least 16 of 20 skies, or, for a count claim after a prediction, is exactly right (the level rule) | A test re-runs `npm run sweep:levels` in its own Node process and holds `eval/sweeps/levels.md` to it byte for byte [R06] | `scripts/test/levels.test.ts`, `scripts/sweep/levels.ts` (ADR-0018) |
| In a model with no chance in it, every level's stated effect holds on at least 16 of 20 starts, the world's values and 19 within a tenth of them, and every run passes the accuracy check | A test re-runs the sweep for Threshold Town and holds `eval/sweeps/levels-kermack-mckendrick-1927.md` to it byte for byte [R06] | `scripts/test/levels.test.ts` (ADR-0024, ADR-0029) |
| The town's figures are a picture of the solver's shares: drawing them changes no measurement, a figure only moves forward through the compartments, and a fork in the app measures what the model run on its own measures | Tests [R02] [R06] | `packages/ui/test/town.test.ts`, `apps/web/test/threshold-town.test.ts` (ADR-0029) |
| Every town figure's colour, and the ill figures' ring, keeps 3:1 against the ground and the plaza; Threshold Town's fixture is exactly what its source writes | Tests [R08] | `packages/ui/test/town.test.ts`, `scripts/test/threshold-town.test.ts` (ADR-0029's amendment) |
| A gate's reviewed worlds are reviewed: G2 cannot pass while the flocking world is a draft or holds a placeholder anchor | `check:gate`, from `gates.json`; tests [R03] | `scripts/gate/worlds.ts`, `scripts/test/gate-worlds.test.ts` |
| The built app runs under the deploy's Content-Security-Policy with no violation and no console error | Browser tests against the production build, served with `vercel.json`'s headers | `tests/e2e/csp.spec.ts`, `scripts/serve-dist.ts` (ADR-0017) |
| A level's setup is recorded as place events at step 0, so its run replays from its record | Tests [R07] | `apps/web/test/session.test.ts` |
| A fork's two worlds stay step for step together; opened at a level's start on seed 5, it measures exactly what the levels sweep records | Tests [R06], against direct runs and `eval/sweeps/levels.md` | `apps/web/test/fork.test.ts` |
| The fork shows two worlds side by side on a desktop, stacked on a phone, with the measured difference charted, and passes axe on both | Browser tests [R06] [R12] | `tests/e2e/fork.spec.ts` |
| Every level of the flocking world asks for a prediction, with two choices, before its fork; the guide reports this sky's result by the choice it bears out; nothing scores it | Tests [R06]; browser tests on every level, against Node's own result on seed 5 [R06] | `apps/web/test/guide.test.ts`, `tests/e2e/predictions.spec.ts` (ADR-0023) |
| A prediction is saved in the run's record at its step, and changes nothing a record replays | Tests [R03] [R07] | `packages/contracts/test/run-record.test.ts`, `packages/primitives/test/replay.test.ts`, `apps/web/test/session.test.ts` |
| A level that asks for a prediction asks it before its fork, and nothing scores it: no line calls a choice right or wrong | Tests [R06]; browser tests [R06] [R12] | `apps/web/test/guide.test.ts`, `tests/e2e/guided.spec.ts` |
| A run at 4x is the same run as at 1x: the same states bit for bit, the same events, and it replays from its record | Tests [R07]; the clock's tests | `apps/web/test/session.test.ts`, `packages/ui/test/fixed-step.test.ts` |
| Level 5's rocks counter shows the primitive's own count (E20) and rocks (Q4), and the stage lights exactly the rocks Q4 reports, in the one world and in both of the fork's | Tests on Q4 against E20 [R01]; the session; browser tests compared with Node [R06] | `packages/primitives/test/flock.rocks.test.ts`, `apps/web/test/session.test.ts`, `tests/e2e/rocks.spec.ts` |
| A rock casts no shadow, and a lit rock uses a material of a rock's own kind, so no rock makes a new stage compile shaders mid-run | Test | `packages/ui/test/three-adapter.test.ts` |
| When the browser takes a stage's WebGL context away, the stage says so and offers "Tap to reload the world", or resumes by itself when the context comes back; the run never notices | Browser tests that lose the context with `WEBGL_lose_context`, then restore it or reload, checking pixels and the run's step [R12] | `tests/e2e/context.spec.ts`, `packages/ui/src/three-adapter/mount.ts` (ADR-0022) |
| The fork's chart spans its card and draws at one unit to a CSS pixel, so its 12 px labels stay 12 px on a phone | Browser test on a phone [R12] | `tests/e2e/fork.spec.ts`, `packages/ui/src/react/DifferenceChart.tsx` (ADR-0019) |
| A disposed stage releases its WebGL context at once, so stages mounted later start as quickly | Browser test: a closed fork's two contexts are lost | `tests/e2e/fork.spec.ts`, `packages/ui/src/three-adapter/mount.ts` |
| The renderer never changes an observable, even with a bird picked, the spread ring drawn, rocks lit, the view framed in a HUD's window, or the flock coloured by heading with wingbeats and trails | Test [R02]; in the browser, colour by heading records nothing and the run matches Node bit for bit [R02] | `packages/ui/test/render-invariance.test.ts`, `tests/e2e/world.spec.ts` |
| Every colour on the heading wheel keeps 3:1 against the meadow; trails never cross a seam and stay under 3.5 units | Tests | `packages/ui/test/world-art.test.ts` |
| The following camera keeps the flock's centre inside the HUD's free rectangle, and is the still overview under reduced motion | Browser tests | `tests/e2e/hook.spec.ts` |
| The HUD at rest covers at most 25% of 1440 × 900 and 35% of 390 × 844, and the stage frames the field inside the rectangle it leaves free | Browser tests that measure the HUD's boxes and read the stage's own fit; unit tests on the fit | `tests/e2e/hook.spec.ts`, `packages/ui/test/screen.test.ts` |
| The compass's arrow is the primitive's mean heading (Q2) and agreement (E12), and its ticks point where the birds fly on screen | Tests | `packages/primitives/test/flock.headings.test.ts`, `packages/ui/test/compass.test.ts` |
| The stage core is framework-free, with type-only simulation imports | A tsconfig without the DOM library; lint | `packages/ui/src/stage-core/tsconfig.json`, `eslint.config.js` |
| The adapter never reads or writes simulation state | Lint and an import test | `packages/ui/test/three-adapter.test.ts` |
| Every scene kit's pure half has its Three.js half registered under the same id; no kit's Three.js half imports simulation code; each says what carries on when the drawing is lost | Tests; lint covers every kit's half as it covers its layer | `packages/ui/test/kits.test.ts`, `eslint.config.js` (ADR-0026) |
| Splitting the stage into a base and the valley kit changed no pixel: the demo capture's frame hashes are those of `f0bc31c` | The capture, filmed before and after (session log 2026-10-10) | `npm run capture:demo` |
| The React stage and bench import no simulation code | Lint (types only) | `eslint.config.js` |
| The flocking world's six levels on seed 5 replay bit for bit, at tolerance 0, against records made before G3a's refactor, and the app's own session and fork make each record again byte for byte, on the runtime that made them; on any other, state for state, with every observable but E19 bit for bit | Tests [R07] | `apps/web/test/records.test.ts`, `fixtures/records/flocking-seed5/` |
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
| `main` moves only to a commit that passed `check:gate` locally and CI on that same commit | `npm run land`, the only routine way `main` moves; the pre-push hook refuses any other push that would move or delete `main`; tests on throwaway repositories, a planted failing gate among them | `scripts/land/land.ts`, `scripts/land/guard.ts`, `.githooks/pre-push`, `scripts/test/land.test.ts` (ADR-0009) |
| Browser tests render WebGL in software | Launch flags, and a test that asserts SwiftShader was used | `playwright.config.ts`, `tests/e2e/stage.spec.ts` |
| Fonts come from the page's own origin, and only the shipped weights are declared or rendered | A unit test on the font files; a browser test that blocks off-origin requests | `packages/ui/test/fonts.test.ts`, `tests/e2e/fonts.spec.ts` |
| `/world/local` has no WCAG 2.x A or AA violation that axe can detect, in four states, at 1280 and 360 px | Browser tests [R12] | `tests/e2e/accessibility.spec.ts` |
| The demo capture advances a fixed two steps per video frame, replays from its own record, and ends on one group; its scripted camera never jumps and is the same every run | Tests, on both runtimes | `apps/web/test/demo-script.test.ts`, `scripts/test/capture.test.ts` |
| **Per runtime:** the demo capture's bytes are the same on every run | Two runs on macOS arm64 and two on Linux x86-64 in CI, each pair byte-identical. The two runtimes give different bytes (see Claims per runtime) | 2026-10-09 logs; `.github/workflows/check-gate.yml` (capture job) |
| The capture page never ships | The production build has one entry, `index.html` | `apps/web/vite.config.ts` (Vite's default input) |
| Three.js loads as its own chunk, never in the entry chunk | A test builds the production bundle and reads its chunks | `scripts/test/bundle.test.ts`, `packages/ui/src/react/WorldStage.tsx` |
| The deploy builds the repository's own build, from a clean install, and serves the app on every path | A test reads `vercel.json` against `package.json` | `scripts/test/bundle.test.ts`, `vercel.json` (ADR-0017) |
| Secrets stay server-side: the client bundle holds no key in the `sk_` or `sk-` format, no key variable, not the model gateway's host, and none of `apps/api/.env`'s key values | `npm run build` runs `scripts/check-bundle.ts` after the web build, so the gate, CI and the deploy fail on a leak; tests [R09] | `scripts/bundle/secrets.ts`, `scripts/test/bundle-secrets.test.ts`, `scripts/test/bundle.test.ts` (ADR-0030) |
| Tests and CI never call the model gateway: a live client is refused under CI, under a test, and anywhere but `npm run pipeline:live`; tests answer calls from recordings by the prompt's hash | Tests [R09] | `apps/api/test/voyager.test.ts`, `packages/pipeline/test/models.test.ts` (ADR-0030) |
| A job reaches `ready` only from `checking`, after the builder, the family's checks, the level rule and provenance pass; at most two scoped repairs; the reviewer runs only after the checks pass and advises | Contract transitions and controller tests [R10] [R11] | `packages/contracts/src/job.ts`, `packages/pipeline/test/controller.test.ts` (ADR-0033) |
| A job's events are its real states, in order, numbered, resumed from where a client left off; no timer | API tests [R11] | `apps/api/test/jobs.test.ts` (ADR-0033) |
| A source is read without running or fetching anything it asks for: archives refuse links and climbing paths, LaTeX macros are never expanded, XML entities beyond XML's own are never decoded; paper text is sanitised before any prompt, offsets kept | Tests [R09] | `packages/pipeline/test/ingest.test.ts`, `packages/pipeline/test/sanitise.test.ts` (ADR-0031) |

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
- **Compared across runtimes, from 2026-10-10:** the flocking world's records, made on the Mac
  (`apps/web/test/records.test.ts`). On Linux x86-64:
  - every run is the same, state for state: each replay's final state has the SHA-256 the Mac
    gave it;
  - every observable is the same, bit for bit, except E19, the largest group's spread: one
    sample of level 3's trunk differed in its last bit. Its circular mean calls `Math.cos`,
    `Math.sin` and `Math.atan2`, which ECMAScript lets each engine round its own way; every
    other observable is arithmetic and `Math.sqrt`, which it does not;
  - so the records hold bit for bit on darwin arm64 only, and elsewhere state for state, with
    E19 within 1e-12.

  R01's bit-identical observables stay a within-runtime claim, as R01 says ("on one runtime").
- **Libraries:** Zod 4.6 for contracts, Fastify 5 for the API.
- **Scripts:**
  - `check:gate` runs typecheck, lint, check:docs, test, build and test:e2e, then checks
    the evidence;
  - `check:docs` checks the documentation;
  - `land` lands the current branch on `main`, through the gate and CI (ADR-0009);
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
| 2026-10-09 | d2e9f9f | The session takes a level's setup, and `load()`s another level on the same stage |
| 2026-10-09 | e5c30b7 | `/world/hook` from the built world: `authored-world.ts`, the guide from scripts, SpacingGauge, GroupsCounter, the `dial` styles; `hook-content.ts` removed |
| 2026-10-09 | 2ce3b34 | WorldStage loads the Three.js adapter with `import()`; `vercel.json` (ADR-0017) |
| 2026-10-09 | 7f9c547 | Flock 3.1.0: E19, E20 and Q3 |
| 2026-10-09 | 3647ec5 | `worldspec/2`; `src/builder/difference.ts`; `npm run sweep:levels` and `eval/sweeps/levels.md` (ADR-0018) |
| 2026-10-09 | 804038a | The spread ring (the frame's `spread` emphasis) and SpreadDial |
| 2026-10-09 | e09ecd9 | `gates.json` `reviewedWorlds`; `scripts/gate/worlds.ts` |
| 2026-10-09 | b4503a5 | The deploy's CSP and headers; `scripts/serve-dist.ts`; a second Playwright web server; `apps/web/src/strict-csp.ts` |
| 2026-10-09 | 6c9a5a2 | The session's `start` and `stepBy` |
| 2026-10-09 | 8d62794 | The fork: `src/world/fork.ts`, ForkView, DifferenceChart; WorldStage's `name` |
| 2026-10-09 | 85e43fe | Guided exploration: the guide's `ask`, GuideNote, `explorationLines` |
| 2026-10-09 | b6e00d3 | The speed control: `advance`'s speed, the session's and the fork's `setSpeed`, SpeedButton |
| 2026-10-09 | 92cb65f | A disposed stage releases its WebGL context (`forceContextLoss`) |
| 2026-10-09 | 3454a1d | `npm run land` and the pre-push hook on `main`: `scripts/land/`, `scripts/hooks/`, `.githooks/` (ADR-0009) |
| 2026-10-09 | 29f9646 | Flock query Q4 (`flockAtRocks`); RocksCounter; the frame's touched rocks and the adapter's `touchedMaterial`; rock markers cast no shadow |
| 2026-10-09 | 7c81d9f | `mountStage` handles context loss: the lost notice, restore, and "Tap to reload the world" (ADR-0022); DifferenceChart draws at its measured width; SpeedButton says "Speed 1×"; `tests/e2e/pixels.ts` |
| 2026-10-09 | ea2fdf1 | `runrecord/3` with predictions; the session's `predict` and `record`; every level's guided exploration in the fixture (ADR-0023) |
| 2026-10-10 | fc3f828 | `fixtures/records/flocking-seed5/`, the six levels recorded before G3a, held to them by `apps/web/test/records.test.ts` |
| 2026-10-10 | 8de1c33 | `fixtures/records/flocking-seed5/final-states.json`; the records test holds them bit for bit where they were made, and state for state everywhere |
| 2026-10-10 | f111195 | Primitive families: `families.ts` and `time.ts` in contracts; the `Primitive` interface's `family`, `time`, `space`, `entities` and `queries`; the flock in `src/agents/flock/` as `@paperplay/primitives/flock`; the torus in `src/spaces/` (ADR-0025) |
| 2026-10-10 | ba1ac50 | Scene kits (ADR-0026): the generic frame, `StageKit`, `ThreeKit` and `THREE_KITS`; the valley kit under `kits/valley/` in each layer; the generic session (`apps/web/src/world/session.ts`) and the valley's view (`valley.ts`); the fork on the level's own primitive |
| 2026-10-10 | dde1cec | `worldspec/3` (`worldspec-v3.ts`), the reader for both versions and `upgradeWorldSpec`; `kits.ts`, the scene kits' manifests; `TIME_WORDS`; the builder on version 3; the flocking fixture migrated (ADR-0027) |
| 2026-10-10 | 32c7899 | The compartment family (ADR-0028): `model.ts` in contracts; `compartments.ode@1.0.0` in `packages/primitives/src/compartments/`, as `@paperplay/primitives/compartments` and the registry's solver; the `equations` binding; the builder's `families.ts`; `fixtures/oracles/compartments.ode/` |
| 2026-10-10 | cf2551d | The town kit (ADR-0029) under `kits/town/` in each layer; `apps/web/src/worlds/` and `src/world/town.ts`; `HookWorld` for any world, `/world/epidemic`; `FAMILIES[*].forkFrom`; `accuracyReport`; the levels sweep over any world; `fixtures/worldspecs/kermack-mckendrick-1927.json` |
