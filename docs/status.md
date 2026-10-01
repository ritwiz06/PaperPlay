# Status

Updated 2026-10-01, at the end of the session that added the documentation system, carried
out the owner's decisions and built the playable local world
([log](sessions/2026-10-01.md)). This file is rewritten every session.

## Where we are

- **Gate:** G1 Playable baseline **passes**. `check:gate` ran every required script, and each
  of R01–R04 has passing evidence. Tagging v0.1.0 waits for the owner.
- **Branches,** stacked, one coherent change each; nothing is pushed and there is no remote:
  `g1/kickoff` → `g1/run-record-v2` → `g1/flock-defaults` → `g1/stage-three` →
  `g1/docs-system` → `g1/layout` → `g1/hook-seed` → `g1/fonts` → `g1/world-local`.
- **Working commit:** `107a38a` on `g1/world-local`, where G1 passes. The docs commit after
  it changes only documentation.
- **Runtime:** Node 24.21.0, pinned in `.node-version`. An interactive shell switches to it
  on `cd` into the repo; `check:gate` refuses evidence from any other version.
- **What a learner can do now,** on `/world/local`, opened on seed 4:
  - change the rules;
  - place and remove beacons and obstacles, by pointer or by keyboard;
  - pick a bird and see the birds it sees;
  - replay the same seed, or move to the next one;
  - watch the readouts, labelled as computed observations.

## Latest check:gate (G1), 2026-10-01, commit 107a38a

```
check:gate G1 · Playable baseline · tag v0.1.0
  runtime    node 24.21.0 (pinned 24.21.0)  ok
  typecheck  ok      8.0 s
  lint       ok      6.9 s
  check:docs ok      0.2 s
  test       ok      7.3 s
  build      ok      0.4 s
  test:e2e   ok      11.2 s
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

1. **Tag v0.1.0?** G1 passes at `107a38a`; the tag would go on the docs commit after it.
2. **Approve `@axe-core/playwright`,** a new dev dependency, for the axe scan that R12
   enforces at G2.
3. **Which seed "fastest" means.**
   - Seed 4 becomes one group soonest (9.52 s), which is the owner's wording.
   - Seed 12 orders into a murmuration soonest (14.65 s).

   Seed 4 is pinned; switching is one constant, and the rule's tests would follow.
4. **Revisit the group measure before G2 teaches with it?** At the default density, 17% of
   random scatters already count as one group (ADR-0003). A new link distance would be a
   new primitive version.

## Next three actions

1. Hear the owner on the four decisions above, then tag v0.1.0 if they say so.
2. Run `check:gate` once on a machine without a GPU, or in CI, before or right after the tag.
3. Start G2: the source register, the flocking source map, and the section files.

## Recommendations

In priority order:

1. **Approve the axe dependency before the first G2 interface work.** The evidence rail and
   tethers add the most interactive surface yet. Risk: accessibility retrofitted after the
   fact costs more than accessibility built in (R12).
2. **Run `check:gate` on a machine without a GPU, or in CI.** Risk: SwiftShader has only
   been exercised on this Mac.
3. **Settle the group measure before a level teaches with it.** Risk: a learner reads
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
