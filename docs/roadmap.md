# Roadmap

The plan, gate by gate. What is happening right now lives in [status.md](status.md), and
finished slices are logged in [progress.md](progress.md). A gate is tagged only after
`npm run check:gate` passes on the pinned runtime and status.md records that output;
`gates.json` lists the requirements each gate enforces.

## Gates

| Gate | Days | Tag | Planned effort | Requirements enforced | State |
|---|---|---|---|---|---|
| G1 Playable baseline | 1–7 | v0.1.0 | 21–28 h | R01–R04 | In progress |
| G2 Verified authored world | 8–14 | v0.2.0 | 21–28 h | R01–R08, R12 | Early work done |
| G3 Constrained generation | 15–21 | v0.3.0 | 21–28 h | R01–R12 | Not started |
| G4 Evaluation and feature freeze | 22–27 | v0.4.0 | 18–24 h | R01–R12, plus evaluation checks | Not started |
| G5 Delivery | 28–30 | v1.0.0 | 9–12 h | R01–R12 | Not started |

## G1 Playable baseline

Exit: a deterministic, testable local world with the prototype's world-first feel. Nothing
is generated yet.

Done:
- [x] Repo skeleton: workspaces, pinned Node, strict TypeScript, Vitest, Playwright, ESLint,
  and a `check:gate` that checks requirement evidence (2026-09-28).
- [x] Contracts: Origin, Anchor, SourceManifest, PrimitiveRef, Action, RunRecord and
  JobState (2026-09-28); RunRecord became `runrecord/2` on 2026-09-30.
- [x] Primitive `flock.planar.weighted`: seeded PRNG, registry, `describe()`, hand-derived
  oracle fixtures, determinism (2026-09-28); named entities and replay (2.0.0) and swept
  defaults (2.1.0) on 2026-09-30.
- [x] Stage: tokens, the Three.js stage core and adapter, and the render-invariance test
  for R02 (2026-09-30, ADR-0004).
- [x] Documentation system, checked by `check:docs` inside every gate (2026-10-01).

Next:
- [ ] The owner's decisions of 2026-10-01: a pinned hook seed and alignment's range widened
  to 0–4 (ADR-0003), self-hosted fonts (ADR-0002), the evaluation protocol's location, and a
  private reference folder.
- [ ] React `WorldStage`: orbit and zoom by pointer and keyboard, pause, next seed, replay
  same seed, readouts at most ten times a second.
- [ ] `LabBench` and `/world/local`: the alignment slider, "Rules of this world", beacon and
  obstacle placement, the selected-neighbour view, and the hook seed.
- [ ] The [R04] smoke test: a slider moves the engine parameter and the
  `directionalAgreement` readout, with no console errors.
- [ ] Tag v0.1.0, after asking the owner.

Later (moved out of G1):
- CaptionStrip, StatusChip and the tethers move to G2 (see Plan changes, 2026-10-01).

## G2 Verified authored world

Exit: the authored flocking world plays end to end with evidence, depth, forks and replay.
Every displayed scientific statement has an anchor or an adaptation label.

Done early:
- [x] RunRecord v2 and the replay engine, part of R07 (2026-09-30).

Next:
- [ ] Source register, source map, four development and eight held-out section files,
  reading notes and learning questions.
- [ ] The full WorldSpec schema and the hand-authored `flocking-reference.json`.
- [ ] The deterministic builder, with binding fixtures.
- [ ] EvidenceRail with two-way provenance and tethers; PathRibbon; DepthDial; ForkView;
  GuidedExploration; CaptionStrip.
- [ ] RunRecord export and import; `npm run replay` with a tolerance report; a replay test
  on a fresh page load.
- [ ] The stale-evidence rule.
- [ ] An axe accessibility scan in `test:e2e` (R12).

Later:
- Loading the Three.js stage as its own chunk (the bundle is 878 KB; the owner deferred this).

## G3 Constrained generation

Exit: one complete generated experience from a new development section, honest on failure;
the reviewer cannot bypass a failed check.

Next:
- [ ] `apps/api`: jobs, SSE events, JSON artifacts, secrets in `.env`, a bundle secret check,
  upload limits, and the paper-text sanitiser.
- [ ] `packages/pipeline`: model adapters (mock first), Reader, Planner/Designer, Explainer,
  checks, Semantic reviewer, and the controller with at most two scoped repairs.
- [ ] The `/create` storyboard with real job states (and StatusChip), and explicit failure
  outcomes.
- [ ] End to end on a development section, with a mock-adapter test and one recorded
  real-provider run.

Later:
- The widget tier, behind `FEATURE_WIDGETS=1` (stretch).

## G4 Evaluation and feature freeze

Next:
- [ ] Freeze the protocol at `eval/protocol.md`.
- [ ] Run the pipeline against baseline B1 across the held-out sections and at least three
  seeds, keeping every raw attempt.
- [ ] Replay and fault-localisation tests on a pinned runtime.
- [ ] A small descriptive learning pilot.
- [ ] Feature freeze.

## G5 Delivery

Next:
- [ ] Reproduce from a clean checkout using `docs/setup.md` only.
- [ ] `docs/report.md`, the presentation with a labelled fallback video, and release notes.

## Effort

"Used" counts calendar days and Claude Code session time (wall clock, from session logs and
commit times). The owner's own focused hours are not tracked unless logged.

| Gate | Planned | Used so far |
|---|---|---|
| G1 | Days 1–7, 21–28 h | Days 1–4 (2026-09-28 to 2026-10-01). Sessions: about 1.4 h (09-28), 5.4 h (09-30), and the 10-01 session, still in progress |
| G2–G5 | As in Gates | None yet, apart from G2's early RunRecord and replay work |

## Plan changes

| Date | Change | Reason |
|---|---|---|
| 2026-09-28 | Node pinned to 24.21.0, TypeScript to 6.0 | The brief requires Node 24; typescript-eslint supports TypeScript below 6.1 (ADR-0001) |
| 2026-09-30 | Renderer is Three.js from G1, not Canvas 2D | Owner decision (ADR-0004) |
| 2026-09-30 | RunRecord v2: event union, `sampleInterval`, `totalSteps` | Owner decisions; placements must be replayable |
| 2026-09-30 | Flock defaults chosen by a sweep (2.1.0) | The prototype's defaults did not form one murmuration on the torus (ADR-0003) |
| 2026-09-30 | G1 step 4 split: the stage core and adapter came first; WorldStage controls, LabBench, CaptionStrip and StatusChip moved to the next slice | The renderer change came first |
| 2026-10-01 | A documentation system, with `check:docs` in every gate | Owner: any session must learn what exists, why and what is next from a few files |
| 2026-10-01 | CaptionStrip, StatusChip and the tethers move from G1 to G2 | The owner scoped the next slice to WorldStage, LabBench, `/world/local` and R04. The caption strip's "In the paper" column and the tethers need the source map (G2), and status chips show job states, which begin at G3 |
| 2026-10-01 | Code-splitting the stage is deferred; the bundle-size warning stays | Owner decision |
