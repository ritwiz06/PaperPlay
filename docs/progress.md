# Progress

An append-only ledger with one entry per finished slice, newest first. Entries are added,
never rewritten. The plan lives in [roadmap.md](roadmap.md) and the present state in
[status.md](status.md).

Each entry gives the branch, the commits, what shipped, the requirement evidence counts,
and the gate summary. Counts are passing tests tagged with each requirement.

## 2026-10-28 · Two apps on one machine; the Attention run's fixes

- Branches: `g3/two-apps`, `g3/mechanism-fixes`, stacked, landed together.
- Commits: `450a390`, `c6d374b`, `9972730`, `d4cbce9`, `9e17775`, and the docs.
- Shipped: ports from settings and 127.0.0.1 for every PaperPlay server, a busy port said plainly,
  `npm run stop`, the gate's wait for a quiet machine, the README's section (ADR-0059); What-ifs as
  the paper means each control, computed outcomes, the tier's own reviewer replacing a level whose
  What-if it blocks, row-relative scene contrast, the readout's words, the note's place, CLAUDE.md's
  second boundary (ADR-0058's amendment); a run of papers recorded row by row.
- Evidence: see status.md's latest check:gate.
- Gate: G2's `check:gate` inside `npm run land`, as its log shows.

## 2026-10-26 · The generated-mechanism tier, slice 1

- Branches: `g3/mechanism-module`, `g3/mechanism-tier`, `g3/mechanism-web`, stacked, landed together.
- Commits: `eb06cf5`, `130a804`, `54d0e0d`, `f3b5d6f`, `e81f15a`, `6dc46c3`, `4db3a7a`, `327460b`, and the docs.
- Shipped (ADR-0058): the mechanism module and its contract; the driver; the Node sandbox, an empty
  context in a worker thread with a heap limit; the browser's, a worker in its own-origin frame
  under its own policy; the deterministic checks; the writer, glm-5-3 by a timed comparison, and its
  fix loop; the tier's job through the machinery every world meets; the `generated` family, its
  label on every level; the six kits in two dimensions; a generated world in the shell; the
  explainer page as the fallback. Attention Is All You Need from /create: five levels playable at
  9.4 minutes, every one meeting the level rule; the reviewers blocked the hook, and the job asked
  the owner at 14 minutes.
- Evidence: R08 133 tests, R02 20, R06 78, R11 36, R12 30, ahead of their gates.
- Gate: G2's `check:gate` inside `npm run land`, as its log shows.

## 2026-10-25 · Planning in code

- Branch: `g3/candidates`, landed alone.
- Commits: through `4ecbecf`, and the docs.
- Shipped (ADR-0055): candidate levels made and judged in code before any planner, the candidate
  generator a family's hook; a compact planner (glm-5-3, with muse-glimmer-30b) from a timed bake-off;
  the explainer writing every word; levels reviewed as written; the router told each family's reach;
  an empty LaTeX heading no longer refusing a paper; a value at the run's end read correctly; R13's
  job budget 15 minutes.
- Evidence: R13, 22 tests, ahead of its gate; tuberculosis ready in 7.9 minutes with its
  transcriptions replayed, not yet fresh.
- Gate: G2's `check:gate` inside `npm run land`, as its log shows.

## 2026-10-24 · R13, fast generation

- Branches: `g3/live-outputs`, `g3/timing`, `g3/fast-jobs`, `g3/fast-docs`, landed together.
- Commits: `a9e8f48`, `63fe64e`, `25edac2`, `afd5e49`, `9d00f7e`, `2477c47`, `8c9da53`, `d13effa`.
- Shipped (ADR-0053, ADR-0054): `npm run timing`; thinking per stage and a 12-minute deadline in
  `models.json`; the controller's timed calls, repairs only when they fit, words only for changed
  levels, a level without words left out, levels released as they pass, a world unreviewed in time
  shipped saying so, read once; worlds kept by paper and version; `/create` and the world page
  showing released and cached worlds; `pipeline:live` `--fresh` and `prebuild`; the owner's
  decisions on the AI-papers plan and its first set.
- Evidence: R13, 17 tests, ahead of its gate; the live p90 waits on the speed run.
- Gate: G2's `check:gate` inside `npm run land`, as its log shows.

## 2026-10-17 · G3a.3, the pipeline on the compartment family, and G3a's close-out

- Branches: the G3a.3 branches of 2026-10-14 to 2026-10-17, from `g3/secrets` to `g3/five-levels`,
  each landed through `npm run land`.
- Commits: `9251435`, `796fdc4`, `3aead5f`, `2577025`, `16dac04`, `870c541`, `d08c88e`, `08127e3`, `4b93b58`, `43edeaf`,
  `53f55e1`, `61d6bbf`, `c261409`, `eb5aab9`, `d133792`, `7c17f96`, `d3af3df`, `43be8a0`,
  `b943b5b`, `8391216`, `f7da06c`, `8eefb73`, `ada5723`, `456defe`, `675795c`, `124d00f`,
  `ef4c054`, `d362648`, `ec2688d`.
- Shipped (ADR-0030 to ADR-0041):
  - **The pipeline from a paper to a checked world:** ingest from arXiv's LaTeX, PubMed
    Central's JATS and PDF, the sanitiser; routing, reading, two transcriptions from different
    vendors that must agree, value sets picked by rule; running the paper's own numbers; planning
    five levels, explaining them, the level rule, the visibility rule, the findings check,
    provenance and the reviewer, with at most two scoped repairs and the hook never dropped; real
    job states over server-sent events; `/create` on this machine.
  - **Every model call recorded and replayed;** models picked per stage by a bake-off against
    three gold transcriptions, rerun as the prompts changed.
  - **Three generated worlds:** the first hepatitis C world, kept as made; the hepatitis C and
    tuberculosis worlds of 2026-10-17, made under every rule, their jobs replayed in the tests.
  - **The machine's rules:** no address out unless the owner sets one; live jobs and gates never
    share the machine.
- Evidence: R01 151, R02 9, R03 153, R04 20, R05 12, R06 63, R07 40, R08 83, R09 46, R10 22,
  R11 27, R12 22.
- Gate: `check:gate` passed G1 on `g3/five-levels` at `ec2688d` (895 tests, 0 skipped); land's own
  run follows. G3a's close-out is in the roadmap.

## 2026-10-10 · The town kit and Threshold Town, and the end of G3a.2

- Branch: `g3/kermack-mckendrick`
- Commits: `cf2551d`
- Shipped (ADR-0029):
  - **The town kit, in three halves:** 120 figures coloured by compartment, a picture of the
    solver's shares, the ill standing in rings; the shares bar; the kit's disclosures.
  - **Threshold Town:** Kermack and McKendrick's special case of constant rates, by hand in
    `worldspec/3`, a draft, five levels at `/world/epidemic`. Every level meets the rule over the
    world's values and 19 within a tenth of them, and every run passes the accuracy check, the
    worst at 7% of its allowance.
  - **The shell plays any world,** its words following the world's family; a run with an end
    can start again; a compartment fork tells its run from day 0.
  - **The journal's page of what a world cannot show,** on both worlds.
  - **The levels sweep runs every authored world;** the flock's record is byte-identical.
- Evidence: R01 151, R02 9, R03 151, R05 5, R06 53, R08 59, R12 18.
- Gate: `check:gate` passed G1 on the branch's code (746 tests, 0 skipped), recorded in the
  session log; land's own run follows.

## 2026-10-10 · The compartment family

- Branch: `g3/compartments`
- Commits: `021bff3`, `7e20957`, `fcf7c71` (a subagent's, reviewed), `32c7899`
- Shipped (ADR-0028):
  - **A compartment model as data:** the ModelSpec, its closed expression grammar, its units.
  - **`compartments.ode@1.0.0`:** a closure interpreter, dimensional analysis, fixed-step RK4,
    and four checks: accuracy at dt against dt/2, which refuses stiff or unstable models;
    positivity; conservation, proved symbolically where it can be; steady states.
  - **Nine oracles derived by hand:** decay, growth, the logistic curve, S + I + R conserved,
    SIR's final size, a stiff decay refused, replay, and two more.
  - **In the registry and the builder:** a solver binds a model; the builder runs the checks on
    both worlds of every fork; the tolerance is capped at a thousandth.
- Evidence: R01 150, R03 150, R08 57.
- Gate: land's `check:gate` on this branch's tip, recorded in the session log.

## 2026-10-10 · worldspec/3, and the end of G3a.1

- Branch: `g3/worldspec-3`
- Commits: `dde1cec`
- Shipped (ADR-0027):
  - **`worldspec/3`:** routing, the scene kit by id, the time unit, the opening seed, a
    prediction required of every level, and what the world cannot show.
  - **`worldspec/2` is still read,** by its own schema, and upgraded to version 3 before
    anything is built.
  - **The builder on version 3,** checking kit, routing, time unit and the watching bound.
  - **The flocking fixture migrated;** the levels sweep's record unchanged byte for byte.
  - **G3a.1's acceptance:** tests changed only their imports, but for four lines that read the
    level's time by its new name; the records replay bit for bit; the capture's frame hashes
    are `f0bc31c`'s.
- Evidence: R03 120 (12 new), R08 53 (5 new).
- Gate: land's `check:gate` on this branch's tip, recorded in the session log.

## 2026-10-10 · Scene kits, and a generic stage and session

- Branch: `g3/scene-kits`
- Commits: `ba1ac50`
- Shipped (ADR-0026):
  - **A scene kit in three halves:** its pure half describes frames; its Three.js half draws
    its layers; its React half shows its readouts, mark and tools.
  - **A generic FrameDescription:** the stage's part (camera, field, palette, rings) and the
    kit's own typed layers.
  - **The valley kit,** moved unchanged. The capture's frame hashes are `f0bc31c`'s.
  - **A generic session and fork:** `createSession(primitive, view, options)`, the valley's
    view, and a fork that spawns its worlds on the level's own primitive.
  - **Tests changed only their imports.**
- Evidence: unchanged counts; `packages/ui/test/kits.test.ts` new.
- Gate: land's `check:gate` on this branch's tip, recorded in the session log.

## 2026-10-10 · Primitive families

- Branch: `g3/families`
- Commits: `f111195`
- Shipped (ADR-0025):
  - **The families' catalogue as data in contracts:** six families, their labels and how the
    level rule varies their runs; the kinds of space; time units.
  - **The primitive interface describes its family, time, space, entities and queries,** none
    of which changes a run.
  - **The flock is the agents family's first primitive,** at `@paperplay/primitives/flock`,
    still 3.1.0; the torus is a shared space. Every other file changed only its imports.
- Evidence: R01 65 (4 new), R03 108 (5 new); the records test passes on the moved flock.
- Gate: land's `check:gate` on this branch's tip, recorded in the session log.

## 2026-10-10 · The flocking world recorded before G3a's refactor

- Branch: `g3/records`
- Commits: `fc3f828`, `8de1c33`
- Shipped:
  - **Eighteen run records** in `fixtures/records/flocking-seed5/`, made once by the code at
    `f0bc31c`: each of the six levels as played on seed 5, and both worlds of its fork.
  - **`apps/web/test/records.test.ts` [R07]** holds the code to them: each replays bit for bit
    at tolerance 0 against the world as built today, and the app's own session and fork make
    each again byte for byte. Two planted bugs caught: a nudged cohesion constant fails 17
    replays and the remake; a control recorded a step late fails the remake only.
  - **The first comparison of a Mac run with a Linux run, bit for bit.** CI's Linux x86-64
    replayed every record state for state, and every observable bit for bit except one sample
    of E19, the largest group's spread, one ulp off: its circular mean uses `Math.cos`,
    `Math.sin` and `Math.atan2`, which engines may round their own way. Land refused the first
    landing on it. The test now holds the records bit for bit on darwin arm64, where they were
    made, and elsewhere state for state, by each final state's hash, with E19 within 1e-12.
  - **The owner's answers to the plan** (ADR-0024), and the roadmap re-cut into G3a and G3b,
    with gates and effort and no day ranges.
- Evidence: R07 40 (20 new); G1's four requirements as before.
- Gate: G1 passed on `fc3f828`, 565 tests, 0 skipped.

## 2026-10-09 · The plan for every paper (for the owner's review)

- Branch: `g2/every-paper`, docs only
- Commits: this branch's single docs commit; the code it describes is at `ea2fdf1`
- Shipped: `docs/design/every-paper.md`:
  - the generalization audit: 66 places that assume flocking, and 3 already general;
  - the general interfaces: primitive families, equations as data, scene kits, a generic
    FrameDescription, `worldspec/3`;
  - the agent pipeline, stage by stage;
  - the order of families and the first test papers;
  - the roadmap re-planned with effort;
  - what will never work well, and how the app says so.
- Evidence: none; it is a plan.
- Gate: unchanged since `ac6f413`.

## 2026-10-09 · A prediction before every What-if

- Branch: `g2/predictions`
- Commits: `ea2fdf1`
- Shipped (ADR-0023):
  - **Every level asks for a prediction before its What-if:** two choices, never scored. At the
    level's time the guide reports this sky's result by the choice it bears out, the rule
    across 20 skies, the paper's point and a question.
  - **`runrecord/3`** keeps each prediction at its step, as a note that replay ignores. The
    session builds the whole record with `record(identity)`.
  - **The stated effects say "this world" and "the other world",** not left and right, which
    were wrong on a phone.
- Evidence: the browser tests on every level, compared with Node on seed 5; the gate's count is
  in the session log.
- Gate: land's `check:gate` run on this branch's tip, recorded in the session log.

## 2026-10-09 · The stage survives context loss; the fork's chart fits a phone

- Branch: `g2/stage-resilience`
- Commits: `7c81d9f`
- Shipped:
  - **WebGL context loss** (ADR-0022): a notice over the canvas with "Tap to reload the
    world", which builds a new renderer for the same scene. Drawing resumes by itself if the
    browser gives the context back. The run never notices.
  - **The fork's chart** spans its card and keeps 12 px labels on a phone (ADR-0019).
  - **The speed button says "Speed 1×"** (ADR-0020).
- Evidence: three context tests and a phone chart test, all in the browser; the gate's count is
  in the session log.
- Gate: land's `check:gate` run on this branch's tip, recorded in the session log.

## 2026-10-09 · Level 5 reads as birds at rocks

- Branch: `g2/level5-readout`
- Commits: `29f9646`, `f849035` (the fork test's timeout, after CI failed on it)
- Shipped (ADR-0018, owner's confirmation):
  - **The rocks counter,** level 5's readout: the birds inside rocks right now (E20), and each
    rock, lit while a bird is at it.
  - **Rocks that light up on the stage** while a bird is inside them, from flock query Q4.
    Presentation only, with a material that needs no new shader.
  - **Level 5's fork no longer stalls:** its second frame comes at about 0.3 s, not 1.9 s.
    Rock markers cast no shadow.
- Evidence: 471 Vitest tests pass; the gate's count is in the session log.
- Gate: land's `check:gate` run on this branch's tip, recorded in the session log.

## 2026-10-09 · A guard for main

- Branch: `g2/land`
- Commits: `3454a1d`
- Shipped (ADR-0009, amended):
  - **`npm run land`, the only routine way `main` moves.** It refuses a dirty tree, main
    itself, a spike branch, and a branch behind `main`. It runs `check:gate` and reads its exit
    status directly, then pushes the branch and waits for CI on that exact commit with
    `gh run watch`. Only on green does it fast-forward `main`, push it and delete the branch.
  - **A pre-push hook** refuses any push that would move or delete `main`, unless land
    recorded the commit as gate-passed and CI-green.
  - **15 tests** on throwaway repositories, a planted failing gate among them. They catch four
    planted bugs in land and the guard.
- Evidence:
  - R01 58, R02 6, R03 102, R04 18;
  - from 521 tests with none skipped, on `cc3d4cf`, before an amend added one untagged test.
- Gate: `check:gate` G1 passed on `cc3d4cf`. Land's own run is on this branch's tip.

## 2026-10-09 · The speed control

- Branch: `g2/speed`
- Commits: `b6e00d3`, a fix to the fork's display, and `e452bc3`
- Shipped (ADR-0020):
  - **1x, 2x and 4x,** as more fixed steps per frame, in the HUD and in the fork.
  - **A run at 4x matches the same run at 1x bit for bit,** and replays from its record.
  - **At 4x the fork reaches a level's time** within the browser tests. It measures what the
    sweep recorded for seed 5, and level 2's guide reports the 20 skies.
  - **`e452bc3`** fixes a browser test that slice 3 broke on `main`.
- Evidence:
  - R01 58, R02 6, R03 102, R04 18;
  - ahead of their gate: R05 4, R06 30, R07 18, R08 48, R12 14;
  - from 506 tests with none skipped.
- Gate: `check:gate` G1 passed at `e452bc3`.

## 2026-10-09 · Guided exploration

- Branch: `g2/guided-exploration`
- Commits: `85e43fe`
- Shipped:
  - **Predict:** What if on level 2 makes the guide ask, "If every bird could see the whole
    flock, would the flock come to agree faster?", with two choices, neither marked right.
  - **Intervene:** the choice opens the fork.
  - **Observe:** the fork's guide repeats the prediction and names the intervention.
  - **Explain:** at the level's time, the guide reports two measurements:
    - this sky;
    - the 20 skies, faster on 6 and about the same or slower on 14.

    Then the paper's point, a placeholder anchor, and a question to think about. The level's
    surprise waits until then.
- Evidence: 3 unit tests and 4 browser tests, with axe on both sizes.
- Gate: run with the speed control, below.

## 2026-10-09 · The fork

- Branch: `g2/fork-view`
- Commits: `6c9a5a2`, `8d62794`
- Shipped (ADR-0019):
  - **What if now runs both worlds,** in step on one clock.
    - The worlds branch from the moment the fork opens, or restart from the seed when the
      What-if changes a start-up variable ("Both worlds restart").
    - The fork charts the level's measured difference, and reports it, with the level's
      statement, at the level's time.
  - **The fork measures what the sweep measures:** opened at a level's start on seed 5, all six
    levels match `eval/sweeps/levels.md`.
  - **Layout:** side by side on a desktop, stacked on a phone.
- Evidence: 10 fork unit tests and 6 browser tests, with axe on both sizes.
- Gate: run with the guided exploration, below.

## 2026-10-09 · The level rule

- Branch: `g2/level-rule`
- Commits: `7f9c547`, `3647ec5`, `804038a`, `e09ecd9`, `b4503a5`
- Shipped (ADR-0018, ADR-0017):
  - **Flock 3.1.0:** the largest group's spread (E19), birds at rocks (E20), and the spread
    query (Q3), each derived by hand into the oracle fixtures first.
  - **`worldspec/2`:** each What-if states its measured difference and claim.
  - **`npm run sweep:levels`:** all six levels meet the rule, recorded in
    `eval/sweeps/levels.md` and re-run by a test.
    - Level 2's surprise is a count stated exactly, after a prediction: 6 of 20.
    - Level 4 is the flock's spread, with a ring on the ground: 20 of 20.
    - Level 5 has four rocks and no rule for rocks: 20 of 20.
  - **G2 cannot pass** while the flocking world is a draft.
  - **The deploy's Content-Security-Policy and headers,** tested against the built app.
- Evidence:
  - R01 58, R02 6, R03 102, R04 18;
  - ahead of their gate: R05 4, R06 8, R07 14, R08 48, R12 10;
  - from 473 tests with none skipped;
  - 4 of 4 bugs planted in the new measures caught.
- Gate: `check:gate` G1 passed at `b4503a5`.

## 2026-10-09 · The stage as its own chunk, and a deploy configuration

- Branch: `g2/stage-split`
- Commits: `2ce3b34`
- Shipped (ADR-0017):
  - `WorldStage` loads the Three.js adapter on demand. The entry chunk is 416 KB, down from
    967 KB, and the stage chunk 551 KB.
  - `vercel.json`, for a static deploy with pull-request previews. Nothing is connected; the
    owner's steps are in ADR-0017.
  - A test that builds the production bundle and checks the split and the deploy
    configuration. It caught a planted eager import.
- Evidence:
  - R01 51, R02 6, R03 91, R04 18;
  - ahead of their gate: R05 4, R06 5, R07 14, R08 41, R12 10;
  - from 441 tests with none skipped.
- Gate: `check:gate` G1 passed at `2ce3b34`.

## 2026-10-09 · The six levels from the WorldSpec

- Branch: `g2/hook-levels`
- Commits: `d2e9f9f`, `e5c30b7`, `bd6ffa4`
- Shipped:
  - **`/world/hook` plays the built world**, `fixtures/worldspecs/flocking-reference.json`,
    through all six levels in order:
    - each level opens once the one before has been moved through its range;
    - the level map, with the bonus level marked;
    - journal pages appear as levels are reached, with placeholder passages that say so, and
      the bonus page cites Vicsek et al. as further reading;
    - one readout per level: the compass, the new spacing gauge, or the new groups counter;
    - the guide speaks from each level's script;
    - What if shows each level's counterfactual, and "Both worlds restart" on the bonus
      level;
    - depth variants show and hide the shell's elements by id.
  - **The session** takes a level's setup as place events at step 0, and loads a level on the
    same stage.
  - **An axe finding fixed:** the current level's name washed out on hover.
- Evidence:
  - R01 51, R02 6, R03 91, R04 18;
  - ahead of their gate: R05 4, R06 5, R07 14, R08 41, R12 10;
  - from 438 tests with none skipped;
  - 4 of 4 bugs planted in the page caught by the level tests.
- Screenshots: every level on desktop and phone, 18 s into each, in `captures/final/levels/`.
- Gate: `check:gate` G1 passed at `bd6ffa4`.

## 2026-10-09 · WorldSpec and the builder

- Branch: `g2/worldspec`
- Commits: `0afc49d`, `211f13a`, `4d942fd`
- Shipped (ADR-0016):
  - **`worldspec/1`,** with refinements:
    - the hook first;
    - exactly one manipulable and one counterfactual per level;
    - anchors for every paper-derived statement;
    - parameter-only what-ifs;
    - setup placements;
    - bonus levels that claim nothing from the paper;
    - depth variants by element id;
    - drafts with placeholder anchors.
  - **`fixtures/worldspecs/flocking-reference.json`,** the six levels as a draft. Every
    What-if's effect was checked against seed 5 first.
  - **`buildWorld` in `packages/pipeline`.** It checks a spec against the registry and the
    shell, and derives each level's parameters, setup events, fork and visible elements,
    including whether the fork restarts.
  - **Hand-written binding fixtures** in `fixtures/bindings/`.
- Evidence:
  - R01 51, R02 6, R03 91, R04 18; ahead of their gate, R08 41;
  - from 426 tests with none skipped;
  - planted bugs caught: 4 of 4 in the refinements, and 5 of 5 in the builder.
- Gate: `check:gate` G1 passed at `4d942fd`.

## 2026-10-09 · The group measure

- Branch: `g2/group-measure`
- Commits: `5d87b66`, `f37c9a9`
- Shipped (ADR-0015):
  - `flock.planar.weighted@3.0.0`: groups link only birds whose headings differ by less
    than 45°, clusters under 4 birds are strays (E14), the stray share (E18), and the
    reading "one group" (O1), exported as `flockReadsAsOneGroup`;
  - 4 new oracle fixtures written by hand before the code, and 3 re-derived;
  - `npm run sweep:groups` and `eval/sweeps/group-measure.md`: 0 of 10,000 random scatters
    read as one group (95% upper bound 0.038%), and seed 4 does from 18.63 s;
  - the hook seed is now 5, by ADR-0003's rule; the demo capture names seed 4.
- Evidence:
  - R01 51, R02 6, R03 49, R04 18;
  - from 343 tests with none skipped;
  - 4 bugs planted in the measure: 3 caught at once, and the fourth, a 1% loosening at
    exactly 45°, after the 44.9°/45.1° fixture was added.
- Gate: `check:gate` G1 passed at `f37c9a9`. `5d87b66` alone passes its 307 unit tests.

## 2026-10-09 · The capture's scripted camera

- Branch: `g2/capture-camera`
- Commits: `7c12a97`
- Shipped:
  - `capture:demo` films the new world along a scripted camera path: close on the flock,
    a slow orbit, then easing out to the valley as the colours converge (ADR-0010);
  - WorldStage reads a scripted camera from its driver.
- Evidence:
  - 4 new unit tests;
  - two Mac runs byte-identical;
  - the canonical copy comes from CI's `ubuntu-24.04` job.
- Gate: `check:gate` G1 passed at `7c12a97` with 334 tests.

## 2026-10-09 · The world art pass

- Branch: `g2/world-art`
- Commits: `2d9768e`, `4d3bcce`, `b27240e`
- Shipped (ADR-0013):
  - birds with a body and flapping wings;
  - colour by heading, on in the hook and a toggle on `/world/local`;
  - trails;
  - a valley with a meadow, hills, a lake, trees, rocks, a sky and a sun, with no wireframe
    border;
  - a following camera that drifts when idle.
- Evidence:
  - R01 47, R02 6, R03 49, R04 18;
  - from 330 tests with none skipped;
  - 2 of 2 planted bugs caught by the new browser tests.
- Frame time: 60 fps on an M3 Pro GPU, p99 16.8 ms; 21 fps on SwiftShader.
- Gate: `check:gate` G1 passed at `b27240e`.

## 2026-10-09 · The game-first shell

- Branch: `g2/shell`
- Commits: `8ef57d9` (docs), `90fc458`, `a7e30ce`, `15673c8`, `445912e`
- Shipped:
  - `/world/hook` on the game-first shell (ADR-0008, ADR-0012), with the owner's review of
    the spike;
  - the HUD components in `packages/ui/src/react`;
  - the HUD-aware camera fit;
  - the heading compass, from the flock's new query Q2.
- Evidence:
  - R01 47, R02 5, R03 49, R04 17;
  - ahead of their gate: R05 4, R06 1, R12 8;
  - from 310 tests with none skipped;
  - 7 of 7 planted bugs caught by the shell's browser tests.
- HUD at rest: 15.1% of 1440 × 900 and 21.3% of 390 × 844.
- Gate: `check:gate` G1 passed at `445912e`.

## 2026-10-09 · The hook design spike, for review

- Branch: `g2/hook-spike`, unmerged until the owner reviews it (ADR-0009)
- Commits: `5aadf22`
- Shipped:
  - `/world/hook`: the game-first HUD from ADR-0008, with hard-coded content over the live
    flock on seed 4.
  - Every element ADR-0008 lists: a world card, the level map, the guide, the level card
    with the one control and "What if", the depth toggle, and the paper journal with a
    placeholder passage and the legend.
  - One round of critique and one iteration. Screenshots are in `captures/hook-spike/`.
- Evidence:
  - 6 unit tests for the guide's sentences, untagged.
  - axe found no WCAG A or AA violation at 1440 × 900 or 390 × 844, with the journal shut
    or open.
- Gate: `check:gate` G1 passed at `5aadf22` with 275 tests.

## 2026-10-09 · The demo capture

- Branch: `g2/capture-demo`
- Commits: `edfadad`
- Shipped:
  - `npm run capture:demo`: seed 4 forming a murmuration while a scripted beacon is dragged
    through it, at 1080 × 1350 and 1920 × 1080, 15 s each, into the git-ignored
    `captures/` (ADR-0010).
  - The world advances two steps per video frame, and Playwright's own ffmpeg writes
    bit-exact VP8 WebM.
- Evidence:
  - 9 new unit tests, untagged.
  - Two full runs gave byte-identical frame streams and videos.
  - A planted unknown encoder failed at once, with ffmpeg's own message.
- Gate: `check:gate` G1 passed at `edfadad` with 269 tests.

## 2026-10-09 · The axe scan

- Branch: `g2/axe-scan`
- Commits: `3639dfb`
- Shipped:
  - `@axe-core/playwright` 4.13, approved on 2026-10-01.
  - Four [R12] scans of `/world/local`, for WCAG 2.0 to 2.2 at A and AA. They run as the
    page opens, and again with its rules open, a bird picked and a beacon placed, each at
    1280 × 720 and 360 × 740.
  - `npm run typecheck` now covers `tests/e2e`.
- Evidence: R01 43, R02 5, R03 49, R04 16, R12 4 (ahead of its gate), from 260 tests with
  none skipped. 4 of 4 planted violations were caught.
- Gate: `check:gate` G1 passed at `3639dfb`.

## 2026-10-01 · G1 tagged v0.1.0

- Branch: `g1/world-local`
- Commits: `3448e5b`
- Shipped: the G1 playable baseline, tagged `v0.1.0` (a local tag; nothing is pushed),
  with the owner's go-ahead.
- Evidence: R01 43, R02 5, R03 49, R04 16, from 256 tests with none skipped.
- Gate: `check:gate` G1 passed at `3448e5b`, exit 0.

## 2026-10-01 · The playable local world

- Branch: `g1/world-local`
- Commits: `109e9c6`, `73c491e`, `107a38a`
- Shipped:
  - `/world/local` on the hook seed: WorldStage, LabBench, the origin legend, readouts,
    placement, the selected-neighbour view, next seed and replay same seed (ADR-0007).
  - A recorded session that replays exactly through `runEvents`.
- Evidence: R01 43, R02 5, R03 49, R04 16. 20 of 20 planted bugs were caught.
- Gate: `check:gate` G1 passed at `107a38a`: every script ran, and every requirement has
  evidence.

## 2026-10-01 · Self-hosted fonts

- Branch: `g1/fonts`
- Commits: `788a1a3` (code), `eae973a` (docs)
- Shipped: Fredoka 400 and 600 and Literata 400, in latin and latin-ext, served from the
  page's own origin (ADR-0002).
- Evidence: 5 unit tests and 1 browser test, untagged. 6 of 6 planted failures were caught.
- Gate: no `check:gate` run is recorded at these commits; the run at `107a38a` includes them.

## 2026-10-01 · Hook seed and alignment's range

- Branch: `g1/hook-seed`
- Commits: `a93e033`, `ef7eb32` (code), `394e322` (docs)
- Shipped:
  - `flock.planar.weighted@2.2.0`, with alignment's range at 0–4.
  - `npm run choose:hook-seed` and `eval/sweeps/hook-seed.md`.
  - Seed 4 as the opening seed (ADR-0003).
- Evidence:
  - 7 tooling tests, one of which re-runs the rule; 2 of 2 planted bugs were caught.
  - Confirmed in the browser on `/world/local`.
- Gate: no `check:gate` run is recorded at these commits; the run at `107a38a` includes them.

## 2026-10-01 · Protocol location and private reference folder

- Branch: `g1/layout`
- Commits: `22fa5f6` (code), `50df5d1` (docs)
- Shipped:
  - `eval/protocol.md` is the protocol's only path (ADR-0005).
  - `reference/private/` is git-ignored, and the handbook was moved there (ADR-0006).
- Evidence: configuration and docs only. `git check-ignore` confirms the handbook is ignored.
- Gate: no `check:gate` run is recorded at these commits; the run at `107a38a` includes them.

## 2026-10-01 · Documentation system

- Branch: `g1/docs-system`
- Commits: `c84333d`
- Shipped:
  - The docs index, architecture, concepts, this ledger, and the session template and
    protocol.
  - `check:docs` in every gate.
- Evidence: 14 checker tests, one planted failure per rule, and 3 planted failures in the
  real files.
- Gate: `check:gate` G1 on its tree passed every script. R04 had no evidence yet.

## 2026-09-30 · Three.js stage core and adapter

- Branch: `g1/stage-three`
- Commits: `f89a2db` (code), `843050f` (docs)
- Shipped:
  - `@paperplay/ui`: tokens; a pure stage core that turns two states into a frame
    description; a Three.js adapter that draws it, with a plain message when WebGL2 is
    missing.
  - `apps/web` draws the live flock.
  - Playwright runs on forced SwiftShader (ADR-0004).
- Evidence: R01 40, R02 4, R03 49. 12 of 12 planted stage-core bugs and 2 of 2 planted
  browser bugs were caught.
- Gate: `check:gate` G1 at `843050f`. Every script passes; G1 is not passed, because R04 has
  no evidence yet.

## 2026-09-30 · Flock defaults by sweep (flock 2.1.0)

- Branch: `g1/flock-defaults`
- Commits: `cdaf66f`
- Shipped:
  - `npm run sweep:defaults`, a deterministic two-stage sweep with a held-out check.
  - Its tables in `eval/sweeps/`.
  - New defaults as `flock.planar.weighted@2.1.0` (ADR-0003).
- Evidence: the sweep table was byte-identical across runs. The chosen defaults ordered 14
  of 20 sweep seeds but 17 of 40 held-out seeds.
- Gate: no `check:gate` run is recorded at this commit; the run at `843050f` includes it.

## 2026-09-30 · RunRecord v2 and replay

- Branch: `g1/run-record-v2`
- Commits: `a5ca4df`
- Shipped:
  - `runrecord/2`: a strict event union (param, place, remove), plus `sampleInterval` and
    `totalSteps`, so a truncated record fails.
  - `flock.planar.weighted@2.0.0`, with named beacons and obstacles.
  - `runEvents` and `replayRecord`.
- Evidence: the new contract tests count towards R03; R07 has 11 replay tests (partial).
  7 of 7 planted replay bugs were caught.
- Gate: no `check:gate` run is recorded at this commit; the run at `843050f` includes it.

## 2026-09-28 · G1 kickoff

- Branch: `g1/kickoff`
- Commits: `c18488d` (code), `3b2352a` (docs)
- Shipped:
  - The monorepo skeleton: pinned Node, strict TypeScript, Vitest, Playwright, ESLint and
    `check:gate`.
  - The G1 contracts.
  - `flock.planar.weighted@1.0.0`, with hand-derived oracle fixtures.
- Evidence: R01 40, R03 42, from 111 tests in total. 12 of 12 planted primitive bugs were
  caught.
- Gate: `check:gate` G1 failed by design. All five scripts passed; R02 and R04 had no
  evidence.
