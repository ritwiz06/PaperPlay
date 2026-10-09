# Roadmap

The plan, gate by gate. What is happening right now lives in [status.md](status.md), and
finished slices are logged in [progress.md](progress.md). A gate is tagged only after
`npm run check:gate` passes on the pinned runtime and status.md records that output;
`gates.json` lists the requirements each gate enforces.

## Gates

| Gate | Days | Tag | Planned effort | Requirements enforced | State |
|---|---|---|---|---|---|
| G1 Playable baseline | 1–7 | v0.1.0 | 21–28 h | R01–R04 | Passed and tagged v0.1.0 on 2026-10-01 |
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
- [x] The owner's decisions of 2026-10-01 (all on 2026-10-01):
  - hook seed 4, and alignment's range widened to 0–4 in flock 2.2.0 (ADR-0003);
  - self-hosted fonts (ADR-0002);
  - the evaluation protocol at `eval/protocol.md` (ADR-0005);
  - a private reference folder (ADR-0006).
- [x] React `WorldStage`: orbit and zoom by pointer and keyboard, pause, next seed, replay
  same seed, readouts at most ten times a second (2026-10-01, ADR-0007).
- [x] `LabBench` and `/world/local`: the alignment control, "Rules of this world", beacon
  and obstacle placement, the selected-neighbour view, and the hook seed (2026-10-01).
- [x] The [R04] tests: 11 session tests and 5 browser tests, with readouts compared with
  Node bit for bit (2026-10-01).
- [x] `check:gate` passes G1 (2026-10-01, commit 107a38a).

- [x] Tagged v0.1.0 at `3448e5b`, with the owner's go-ahead (2026-10-01).

Later (moved out of G1):
- CaptionStrip, StatusChip and the tethers move to G2 (see Plan changes, 2026-10-01). Since
  then, ADR-0008 has replaced the caption strip with the guide and the tethers with "From the
  paper"; StatusChip waits for G3's job states.

## G2 Verified authored world

Exit: the authored flocking world plays end to end with evidence, depth, forks and replay.
Every displayed scientific statement has an anchor or an adaptation label.

Done early:
- [x] RunRecord v2 and the replay engine, part of R07 (2026-09-30).
- [x] `npm run capture:demo`, a deterministic demo video, at the owner's request
  (2026-10-09, ADR-0010).

Next:
- [x] First: add `@axe-core/playwright` (approved 2026-10-01) and the axe scan in `test:e2e`
  (R12) (2026-10-09, commit 3639dfb).
- [ ] Source register, source map, reading notes and learning questions. The section files
  moved to G3 (see Plan changes, 2026-10-09).
- [ ] Decide the group measure before any level teaches with it (owner, 2026-10-01). At the
  default density, 17% of random scatters count as one group (ADR-0003).
- [ ] The full WorldSpec schema and the hand-authored `flocking-reference.json`.
- [ ] The deterministic builder, with binding fixtures.
- [x] A design spike at `/world/hook` with hard-coded content, screenshotted on desktop
  and phone (2026-10-09, `5aadf22` on `g2/hook-spike`). It awaits the owner's review and
  stays unmerged until then (ADR-0009).
- [ ] The game-first shell (ADR-0008): a full-screen stage, with the LevelCard (the one
  control, its live readout and "What if"), the Guide and the LevelMap over it.
- [ ] The PaperJournal, with two-way provenance: "From the paper" on every control,
  passages unlocked level by level, and the origin legend.
- [ ] The DepthToggle (Beginner / Intermediate / Advanced), in the level card and the
  journal, showing and hiding by element id.
- [ ] The split-screen ForkView: two synchronized worlds and one measured difference
  between them.
- [ ] Guided exploration in the guide: predict, intervene, observe, explain, never scored.
- [ ] `/world/local` moves into the shell as the free sandbox.
- [ ] RunRecord export and import; `npm run replay` with a tolerance report; a replay test
  on a fresh page load.
- [ ] The stale-evidence rule.

Later:
- Loading the Three.js stage as its own chunk (the bundle is 878 KB; the owner deferred this).
- A cross-runtime capture check: Mac and Linux frames agree within a stated pixel tolerance,
  with bird pixels overlapping (option b of the 2026-10-09 capture finding, ADR-0010).

## G3 Constrained generation

Exit: one complete generated experience from a new development section, honest on failure;
the reviewer cannot bypass a failed check.

Next:
- [ ] First, once the authored world plays end to end: split the paper into the four
  development and eight held-out section files (moved from G2 on 2026-10-09). G3 generates
  from a development section, and G4 evaluates on the held-out ones.
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
| G1 | Days 1–7, 21–28 h | Days 1–4 (2026-09-28 to 2026-10-01), about 8.3 h of sessions: 1.4 h (09-28), 5.4 h (09-30) and 1.5 h (10-01). Under plan, because Claude Code did the building; the owner's own review time is not tracked |
| G2 | Days 8–14, 21–28 h | G2's early RunRecord and replay work, then about 0.9 h of session on 2026-10-09 (00:51 to 01:45): `main` and the branching rule, ADR-0008, the axe scan, the demo capture, the hook spike and the plan change |
| G3–G5 | As in Gates | None yet |

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
| 2026-10-01 | The opening level pins seed 4; alignment's range widens to 0–4 (flock 2.2.0) | Owner decisions (ADR-0003) |
| 2026-10-01 | Read-only primitive queries do not change a model's version | A query changes no equation, state, default or range; replay depends only on those (ADR-0007, MODEL.md Q1) |
| 2026-10-01 | The stage's fit rule changes: back off in inverse proportion to the aspect, below 1.32:1 | The old rule cropped the field on the phone layout (ADR-0007) |
| 2026-10-01 | The axe scan moves to the start of G2, with `@axe-core/playwright` | Owner approved the dependency |
| 2026-10-01 | The group measure is settled at G2 | Owner decision (ADR-0003) |
| 2026-10-09 | `main` holds G1; work moves to short branches off `main` | Owner decision (ADR-0009) |
| 2026-10-09 | `npm run capture:demo` added before G2's interface work | Owner request (ADR-0010) |
| 2026-10-09 | Published captures come from CI's capture job on a pinned `ubuntu-24.04`; a cross-runtime check is deferred | CI found a capture's bytes hold per runtime; owner chose option a (ADR-0010) |
| 2026-10-09 | The four development and eight held-out section files move from G2 to after the authored world plays end to end, as G3's first item | Owner decision: G3 and G4 need them; G2's interface does not |
| 2026-10-09 | A game-first interface replaces the brief's §6 layout. G2's interface items are renamed: LevelCard, Guide, PaperJournal, LevelMap, DepthToggle and a split-screen ForkView, plus a design spike first | Owner decision (ADR-0008): the §6 layout reads as a dashboard |
