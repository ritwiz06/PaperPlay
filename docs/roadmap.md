# Roadmap

The plan, gate by gate. What is happening right now lives in [status.md](status.md), and
finished slices are logged in [progress.md](progress.md). A gate is tagged only after
`npm run check:gate` passes on the pinned runtime and status.md records that output;
`gates.json` lists the requirements each gate enforces.

**The direction changed on 2026-10-09 (ADR-0021).** PaperPlay builds for AI/ML, biomedical
and scientific papers, with the flocking world as the reference example. The plan for it,
[design/every-paper.md](design/every-paper.md), was answered by the owner on 2026-10-10
(ADR-0024): G3 is re-cut into G3a and G3b, and this roadmap gives gates and effort, with no
calendar promises.

## Gates

| Gate | Tag | Planned effort | Requirements enforced | State |
|---|---|---|---|---|
| G1 Playable baseline | v0.1.0 | 21–28 h | R01–R04 | Passed and tagged v0.1.0 on 2026-10-01 |
| G2 Verified authored world | v0.2.0 | 21–28 h | R01–R08, R12 | Its interface is done; it waits for the Reynolds PDF and the source map |
| G3a Generalize, compartments, the pipeline on them | Chosen when it passes | 52–72 h | R01–R12 | G3a.1 and G3a.2 done; G3a.3, the pipeline, next |
| G3b Routing, the explainer tier, learning toys | Chosen when it passes | 22–32 h | R01–R12 | Not started |
| G4 Evaluation and feature freeze | v0.4.0 | 20–28 h | R01–R12, plus evaluation checks | Not started |
| G5 Delivery | v1.0.0 | 9–12 h | R01–R12 | Not started |

The primitive-builder agent comes after G4 (ADR-0024), with 12–18 h of its own.

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
- [x] The world art pass, at the owner's request:
  - low-poly birds with flapping wings, colour by heading and trails;
  - a valley with hills, a lake, trees, rocks, a sky and a sun;
  - a following camera.

  Done 2026-10-09, ADR-0013.

Next:
- [x] First: add `@axe-core/playwright` (approved 2026-10-01) and the axe scan in `test:e2e`
  (R12) (2026-10-09, commit 3639dfb).
- [ ] Source register, source map, reading notes and learning questions. The section files
  moved to G3 (see Plan changes, 2026-10-09).
- [x] Decide the group measure before any level teaches with it (owner, 2026-10-01). At the
  default density, 17% of random scatters counted as one group (ADR-0003). Done 2026-10-09:
  flock 3.0.0 and `npm run sweep:groups`, with 0 of 10,000 scatters reading as one group
  (`5d87b66`, `f37c9a9`, ADR-0015).
- [x] The level script for the flocking world, `docs/design/flocking-levels.md`, for the
  owner's review before WorldSpec (2026-10-09).
- [x] The full WorldSpec schema and the hand-authored `flocking-reference.json`, from the
  reviewed level script (2026-10-09, `0afc49d`, `211f13a`, ADR-0016). The fixture is a draft:
  its anchors are placeholders until the source map exists.
- [x] The level rule (ADR-0018): every level's stated effect measured on 20 skies and recorded
  in `eval/sweeps/levels.md`, re-run by a test; levels 2, 4 and 5 reworked to it (2026-10-09,
  `3647ec5`).
- [ ] `flocking-reference.json` reviewed: real anchors from the source map. Until then G2
  cannot pass (`e09ecd9`).
- [x] The deterministic builder, with binding fixtures (2026-10-09, `4d942fd`, ADR-0016).
- [x] `/world/hook` driven by the WorldSpec through all six levels: the level map, journal
  pages unlocking, a readout per level, and depth variants by element id (2026-10-09,
  `d2e9f9f`, `e5c30b7`).
- [x] A design spike at `/world/hook` with hard-coded content, screenshotted on desktop
  and phone (2026-10-09, `5aadf22`). The owner reviewed it the same day; it is tagged
  `spike/hook-2026-10-09` and never merged (ADR-0008).
- [x] The game-first shell (ADR-0008): a full-screen stage, with the LevelCard (the one
  control, its live readout and "What if"), the Guide and the LevelMap over it, and a
  HUD-aware camera fit (2026-10-09, `445912e`, ADR-0012). The readout is the heading
  compass.
- [x] The PaperJournal, with two-way provenance: "From the paper" on every control,
  passages unlocked level by level, and the origin legend (2026-10-09). The content now
  comes from the WorldSpec, with placeholder passages; real passages arrive with the source
  map.
