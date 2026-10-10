# Status

Updated 2026-10-09, at the close of the day's fifth session: the level rule, the fork, guided
exploration and speed ([log](sessions/2026-10-09-5.md)). This file is rewritten every
session.

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
- **Working commit:** `92cb65f` on `main`, the latest code commit there. `check:gate` passed
  G1 on it locally, with 507 tests.
- **CI** failed on `7cdf2b8`. A leaked WebGL context slowed level 6's fork past the test's 5 s
  on the Linux runner. `92cb65f` fixes it, and CI passed both jobs on `3fea872` (run
  38013059112).
- **Two earlier `main` commits failed the gate** this session (`8634b2b` check:docs,
  `85e43fe` to `4ad4925` test:e2e). Both are fixed; see the log.
- **Bundle:** the entry chunk is 416 KB, and Three.js loads after it as its own 551 KB chunk.
  `vercel.json` is ready for a static deploy, with a Content-Security-Policy tested against
  the built app. The owner connects it (ADR-0017).
- **Primitive:** `flock.planar.weighted@3.1.0`, with the owner's group measure (ADR-0015), the
  spread and birds at rocks (ADR-0018).
- **WorldSpec:** `worldspec/2` and the builder exist (ADR-0016, ADR-0018). Every level's
  stated effect meets the level rule (`eval/sweeps/levels.md`). G2 cannot pass while the
  fixture is a draft.
  `fixtures/worldspecs/flocking-reference.json` holds the six levels as a draft, with
  placeholder anchors, and `/world/hook` plays it.
- **Runtime:** Node 24.21.0, pinned in `.node-version`. Run tools through
  `fnm exec --using=24.21.0` when the shell's default Node differs.
- **What a learner can do now:**
  - **On `/world/hook`,** the six levels of the authored WorldSpec on the game-first shell,
    each opening on seed 5. Each level has:
    - one control;
    - one readout: the compass, the spacing gauge, or the spread dial with its ring on the
      ground;
    - its guide, journal page and What-if.

    Level 5 has four rocks across the valley. Level 6 is a bonus, beyond the paper. On every
    level:
    - Move the level's control.
    - Watch the flock: birds with flapping wings, coloured by heading, with trails, in a
      valley with a lake and groves. A camera follows.
    - Read the guide's "you did X, so Y", and the readout.
    - Open the paper journal from "From the paper", at a placeholder passage. Try the
      control from there.
    - Switch depth: words, numbers, the equation, an analogy.
    - Open What if, and run both worlds side by side (stacked on a phone), with the level's
      measured difference charted and reported at the level's time. Level 2 asks for a
      prediction first.
    - Run at 1x, 2x or 4x.
    - Unlock the next level by sweeping the control's range, and enter it from the map.
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

## Latest check:gate (G1), 2026-10-09, commit e452bc3

```
check:gate G1 · Playable baseline · tag v0.1.0
  runtime    node 24.21.0 (pinned 24.21.0)  ok
  typecheck  ok      14.8 s
  lint       ok      10.5 s
  check:docs ok      0.2 s
  test       ok      39.6 s
  build      ok      0.6 s
  test:e2e   ok      67.8 s
  evidence   506 tests (vitest 450, playwright 56), 0 skipped
    R01  Deterministic, oracle-checked primitives      58 passing
    R02  Model/render separation                       6 passing
    R03  Strict, versioned contracts                   102 passing
    R04  Playable local world                          18 passing

G1 passed: every required check ran and every requirement has passing evidence.
```

Ahead of their gate, from the same run's reports: R05 4, R06 30, R07 18, R08 48, R12 14.

## Blockers

- **The Reynolds PDF is not yet in `reference/private/`.** The source map waits for it, and G2
  cannot pass until the flocking world's anchors are real.

## Decisions waiting on the owner

1. **The level rule's reworks** (ADR-0018):
   - level 5: four rocks, and "no rule for rocks";
   - level 4 as a level about spread;
   - level 5's readout: the compass, or the birds at rocks.
2. **The fork's choices** (ADR-0019), and the speed control's (ADR-0020).
3. **The deploy:** the owner connects Vercel (ADR-0017). Then I check the CSP against the
   preview.
4. **The shell and the world art,** from the screenshots in `captures/final/`.
5. **The canonical capture,** in `captures/canonical/`, from CI.

## Next three actions

1. The source map, once the Reynolds PDF is in `reference/private/`. G2 waits for it.
2. The CSP checked against the first preview deploy, and tightened.
3. Replay export and `npm run replay`, then the stale-evidence rule.

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
4. **Try a Content-Security-Policy against the first preview deploy.** Risk: without one,
   an injected script would run with the page's full rights.
5. **Handle WebGL context loss in `mountStage`.** Risk: mobile browsers drop contexts in the
   background.
6. **Add dark mode with the shell.** The dusk palette now has the valley's roles too.
7. **Revisit TypeScript 7 monthly** (ADR-0001).
