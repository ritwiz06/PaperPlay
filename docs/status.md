# Status

Updated 2026-10-09, during the day's third session: the owner chose option a for the
capture finding, and the slices resumed ([log](sessions/2026-10-09-3.md)). This file is
rewritten every session.

## Where we are

- **Gate:** G1 Playable baseline **passed**, and is tagged `v0.1.0` at `3448e5b`. G2 is in
  progress. `gates.json` keeps G1 current until G2's evidence exists (ADR-0009).
- **Repository:** the private `ritwiz06/PaperPlay` is `origin`.
  - Pushed: `main`, `v0.1.0`, and `spike/hook-2026-10-09` (the spike's commit, `5aadf22`,
    which `progress.md` names).
  - The `g1/*` branches and the spike's branch are deleted; `main` and the tags hold all
    of them.
- **CI** (ADR-0011): `check:gate` runs on ubuntu-latest with Node 24.21.0 on every push and
  pull request, and is green on Linux. A capture job films the demo on Linux on `main` and
  on demand.
- **Branches:**
  - `g2/shell` holds slice 1 so far: `7b88705` (ADR-0008 records the spike's review), then a
    local work-in-progress commit, `bc8c630`. It is unmerged and unpushed.
  - This finding's docs are on `main` (`ff51afe`), and pushed.
- **Working commit:** `8d36d62` on `main`, the latest code commit there (`capture:demo
  --frames`). `check:gate` passed on it, with this finding's docs on top.
- **Runtime:** Node 24.21.0, pinned in `.node-version`. Run tools through
  `fnm exec --using=24.21.0` when the shell's default Node differs; `check:gate` refuses
  evidence from any other version.
- **What a learner can do now,** on `/world/local`, opened on seed 4:
  - change the rules;
  - place and remove beacons and obstacles;
  - pick a bird and see the birds it sees;
  - replay the same seed, or move to the next one.

  `/world/hook` on the shell exists only on `g2/shell` so far.
- **What the owner can make:** `npm run capture:demo [-- --frames]` writes two 15 s videos of
  seed 4 and a dragged beacon, and lossless PNG sequences, into the git-ignored `captures/`.
  - The output is byte-identical on every run on one runtime.
  - macOS and Linux give different bytes (ADR-0010; architecture.md, Claims per runtime).

## Latest check:gate (G1), 2026-10-09, `main` at 1b27e33 plus this finding's docs (code as at 8d36d62)

```
check:gate G1 · Playable baseline · tag v0.1.0
  runtime    node 24.21.0 (pinned 24.21.0)  ok
  typecheck  ok      11.8 s
  lint       ok      8.7 s
  check:docs ok      0.3 s
  test       ok      10.2 s
  build      ok      0.6 s
  test:e2e   ok      16.1 s
  evidence   271 tests (vitest 257, playwright 14), 0 skipped
    R01  Deterministic, oracle-checked primitives      43 passing
    R02  Model/render separation                       5 passing
    R03  Strict, versioned contracts                   49 passing
    R04  Playable local world                          16 passing

G1 passed: every required check ran and every requirement has passing evidence.
```

CI on Linux passed the same gate on `main` (run 37967849151). The four [R12] axe scans are
among the 14 Playwright tests.

## Blockers

None.

## Decisions waiting on the owner

None yet this session. On 2026-10-09 the owner chose option a for the capture finding:
- published captures come from CI's capture job on a pinned `ubuntu-24.04`;
- a cross-runtime check is a follow-up in the roadmap (ADR-0010).

## Next three actions

1. On the owner's answer, finish slice 1:
   - the Playwright tests for HUD coverage, the fit and R05 provenance;
   - then the docs and the merge.
2. Slice 2, the world art pass, then slice 3, the capture with a scripted camera. The capture
   decision above shapes slice 3.
3. Slice 4, the level script, `docs/design/flocking-levels.md`.

## Recommendations

In priority order:

1. **Add the cross-runtime capture check (option b) before publishing widely.** Risk: real
   drift between machines would hide inside "rendering noise" without a stated tolerance.
2. **Settle the group measure early in G2, as the owner chose.** Risk: a learner reads
   "Groups: 1" as "a murmuration formed" when a random scatter can show the same.
3. **Code-split the Three.js stage before anyone tests on a phone.** Risk: 245 KB of gzipped
   JavaScript (896 KB raw) loads before the first frame.
4. **Profile before any level raises `agentCount`.** Risk: the neighbour search is O(N²).
5. **Handle WebGL context loss in `mountStage`.** Risk: mobile browsers drop contexts in the
   background, and the stage would stay blank.
6. **Add dark mode with the shell.** The tokens, the stage's dusk palette and the reference's
   dark HUD cards exist, but the page has no dark theme yet.
7. **Revisit TypeScript 7 monthly.** Only typescript-eslint's support blocks the move
   (ADR-0001).
8. **Note the runner change:** ubuntu-latest moves to Ubuntu 26 from 2026-10-19 (CI's
   annotation). The Linux capture's bytes may change with it.
