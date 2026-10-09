# Status

Updated 2026-10-09, at the end of the day's third session. The owner chose option a for the
capture finding. Then came the game-first shell, the world art pass, the capture's scripted
camera and the level script ([log](sessions/2026-10-09-3.md)). This file is rewritten
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
- **Working commit:** `d786109` on `main`, the latest code commit there. `check:gate` passed
  G1 on it.
- **Runtime:** Node 24.21.0, pinned in `.node-version`. Run tools through
  `fnm exec --using=24.21.0` when the shell's default Node differs.
- **What a learner can do now:**
  - **On `/world/hook`,** the hook level on the game-first shell. Content is hard-coded until
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

## Latest check:gate (G1), 2026-10-09, commit d786109

```
check:gate G1 · Playable baseline · tag v0.1.0
  runtime    node 24.21.0 (pinned 24.21.0)  ok
  typecheck  ok      12.7 s
  lint       ok      9.4 s
  check:docs ok      0.3 s
  test       ok      10.5 s
  build      ok      0.6 s
  test:e2e   ok      31.7 s
  evidence   334 tests (vitest 302, playwright 32), 0 skipped
    R01  Deterministic, oracle-checked primitives      47 passing
    R02  Model/render separation                       6 passing
    R03  Strict, versioned contracts                   49 passing
    R04  Playable local world                          18 passing

G1 passed: every required check ran and every requirement has passing evidence.
```

Ahead of their gate, from the same run's reports: R05 4, R06 1, R07 11, R12 8. CI on Linux
passed the same gate at `2158335` (run 37976130520), with the same 334 tests.

## Blockers

None.

## Decisions waiting on the owner

1. **The level script,** `docs/design/flocking-levels.md`. Its open questions:
   - **Is Reynolds 1987 the source?**
   - **The group measure,** which level 4 needs.
   - **Two proposed readouts:** a spacing gauge and an agreement chart.
   - **A level's setup placements,** such as level 5's rock. The brief's WorldSpec has no field
     for them.
   - **Level 6's fork restarts both worlds,** because it changes init-phase variables.
2. **The shell and the world art,** from the screenshots:
   - the bottom-left stack;
   - the compass;
   - the quiet chips;
   - the following camera;
   - colour by heading, trails and the valley.
3. **The canonical capture,** in `captures/canonical/`, from CI.

## Next three actions

1. Once the owner has reviewed it, turn the level script into the WorldSpec schema and
   `fixtures/worldspecs/flocking-reference.json`.
2. Settle the group measure, before level 4 is built.
3. Write the source register and the flocking source map, so real passages replace the
   placeholder.

## Recommendations

In priority order:

1. **Review the level script before any WorldSpec code.** Risk: WorldSpec fixes the content's
   shape, and the script raises two contract gaps: setup placements, and forks that change
   init-phase variables.
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
