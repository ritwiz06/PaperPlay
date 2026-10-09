# Status

Updated 2026-10-09, at the end of the session that moved G1 onto `main`, chose a
game-first interface, and added the axe scan, the demo capture and the hook design spike
([log](sessions/2026-10-09.md)). This file is rewritten every session.

## Where we are

- **Gate:** G1 Playable baseline **passed**, and is tagged `v0.1.0` at `3448e5b`. G2 is in
  progress. `gates.json` keeps G1 current until G2's evidence exists (ADR-0009).
- **Branches** (ADR-0009):
  - `main` holds G1 and this session's merged work:
    - ADR-0009, short branches;
    - ADR-0008, the game-first interface;
    - the axe scan;
    - the demo capture;
    - this plan change.
  - `g2/hook-spike` (`5aadf22`) holds the design spike. It stays unmerged until the owner
    reviews it.
  - The nine `g1/*` branches are all ancestors of `main`.
  - Nothing is pushed: `origin` waits for the repository's URL.
- **Working commit:** `edfadad` on `main`, the latest code commit there, where `check:gate`
  passed G1. Everything after it on `main` is documentation.
- **Runtime:** Node 24.21.0, pinned in `.node-version`. Run tools through
  `fnm exec --using=24.21.0` when the shell's default Node differs; `check:gate` refuses
  evidence from any other version.
- **What a learner can do now:**
  - **On `/world/local`,** opened on seed 4:
    - change the rules;
    - place and remove beacons and obstacles, by pointer or by keyboard;
    - pick a bird and see the birds it sees;
    - replay the same seed, or move to the next one;
    - watch the readouts, labelled as computed observations.
  - **On `/world/hook`,** on the spike branch only:
    - play the hook level in the game-first HUD;
    - move "Move together";
    - read the guide's reaction;
    - open the paper journal from "From the paper", at a placeholder passage;
    - unlock level 2 by sweeping the control's range.
- **What the owner can make:** `npm run capture:demo` writes two 15 s videos of seed 4 and a
  dragged beacon into the git-ignored `captures/`. The output is byte-identical on every run
  on this machine (ADR-0010).

## Latest check:gate (G1), 2026-10-09, commit edfadad

```
check:gate G1 · Playable baseline · tag v0.1.0
  runtime    node 24.21.0 (pinned 24.21.0)  ok
  typecheck  ok      9.3 s
  lint       ok      7.2 s
  check:docs ok      0.2 s
  test       ok      7.2 s
  build      ok      0.4 s
  test:e2e   ok      12.7 s
  evidence   269 tests (vitest 255, playwright 14), 0 skipped
    R01  Deterministic, oracle-checked primitives      43 passing
    R02  Model/render separation                       5 passing
    R03  Strict, versioned contracts                   49 passing
    R04  Playable local world                          16 passing

G1 passed: every required check ran and every requirement has passing evidence.
```

The four [R12] axe scans are among the 14 Playwright tests. G1 does not list R12, so the
summary leaves it out. On the spike branch, at `5aadf22`, the gate passed with 275 tests.

## Blockers

- **The push waits on the repository's URL.** The instructions held the placeholder
  `<PASTE PRIVATE REPO URL>`, and the owner's GitHub account (`ritwiz06`) has no PaperPlay
  repository yet.

## Decisions waiting on the owner

1. **The repository:** its URL, or the go-ahead to create a private `ritwiz06/PaperPlay`
   with `gh`. Then `main` and `v0.1.0` are pushed.
2. **The hook spike** (`g2/hook-spike`; screenshots in `captures/hook-spike/`). The owner
   reviews it, and decides whether it merges, and what changes first. Choices the spike
   made, for the owner to keep or change:
   - **Chips use short words:**
     - "Paper" for paper-derived;
     - "Teaching choice";
     - "Measured" for computed observation;
     - "Model's guess" for generated inference.

     The journal's legend gives each full name and meaning.
   - **On desktop, the guide and level card sit bottom left,** not bottom centre, so the
     field's middle stays clear.
   - **The level card shows the level's readout,** and the equation only at Advanced.
   - **The guide gives way to the What-if card** while that card is open.
3. **ADR-0008's readings,** marked "my reading" in the ADR:
   - the readout in the level card;
   - guided exploration inside the guide;
   - "Not from the paper" for controls with no anchor;
   - "Rules of this world" off level screens;
   - no Fredoka 700.
4. **MP4 for the demo capture,** if social platforms need it. That needs an ffmpeg with H.264,
   which is a new dependency.
5. **The old `g1/*` branch names:** delete them, now that `main` holds them all?

## Next three actions

1. Once the owner has reviewed the spike, build the shell properly:
   - LevelCard, Guide, PaperJournal, LevelMap and DepthToggle, in `packages/ui/src/react`;
   - a camera fit that frames the field in the space the HUD leaves.
2. Write the source register and the flocking source map, so a real passage replaces the
   placeholder.
3. Settle the group measure before any level teaches with it.

## Recommendations

In priority order:

1. **Make the stage's camera fit respect the HUD before building the shell.** Risk: on a
   phone, the guide and level card cover the bottom half of the screen. The fit centres
   the field without knowing that, so the flock flies under the cards (spike, round 2).
2. **Run `check:gate` in CI as soon as `origin` exists.** Risk: SwiftShader has only been
   exercised on this Mac, and a GitHub Actions run would also be the first check off this
   machine.
3. **Settle the group measure early in G2, as the owner chose.** Risk: a learner reads
   "Groups: 1" as "a murmuration formed" when a random scatter can show the same.
4. **Give the demo capture a closer, scripted camera.** Risk: the default camera frames the
   whole valley, so the flock is small in a phone-sized video. R02 keeps a camera change
   from touching the run.
5. **Code-split the Three.js stage before anyone tests on a phone.** Risk: 245 KB of gzipped
   JavaScript (896 KB raw) loads before the first frame.
6. **Profile before any level raises `agentCount`.** Risk: the neighbour search is O(N²). At
   the default settings, a step of 72 birds costs about 77 µs and a measurement 46 µs.
7. **Handle WebGL context loss in `mountStage`.** Risk: mobile browsers drop contexts in the
   background, and the stage would stay blank.
8. **Add dark mode with the G2 shell.** The tokens, the stage's dusk palette and the
   reference's dark HUD cards exist, but the page has no dark theme yet.
9. **Revisit TypeScript 7 monthly.** Only typescript-eslint's support blocks the move
   (ADR-0001).
10. **Treat the no-alignment oracle as a hypothesis.** It is expected-qualitative, so a
    failure there is a finding, not a threshold to tune (`fixtures/oracles/README.md`).
