# Status

Updated 2026-10-01, during the session that adds the documentation system
([log](sessions/2026-10-01.md)). This file is rewritten every session.

## Where we are

- **Gate:** G1 Playable baseline, in progress. Every G1 requirement has passing evidence
  except R04, the playable local world.
- **Branches,** stacked, one coherent change each; nothing is pushed and there is no remote:
  `g1/kickoff` → `g1/run-record-v2` → `g1/flock-defaults` → `g1/stage-three` →
  `g1/docs-system` (this session).
- **Working commit:** `843050f` on `g1/stage-three`. It is the newest commit on which every
  `check:gate` script passes; G1 itself still waits for R04.
- **Runtime:** Node 24.21.0, pinned in `.node-version`. An interactive shell switches to it
  on `cd` into the repo; `check:gate` refuses evidence from any other version.

## Latest check:gate (G1), 2026-10-01, on the documentation system's tree

This run is the tree of the documentation system's commit, which comes after `843050f` on
`g1/docs-system`. A commit cannot name its own hash, so the next docs commit records it.

```
check:gate G1 · Playable baseline · tag v0.1.0
  runtime    node 24.21.0 (pinned 24.21.0)  ok
  typecheck  ok      6.2 s
  lint       ok      6.1 s
  check:docs ok      0.2 s
  test       ok      4.0 s
  build      ok      0.4 s
  test:e2e   ok      4.6 s
  evidence   202 tests (vitest 199, playwright 3), 0 skipped
    R01  Deterministic, oracle-checked primitives      40 passing
    R02  Model/render separation                       4 passing
    R03  Strict, versioned contracts                   49 passing
    R04  Playable local world                          no evidence yet

G1 not passed: 1 problem(s)
  - R04 has no passing test tagged [R04]
```

## Blockers

None.

## Decisions waiting on the owner

None open. On 2026-10-01 the owner settled:
- ADR-0003's options;
- the typography;
- the evaluation protocol's location;
- where the handbook lives.

Those are being carried out this session. Tagging v0.1.0 waits for the owner's go-ahead
once G1 passes.

## Next three actions

1. Carry out the 2026-10-01 decisions:
   - pin the hook seed and widen alignment's range to 0–4 (ADR-0003);
   - self-host the fonts (ADR-0002);
   - move the protocol to `eval/protocol.md`;
   - create the private reference folder.
2. Build the React `WorldStage` and `LabBench` on `/world/local`, showing the hook seed.
3. Add the [R04] smoke test, run `check:gate` for G1, and ask the owner about tagging
   v0.1.0.

## Recommendations

In priority order:

1. **Keep the R04 smoke test deterministic.** Start the world paused and compare browser
   readouts with values computed in Node. Tests driven by the wall clock flake under
   software WebGL.
2. **Add the axe scan in the WorldStage slice, not at G2.** Retrofitting accessibility
   costs more than building it in (R12).
3. **Code-split the Three.js stage before anyone tests on a phone.** Risk: 239 KB of gzipped
   JavaScript loads before the first frame.
4. **Run `check:gate` once on a machine without a GPU (or in CI) before tagging v0.1.0.**
   Risk: SwiftShader has only been exercised on this Mac.
5. **Profile before any level raises `agentCount`.** Risk: the neighbour search is O(N²).
   It costs about 22 µs per step for 72 birds, roughly 30 times more at 400.
6. **Handle WebGL context loss in `mountStage`.** Risk: mobile browsers drop contexts in
   the background, and the stage would stay blank.
7. **Revisit TypeScript 7 monthly.** Only typescript-eslint's support blocks the move
   (ADR-0001).
8. **Treat the no-alignment oracle as a hypothesis.** It is expected-qualitative, so a
   failure there is a finding, not a threshold to tune (`fixtures/oracles/README.md`).