- [x] The DepthToggle (Beginner / Intermediate / Advanced), in the level card and the
  journal (2026-10-09). It switches words, numbers, the equation and the analogy, by the
  element ids each depth variant names (`e5c30b7`).
- [x] The split-screen ForkView: two synchronized worlds and one measured difference
  between them, charted; stacked on a phone (2026-10-09, `8d62794`, ADR-0019).
- [x] Guided exploration in the guide: predict, intervene, observe, explain, never scored, with
  level 2's prediction first (2026-10-09, `85e43fe`).
- [x] A prediction before every What-if, two choices, never scored, reported afterwards and
  saved in the run record, `runrecord/3` (2026-10-09, `ea2fdf1`, ADR-0023).
- [x] A speed control, 1x, 2x and 4x, with a run at 4x replaying bit for bit against 1x
  (2026-10-09, `b6e00d3`, ADR-0020).
- [x] Level 5's readout as the birds at rocks: a counter on the card, and rocks that light up
  while a bird is inside them (owner, 2026-10-09; `29f9646`, ADR-0018). Its fork no longer
  stalls for 1.6 s after its first frame.
- [x] WebGL context loss: the stage says so and offers "Tap to reload the world"; drawing
  resumes by itself if the browser gives the context back (2026-10-09, `7c81d9f`, ADR-0022).
- [x] The fork's chart spans its card and keeps 12 px labels on a phone (2026-10-09, `7c81d9f`,
  ADR-0019).
- [x] The speed button says "Speed 1×" (2026-10-09, `7c81d9f`, ADR-0020).

Moved out of G2 (owner, 2026-10-09, session 6):
- `/world/local` in the shell, and the replay export and import UI, wait until after G3's first
  generated world. `npm run replay` and its tolerance report go with them.
- The stale-evidence rule moves into G3, since generated worlds depend on primitive versions.

Later:
- [x] Loading the Three.js stage as its own chunk (2026-10-09, ADR-0017): the entry chunk is
  416 KB, the stage chunk 551 KB.
- [x] A Content-Security-Policy and security headers in `vercel.json`, tested against the
  built app (2026-10-09, `b4503a5`).
- [ ] Connect the static deploy (the owner), then check the policy against the preview and
  tighten it.
- A cross-runtime capture check: Mac and Linux frames agree within a stated pixel tolerance,
  with bird pixels overlapping (option b of the 2026-10-09 capture finding, ADR-0010).

## G3 Constrained generation

Exit, unchanged: one complete generated experience, honest on failure; the reviewer cannot
bypass a failed check. Re-cut into two gates (ADR-0024), with effort from
[design/every-paper.md](design/every-paper.md) §5.

### G3a Generalize, the compartment family, and the pipeline on it

G3a.1, generalize, with no change in behaviour (14–20 h). Every existing test passes with only
its imports and paths changed; the six levels on seed 5 replay bit for bit against records
made before the refactor; the Mac capture's frame hash matches its pre-refactor hash.
- [x] Records of the six levels on seed 5, made before the refactor, and a test that holds the
  code to them (2026-10-10, `fc3f828`, `8de1c33`).
- [x] Primitive families: the primitive interface (family, time, space, entities, queries);
  the flock moved into the agents family; the torus a shared space (2026-10-10, `f111195`,
  ADR-0025).
- [x] Scene kits: the kit contract across the stage core, the adapter and React; a generic
  FrameDescription; the flocking kit, called the valley kit (2026-10-10, `ba1ac50`, ADR-0026).
- [x] The session and the fork made generic (2026-10-10, `ba1ac50`); each world opens on its
  spec's own seed (`dde1cec`).
- [x] `worldspec/3`: routing tier, scene kit, time unit, the opening seed, and what the world
  cannot show; `worldspec/2` still read (2026-10-10, `dde1cec`, ADR-0027).

G3a.2, the compartment family and Kermack and McKendrick by hand (14–20 h):
- [x] The expression tree, its units, and the RK4 solver with its accuracy check (2026-10-10,
  `fcf7c71`, `32c7899`, ADR-0028).
- [x] The family's checks and its hand-written oracles (2026-10-10, `7e20957`, `fcf7c71`).
- [x] The town scene kit, and the shell playing any world (2026-10-10, `cf2551d`, ADR-0029).
- [x] The Kermack and McKendrick world, Threshold Town, a draft until its anchors are real,
  every level meeting the level rule over the world's values and 19 near them (2026-10-10,
  `cf2551d`, `eval/sweeps/levels-kermack-mckendrick-1927.md`).
