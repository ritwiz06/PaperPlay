# Status

Updated 2026-10-09, during the session that moved G1 onto `main` and began G2
([log](sessions/2026-10-09.md)). This file is rewritten every session.

## Where we are

- **Gate:** G1 Playable baseline **passed**, and is tagged `v0.1.0` at `3448e5b`, with the
  owner's go-ahead on 2026-10-01. The tag is local; nothing is pushed. G2 is next.
- **Branches:** `main` holds G1. It was fast-forwarded through the nine stacked `g1/*`
  branches to `3aa0ea5`, the tag plus its docs-only record. New work goes on short branches
  off `main` (ADR-0009). Nothing is pushed yet: the repository's URL is still to come.
- **Working commit:** `3aa0ea5` on `main`, where `check:gate` passed G1 again on 2026-10-09.
- **Runtime:** Node 24.21.0, pinned in `.node-version`. An interactive shell switches to it
  on `cd` into the repo; `check:gate` refuses evidence from any other version.
- **What a learner can do now,** on `/world/local`, opened on seed 4:
  - change the rules;
  - place and remove beacons and obstacles, by pointer or by keyboard;
  - pick a bird and see the birds it sees;
  - replay the same seed, or move to the next one;
  - watch the readouts, labelled as computed observations.

## Latest check:gate (G1), 2026-10-01, commit 3448e5b (tagged v0.1.0)

```
check:gate G1 · Playable baseline · tag v0.1.0
  runtime    node 24.21.0 (pinned 24.21.0)  ok
  typecheck  ok      8.0 s
  lint       ok      6.9 s
  check:docs ok      0.2 s
  test       ok      7.3 s
  build      ok      0.4 s
  test:e2e   ok      11.7 s
  evidence   256 tests (vitest 246, playwright 10), 0 skipped
    R01  Deterministic, oracle-checked primitives      43 passing
    R02  Model/render separation                       5 passing
    R03  Strict, versioned contracts                   49 passing
    R04  Playable local world                          16 passing

G1 passed: every required check ran and every requirement has passing evidence.
```

## Blockers

None.

## Decisions waiting on the owner

None open. On 2026-10-01 the owner:
- tagged v0.1.0 at `3448e5b`;
- approved `@axe-core/playwright` for the axe scan, to be added at the start of G2
  (ADR-0001);
- kept seed 4 as the opening seed (ADR-0003);
- chose to settle the group measure at G2, before any level teaches with it (ADR-0003).

## Next three actions

1. Start G2 by adding `@axe-core/playwright` and an axe scan of `/world/local` to `test:e2e`
   (R12).
2. Write the source register, the flocking source map, and the four development and eight
   held-out section files.
3. Run `check:gate` once on a machine without a GPU, or in CI, to confirm v0.1.0 there.

## Recommendations

In priority order:

1. **Run the axe scan before the first G2 interface work,** now that the dependency is
   approved. Risk: the evidence rail and tethers add the most interactive surface yet, and
   accessibility retrofitted after the fact costs more than accessibility built in (R12).
2. **Run `check:gate` on a machine without a GPU, or in CI.** Risk: SwiftShader has only
   been exercised on this Mac.
3. **Settle the group measure early in G2, as the owner chose.** Risk: a learner reads
   "Groups: 1" as "a murmuration formed" when a random scatter can show the same.
4. **Code-split the Three.js stage before anyone tests on a phone.** Risk: 245 KB of gzipped
   JavaScript (896 KB raw) loads before the first frame.
5. **Profile before any level raises `agentCount`.** Risk: the neighbour search is O(N²). At
   the default settings, a step of 72 birds costs about 77 µs and a measurement 46 µs.
6. **Handle WebGL context loss in `mountStage`.** Risk: mobile browsers drop contexts in the
   background, and the stage would stay blank.
7. **Add dark mode with the G2 shell.** The tokens and the stage's dusk palette exist, but
   the page has no dark theme yet.
8. **Revisit TypeScript 7 monthly.** Only typescript-eslint's support blocks the move
   (ADR-0001).
9. **Treat the no-alignment oracle as a hypothesis.** It is expected-qualitative, so a
   failure there is a finding, not a threshold to tune (`fixtures/oracles/README.md`).
