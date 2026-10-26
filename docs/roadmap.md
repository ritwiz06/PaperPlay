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
| G2 Verified authored world | v0.2.0 | 21–28 h | R01–R08, R12 | Passed and tagged v0.2.0 on 2026-10-18, G2 current from then; release notes in `docs/releases/v0.2.0.md` |
| G3a Generalize, compartments, the pipeline on them | Chosen when it passes | 52–72 h | R01–R12 | Every item built; closed out 2026-10-17, two worlds made under every rule; what counts as definitional held by code from 2026-10-17, corrected by the owner on 2026-10-18 and hepatitis C regenerated under it, three levels with its hook on the quitters (ADR-0044's amendment) |
| G3b Routing, the explainer tier, learning toys | Chosen when it passes | 29–43 h and Momentum Valley (ADR-0046) | R01–R12 | The owner's decisions taken; the learning family, the landscape kit and Momentum Valley done (ADR-0047) |
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
- [x] Source register and source map (2026-10-17, `0a24c13`, ADR-0045): Reynolds's paper from
  his own site, registered as ACM's copyright and the author's copy, its text not kept; 13 claims
  located by `npm run sources:map` and checked against a fresh fetch by `npm run sources:check`.
- [ ] Reading notes and learning questions. The section files moved to G3 (see Plan changes,
  2026-10-09).
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
- [x] `flocking-reference.json` reviewed: real anchors from the source map, four statements
  reworded to say only what the paper says (2026-10-17, `0a24c13`, ADR-0045).
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
- [x] The Voyager adapter: per-stage models in configuration, timeouts, retries, a rate limit, a
  token budget, every call recorded, replay in tests, `npm run pipeline:live` and the capability
  probe (2026-10-14, `796fdc4`, ADR-0030).
- [x] `apps/api`: jobs, SSE events, JSON artifacts, upload limits, and the paper-text sanitiser
  (2026-10-14, `16dac04`, ADR-0033).
- [x] Ingest from arXiv's LaTeX source and PubMed Central's JATS, with the source register and
  the sanitiser (2026-10-14, `3aead5f`, ADR-0031).
- [x] Ingest from PDF text: page and character offsets, display equations recovered or refused
  by reason, arXiv's PDF-only route and a PDF from this machine (2026-10-16, `f7da06c`, ADR-0038).
- [x] Transcriptions, their structural match and three gold answers (2026-10-14, `2577025`,
  ADR-0032).
- [x] `packages/pipeline`: the router (compartments only), reader, two transcriptions, planner,
  explainer, the level-rule sweep, checks, reviewer, and the controller with at most two scoped
  repairs (2026-10-14, `16dac04`, ADR-0033).
- [x] The bake-off per stage against the gold answers, in `eval/models.md`, and each stage's
  model chosen from it (2026-10-16, `c261409`, ADR-0035; provisional until the owner names the
  models marked "Testing in progress").
- [x] The `/create` storyboard with real job states and explicit failure outcomes (2026-10-14,
  `870c541`, ADR-0034).
- [x] The first generated world, from one of the three gold papers, end to end: one recorded
  live run, replayed in tests (the owner's G3a.3 request replaced Elowitz and Leibler with a
  compartment paper, 2026-10-14): PMC12334037, hepatitis C (2026-10-16, `eb5aab9`, ADR-0035).
- [x] Worlds made under the owner's rules of 2026-10-16: running the paper's own numbers, five
  levels, the hook never dropped; the hepatitis C and tuberculosis worlds, ready and replayed
  (2026-10-17, `ec2688d`, ADR-0039 to ADR-0041).

### G3a close-out, 2026-10-17

**What G3a set out to do** (ADR-0024): make the code general beyond flocking, add a second family
by hand, and run the pipeline on that family, from a paper to a checked, playable world, honest
when it cannot make one.

**What holds:**
- **General code:** primitive families, scene kits across three layers, `worldspec/3`, the generic
  session and fork; the flocking world plays exactly as before, held to records made before the
  refactor.
- **The compartment family:** models as data, one RK4 solver with its accuracy check, units,
  positivity and conservation checks, hand-derived oracles; the town kit; Threshold Town by hand.
- **The pipeline, end to end:** ingest from arXiv's LaTeX, PubMed Central's JATS and PDF; the
  sanitiser; routing, reading, two transcriptions from different vendors that must agree, value
  sets picked by rule; planning, explaining, the level rule, the visibility rule, the findings
  check, running the paper's own numbers, provenance and the reviewer, with at most two scoped
  repairs; real job states over server-sent events; `/create`; every live call recorded and
  replayed in the tests; models chosen by a bake-off against gold answers.
- **Honest failure:** a job that cannot make a world says exactly why: transcriptions that
  disagree, a value set the rule cannot pick, a hook that cannot be made to show, a mistake of ours
  found by running the paper's own numbers.
- **The machine's rules:** no personal data out unless the owner sets it; live jobs and gates never
  share the machine.

**What does not hold, or not yet:**
- **Under the corrected rule, a world keeps fewer levels.** Hepatitis C's regeneration of 2026-10-18
  kept three of five: the code found three of the planners' levels definitional, the adherence hook
  stayed so after both repairs, and one level's words still misdescribed the model after they were
  written again. The tuberculosis world of 2026-10-18 has two definitional levels by the rule and
  waits on the owner (ADR-0044's amendment).
- **The model stages are the least steady part.** The planner's pick changed three times in two
  days as its prompt changed, and the reviewer that blocks the bake-off's planted faults exactly
  blocks most levels of a planner's world as definitional.
- The reproducibility check reads the reproduction number only; other headline quantities rest on
  the level rule and the visibility rule alone.
- G2's evidence still waits on the Reynolds PDF; replay export and `/world/local` in the shell,
  and the stale-evidence rule, are not done.

**Effort:** planned 52–72 h. Used, by session wall clock, which includes waiting on live model
calls and on CI: 2026-10-10 about 9 h; 2026-10-14 about 6 h; 2026-10-15 about 4 h; 2026-10-16
about 20 h across two sessions; 2026-10-17 about 5 h. About 44 h of sessions.

After G3a's first generated world (owner, 2026-10-09):
- [ ] Replay export and import with `npm run replay`, and `/world/local` in the shell.
- [ ] The stale-evidence rule: a new primitive version or source hash resets the checks that
  depend on it (moved from G2).

### G3b Routing, the explainer tier, and the learning family

Planned in [design/g3b.md](design/g3b.md); the owner's decisions of 2026-10-17 are its §4
(ADR-0046): update rules as data, attention after G4, Adam from its LaTeX with Reddi et al. 2018 a
possible bonus level, Dropout from the 2014 JMLR paper with the paper's keep-probability, G3b's gate
Adam alone, tier C now and minimal, and the level rule's starts over seeds or a neighbourhood. A
hand-authored momentum world is the family's reference; Adam is the first generated world, held
out. PubMed Central ingest, once here, landed in G3a.3.
- [ ] G3b.1a: the router across families, its routing set grown to sixteen papers (4–6 h).
- [ ] G3b.1b: tier C at its smallest: `explainerspec/1`, its page, one tier C paper end to end.
- [x] G3b.2a: `learning.landscape@1.0.0` and `OptimizerSpec`, update rules as data, with oracles
  derived by hand (2026-10-17, `7f25db9`, ADR-0047).
- [x] G3b.2b: the landscape kit, the loss surface as terrain, both balls in a fork, the miniature
  label at every depth (2026-10-17, `7f25db9`, ADR-0047).
- [x] Momentum Valley, the family's reference, from Sutskever et al. 2013: five levels meeting the
  level rule and the visibility rule, reviewed against its source map (2026-10-17, `7f25db9`,
  `9e46daa`, ADR-0047). It takes the place of authoring Adam by hand (G3b.2c).
- [ ] G3b.2d: the pipeline on learning: the transcriber's grammar for algorithms, the planner's and
  explainer's worked example, the bake-off's learning scenario, the own-numbers check (8–12 h).
- [ ] G3b.2e: Adam through the pipeline, recorded and replayed: paused 2026-10-20; G3's gate is now BERT in the attention family (ADR-0052).
- [ ] After G3b's gate: `learning.network@1` and Dropout through the pipeline (10–14 h).
- [x] R13, fast generation: the deadline-aware controller, thinking only for the transcriptions and
  the reviewers, words only for changed levels, levels released as they pass, read once, worlds kept
  by paper and version, `prebuild` and `npm run timing` (2026-10-24, ADR-0053). The live p90 waits on
  the tuberculosis speed run.
- [x] Planning in code (ADR-0055): the compartment family's candidate levels made and judged before
  any planner, a compact planner choosing among them (glm-5-3 and muse-glimmer-30b, from a timed
  bake-off), the explainer writing every word, levels reviewed as written, the router told each
  family's real reach (2026-10-25).
- [x] The attention family, slice 1 (2026-10-25, ADR-0054): `attention.toy@1.0.0`, deterministic in
  pure TypeScript with its own exp and softmax, its oracles by hand, and its candidate generator.
- [x] The attention family, slice 3 (2026-10-25, ADR-0057): the miniature trained offline in PyTorch
  over 20 seeds, its weights committed, attention.toy@1.1.0 running them as PyTorch does, the
  browser's bits Node's. Its heads did not specialise; the multi-head level has its own miniature,
  a random table over 16 digits, whose two heads split the work and beat one head on every seed
  (ADR-0057's amendment, 2026-10-25).
- [ ] The attention family, slices 2 and 4 to 7 (`docs/design/ai-papers.md`): the scene spike, for the
  owner's review; the scene kit; the explorer's smallest form; Attention Is All You Need by hand;
  BERT generated, G3's gate.
- [ ] Transcription by selection (ADR-0056), before biomedical work: code extracts the equations
  and values, the model selects; value sets by code; one reconciliation call; optimistic pipelining.

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
| G3a | 52–72 h | About 44 h of session wall clock, which includes waiting on live model calls and on CI:<br>• 2026-10-10, about 9 h: the owner's answers, G3a.1 and G3a.2, six branches landed.<br>• 2026-10-14, about 6 h: the gateway, ingest, transcriptions, the pipeline, `/create`.<br>• 2026-10-15, about 4 h: the bake-off and its fixes.<br>• 2026-10-16, about 20 h across two sessions: the first generated world, the models in testing excluded, value sets, visible lessons, findings, PDF ingest, the machine's rules, running the paper's own numbers.<br>• 2026-10-17, about 5 h: five levels, the bake-off again, the two worlds, the close-out and the G3b plan. |
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
| 2026-10-17 | G3a closed out: every item built, two worlds made under every rule. G3b planned in design/g3b.md at 49–71 h, a smaller G3b at 29–43 h, its decisions the owner's | Owner request, 2026-10-16 |
| 2026-10-20 | PaperPlay teaches the corpus of 34 AI and ML papers first; G3's gate becomes BERT, the attention family's first generated world; G3b's Adam slices paused; the plan is docs/design/ai-papers.md | Owner decision (ADR-0052) |
| 2026-10-24 | R13, fast generation: a world from an unseen paper p90 under 15 minutes, a made one at once; the controller works to a 12-minute deadline (ADR-0053) | Owner decision (ADR-0053) |
| 2026-10-25 | R13's job budget is 15 minutes; planning moves into code, the planner only chooses; the planners are glm-5-3 and muse-glimmer-30b; a paper no existing family covers routes to tier C until its family exists | Owner decision (ADR-0055) |
| 2026-10-24 | The first set to build: attention (four papers), formulas (two), diffusion (three), agents pre-built (two); the explorer's smallest form alongside attention, formulas second; agent-experiment worlds pre-built only | Owner decision (ADR-0054) |
| 2026-10-18 | G2 made current and tagged v0.2.0; CI's gate skipped on main when its branch passed, the capture on demand only | Owner decisions (ADR-0048) |
| 2026-10-18 | Definitional corrected: the control in the measured compartment's own equation, measured on its level or peak; found by code before review; a spread headline's hook on an infected compartment; one reviewer's unsupported block enough, checked by code where the model can; reviewers never the planners or the explainer, inkling-small and qwen38-27b picked | Owner decisions (ADR-0044's amendment) |
| 2026-10-17 | G3b's decisions: update rules as data, attention after G4, G3b's gate Adam alone, tier C now and minimal; a hand-authored momentum world as the learning family's reference | Owner decisions (ADR-0046) |
| 2026-10-17 | What counts as definitional held by code: the direct-effect tag, a named term, emergent summaries exempt, two reviewers who must agree, unsupported words written again; the reviewers' bake-off reads its cases from data and keeps every live mistake | Owner decision (ADR-0044) |
| 2026-10-17 | G2's source is Reynolds's own copy on red3d.com, not the owner's PDF; Threshold Town's waits on a browser download, the Royal Society refusing this machine's requests | Owner instruction (ADR-0045) |
| 2026-10-16 | Models in testing excluded; several value sets picked by rule; a visibility rule beside the level rule, levels on the paper's findings with the hook on its headline, shares as their own unit; then PDF ingest, the last of G3a.3 | Owner decisions (ADR-0035's amendments, ADR-0036, ADR-0037, ADR-0038) |