- [x] Every world's journal page, "What this world cannot show" (2026-10-10, `cf2551d`).

G3a.3, the pipeline on a known family (24–32 h):
- [x] The model gateway's key in `apps/api/.env` only, and the bundle secret check in every
  production build (2026-10-14, `9251435`, ADR-0030).
- [ ] `apps/api`: jobs, SSE events, JSON artifacts, upload limits, and the paper-text sanitiser.
- [ ] Ingest from arXiv source and PDF, with the source register (ADR-0024's dependencies).
- [ ] `packages/pipeline`: model adapters (mock first), the router (compartments only),
  planner and designer, explainer, the level-rule sweep, checks, the second transcription,
  reviewer, and the controller with at most two scoped repairs.
- [ ] The `/create` storyboard with real job states (and StatusChip), and explicit failure
  outcomes.
- [ ] Elowitz and Leibler generated end to end: a mock-adapter test and one recorded
  real-provider run.

After G3a's first generated world (owner, 2026-10-09):
- [ ] Replay export and import with `npm run replay`, and `/world/local` in the shell.
- [ ] The stale-evidence rule: a new primitive version or source hash resets the checks that
  depend on it (moved from G2).

### G3b Routing, the explainer tier, and the learning family

- [ ] The router across families; `explainerspec/1` and its page; PubMed Central ingest by a
  supported route, tested on one CC BY compartment-model paper (8–12 h).
- [ ] Learning toys on the valley as a loss landscape: Adam beside SGD, then dropout on a tiny
  network, with the miniature label enforced (14–20 h).

Later:
- The widget tier, behind `FEATURE_WIDGETS=1` (stretch).
- The four development and eight held-out section files of the flocking paper (moved from G2 on
  2026-10-09). G4 now evaluates on papers from three domains (ADR-0021), so whether they are
  still needed is decided when G4's protocol is frozen.

## G4 Evaluation and feature freeze

Re-planned (ADR-0021, ADR-0024): an evaluation on a fixed set of papers from all three
domains, at least two each, against a single-pass baseline, instead of the flocking paper's
held-out sections. See [design/every-paper.md](design/every-paper.md) §5.

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

"Used" counts Claude Code session time (wall clock, from session logs and
commit times). The owner's own focused hours are not tracked unless logged.

| Gate | Planned | Used so far |
|---|---|---|
| G1 | 21–28 h | 2026-09-28 to 2026-10-01, about 8.3 h of sessions: 1.4 h (09-28), 5.4 h (09-30) and 1.5 h (10-01). Under plan, because Claude Code did the building; the owner's own review time is not tracked |
| G2 | 21–28 h | G2's early RunRecord and replay work. Then five sessions on 2026-10-09:<br>• 00:51 to 01:45, about 0.9 h: `main`, ADR-0008, the axe scan, the demo capture, the hook spike and the plan change.<br>• 10:25 to 11:05, about 0.7 h: `origin`, CI, `--frames` and the capture finding.<br>• 11:06 to about 12:05, about 1 h: the canonical capture, the shell, the world art, the capture's camera and the level script.<br>• 12:08 to about 14:25, about 2.3 h: the group measure, WorldSpec and the builder, the six levels from the spec, the stage split and the deploy configuration.<br>• 15:08 to about 16:20, about 1.2 h: the level rule, flock 3.1.0, the fork, guided exploration, the speed control and the CSP.<br>• 20:15 to about 22:10, about 1.9 h: `npm run land` and the hook, the direction (ADR-0021), level 5's readout and its fork's stall, context loss and the phone chart, a prediction before every What-if, and the plan for every paper. |
| G3a | 52–72 h | 2026-10-10, 00:13 to about 09:20, about 9 h of one session: the owner's answers, G3a.1 (records, families, scene kits, `worldspec/3`) and G3a.2 (the compartment family, the town kit, Threshold Town), six branches landed through `npm run land`, then a closing record. Its wall clock includes about 2 h of waiting on CI |
| G3b–G5 | As in Gates | None yet |

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
| 2026-10-09 | A world art pass before the capture is re-filmed | Owner: the world looked like a debug view (ADR-0013) |
| 2026-10-09 | The four development and eight held-out section files move from G2 to after the authored world plays end to end, as G3's first item | Owner decision: G3 and G4 need them; G2's interface does not |
| 2026-10-09 | A game-first interface replaces the brief's §6 layout. G2's interface items are renamed: LevelCard, Guide, PaperJournal, LevelMap, DepthToggle and a split-screen ForkView, plus a design spike first | Owner decision (ADR-0008): the §6 layout reads as a dashboard |
| 2026-10-09 | The group measure links birds only with headings within 45°, counts clusters under 4 birds as strays, and reads "one group" as O1: one group holding at least half the birds (flock 3.0.0) | Owner decisions; the bare count failed the owner's 1% criterion (ADR-0015) |
| 2026-10-09 | The hook seed moves from 4 to 5; the demo capture stays on seed 4 | Owner: follow ADR-0003's rule under the new measure (ADR-0015) |
| 2026-10-09 | The source register and source map wait for the Reynolds PDF; the group measure, WorldSpec and the builder go first, with placeholder anchors clearly marked | Owner decision: the PDF is not on disk yet |
| 2026-10-09 | WorldSpec gains a draft status with placeholder anchors and a pending source; Level gains a goal, a bonus flag, a slider, setup, a guide script and further reading; depth variants name a closed list of shell elements; equations are Unicode text; DesignSpec drops layout and typography | Building it for the game-first shell and the owner's level decisions, with no source in hand (ADR-0016) |
| 2026-10-09 | Each What-if's expected effect is checked against the model before it is written into a fixture | Two of the level script's effects did not hold on seed 5 (levels 2 and 4) |
| 2026-10-09 | The Three.js stage loads as its own chunk; a static deploy on Vercel is configured, waiting for the owner's account | Owner request (slice 4); Vercel protects pull-request previews by default (ADR-0017) |
| 2026-10-09 | The level rule: every stated effect holds on at least 16 of 20 skies, measured before it enters a fixture, re-run by a test | Owner decision (ADR-0018) |
| 2026-10-09 | Level 2 becomes a prediction with a count stated exactly; level 4 becomes the flock's spread; level 5 gets four rocks and no rule for rocks; flock 3.1.0 adds E19 and E20 | The rule: level 4's groups and level 5's one rock failed it (ADR-0018) |
| 2026-10-09 | G2 cannot pass while the flocking world is a draft or holds a placeholder | Owner decision |
| 2026-10-09 | The deploy's Content-Security-Policy before the first deploy, tested against the built app | Owner decision (ADR-0017) |
| 2026-10-09 | What if runs a split-screen fork whose chart is the level's measured difference; level 2 asks for a prediction first; a speed control | Owner's slices 2–4 (ADR-0019, ADR-0020) |
| 2026-10-09 | `main` moves only through `npm run land`, and a pre-push hook refuses any other push to `main` | Owner decision, after three broken states reached `main` (ADR-0009, amended) |
| 2026-10-09 | PaperPlay builds for AI/ML, biomedical and scientific papers; the flocking world becomes the reference example; primitive families, scene kits, three routing tiers, the level rule as a pipeline stage, and ingest from arXiv source, PubMed Central XML and PDF. G3 and G4 are re-planned for the owner's review | Owner decision (ADR-0021) |
| 2026-10-09 | Replay export UI and `/world/local` in the shell wait until after G3's first generated world; the stale-evidence rule moves into G3 | Owner decision, session 6 |
| 2026-10-09 | A prediction before every What-if, saved in the run record (`runrecord/3`); the stated effects say "this world" and "the other world", not left and right | Owner request (ADR-0023); on a phone the two worlds stack |
| 2026-10-10 | The plan for every paper is answered: the families' order, equations as data as tier A with an independent second transcription, the level rule over 20 starts for models with no randomness, three dependencies approved, the licence policy, PubMed Central's supported routes | Owner decisions (ADR-0024) |
| 2026-10-10 | G3 is re-cut into G3a (generalize, compartments, the pipeline on them) and G3b (routing, the explainer tier, learning toys); the primitive-builder agent comes after G4; the roadmap gives gates and effort, with no day ranges | Owner decision (ADR-0024): G3 as written could not hold the work |
| 2026-10-10 | G3a.1 starts with records of the six levels made before the refactor, so the refactor is held to them | The owner's acceptance condition for G3a.1 |
| 2026-10-10 | A fork in every family but the agents' tells its run from the start, and a run with an end can start again | An epidemic opened after it ends shows nothing (ADR-0029) |
| 2026-10-10 | The levels sweep runs every authored world, over its family's variation, and holds a compartment world's every run to the accuracy check | ADR-0024's level rule for models with no chance in them (ADR-0029) |
| 2026-10-14 | The model provider is ASU Research Computing's Voyager gateway, not the Anthropic SDK; tests and CI replay recorded calls; generation runs only locally | Owner decision (ADR-0030) |
