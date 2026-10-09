# Status

Updated 2026-10-09, during the day's fourth session: the level script's decisions, the
group measure, sources and WorldSpec ([log](sessions/2026-10-09-4.md)). This file is rewritten
every session.

## Where we are

- **Gate:** G1 Playable baseline **passed**, and is tagged `v0.1.0` at `3448e5b`. G2 is in
  progress. `gates.json` keeps G1 current until G2's evidence exists (ADR-0009).
- **Repository:** the private `ritwiz06/PaperPlay` is `origin`.
  - Pushed: `main`, `v0.1.0` and `spike/hook-2026-10-09`.
  - CI runs `check:gate` on ubuntu-latest on every push and pull request, and is green.
  - CI's capture job, on a pinned `ubuntu-24.04`, makes the canonical capture (ADR-0010,
    ADR-0011).
- **Branches:** only `main`. Every slice this session merged fast-forward and was pushed
  (ADR-0009).
- **Working commit:** `f37c9a9` on `main`, the latest code commit there. `check:gate` passed
  G1 on it.
- **Primitive:** `flock.planar.weighted@3.0.0`, with the owner's group measure (ADR-0015).
- **Runtime:** Node 24.21.0, pinned in `.node-version`. Run tools through
  `fnm exec --using=24.21.0` when the shell's default Node differs.
- **What a learner can do now:**
  - **On `/world/hook`,** the hook level on the game-first shell, on seed 5 since flock
    3.0.0. Content is hard-coded until
    WorldSpec.
    - Move "Move together".
    - Watch the flock: birds with flapping wings, coloured by heading, with trails, in a
      valley with a lake and groves. A camera follows, closer than before.
    - Read the guide's "you did X, so Y", and the heading compass.
    - Open the paper journal from "From the paper", at a placeholder passage. Try the
      control from there.
    - Switch depth.
    - Open What if.
    - Unlock level 2 by sweeping the control's range.
  - **On `/world/local`,** as at G1:
    - change the rules;
    - place and remove beacons and obstacles;
    - pick a bird and see the birds it sees;
    - replay the same seed, or move to the next one.

    Its new world can colour birds by heading, from Rules of this world.
- **What the owner can make:** `npm run capture:demo [-- --frames]` films seed 4 forming a
  murmuration, along a scripted camera path. The published copy comes from CI's capture job.
- **For the owner's review:**
  - `docs/design/flocking-levels.md`, the level script;
  - the screenshots in `captures/final/`;
  - the canonical capture in `captures/canonical/`.

## Latest check:gate (G1), 2026-10-09, commit f37c9a9

```
check:gate G1 · Playable baseline · tag v0.1.0
  runtime    node 24.21.0 (pinned 24.21.0)  ok
  typecheck  ok      12.7 s
  lint       ok      9.5 s
  check:docs ok      0.2 s
  test       ok      10.3 s
  build      ok      0.7 s
  test:e2e   ok      31.2 s
  evidence   343 tests (vitest 311, playwright 32), 0 skipped
    R01  Deterministic, oracle-checked primitives      51 passing
    R02  Model/render separation                       6 passing
    R03  Strict, versioned contracts                   49 passing
    R04  Playable local world                          18 passing

G1 passed: every required check ran and every requirement has passing evidence.
```

Ahead of their gate, from the same run's reports: R05 4, R06 1, R07 11, R12 8.

## Blockers

- **The Reynolds PDF is missing from `reference/private/`,** and slice 1 (the source map)
  needs it. Only the project handbook is there. The owner chose to do slice 1 later; until
  then, anchors are placeholders, clearly marked.

## Decisions waiting on the owner

1. **Level 4's one readout,** a groups counter by ADR-0015's measure: my reading, since the
   owner named only the compass and the spacing gauge (ADR-0014).
2. **The shell and the world art,** from the screenshots:
   - the bottom-left stack;
   - the compass;
   - the quiet chips;
   - the following camera;
   - colour by heading, trails and the valley.
3. **The canonical capture,** in `captures/canonical/`, from CI.

## Next three actions

1. The WorldSpec schema [R03] and `fixtures/worldspecs/flocking-reference.json`, as a draft
   with placeholder anchors until the source map exists.
2. The deterministic builder, with binding fixtures [R08].
3. `/world/hook` driven by the WorldSpec through all six levels.

## Recommendations

In priority order:

1. **Add the Reynolds PDF before the reference fixture is marked reviewed.** Risk: a draft
   with placeholder anchors is fine to build against, but no level may claim a passage it
   cannot cite.
2. **Add the cross-runtime capture check (option b) before publishing widely.** Risk: real
   drift between machines would hide inside "rendering noise" without a stated tolerance.
3. **Profile on a phone's GPU before raising `agentCount`.** The M3 Pro holds 60 fps at 72
   birds, with a p99 frame of 16.8 ms. Risk: phones are slower, and the neighbour search is
   O(N²).
4. **Code-split the Three.js stage.** Risk: the bundle loads before the first frame.
5. **Handle WebGL context loss in `mountStage`.** Risk: mobile browsers drop contexts in the
   background.
6. **Add dark mode with the shell.** The dusk palette now has the valley's roles too.
7. **Revisit TypeScript 7 monthly** (ADR-0001).
