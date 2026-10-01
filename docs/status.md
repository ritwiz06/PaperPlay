# Status

Updated 2026-09-30, at the end of the session on RunRecord v2, the flock defaults and the
Three.js stage core.

## Where we are

- **Gate:** G1 Playable baseline, in progress.
  - Steps 1–4 are done. Step 4 became the Three.js stage core and adapter (ADR-0004).
  - From step 5, the render-invariance test (R02) is done; `/world/local` is next.
- **Branches,** stacked, each one coherent change. Nothing is pushed and there is no remote.
  - `g1/kickoff`: c18488d (kickoff), 3b2352a (kickoff docs).
  - `g1/run-record-v2`: a5ca4df.
  - `g1/flock-defaults`: cdaf66f.
  - `g1/stage-three`: f89a2db.
- **Working commit:** f89a2db on `g1/stage-three`. This document lands in the
  commit after it.
- **Runtime:** Node 24.21.0, pinned in `.node-version`. `~/.zshrc` now runs
  `fnm env --use-on-cd`, so an interactive shell switches automatically on `cd` into the
  repo. `check:gate` refuses evidence from any other version.

## Latest check:gate (G1), 2026-09-30

```
check:gate G1 · Playable baseline · tag v0.1.0
  runtime    node 24.21.0 (pinned 24.21.0)  ok
  typecheck  ok      6.2 s
  lint       ok      6.0 s
  test       ok      4.0 s
  build      ok      0.4 s
  test:e2e   ok      4.4 s
  evidence   188 tests (vitest 185, playwright 3), 0 skipped
    R01  Deterministic, oracle-checked primitives      40 passing
    R02  Model/render separation                       4 passing
    R03  Strict, versioned contracts                   49 passing
    R04  Playable local world                          no evidence yet

G1 not passed: 1 problem(s)
  - R04 has no passing test tagged [R04]
```

G1 is not passed: R04 (the playable local world and its smoke test) is the next slice.
Everything else G1 requires has passing evidence.

## What exists

- **`packages/contracts`:** the G1 subset, with `runrecord/2` (event union, sampling
  fields).
- **`packages/primitives`:**
  - `flock.planar.weighted@2.1.0`, with equations E1–E17 in `src/flock/MODEL.md`;
  - named entities, `apply` and `stateSchema`;
  - mulberry32, the registry, and the replay engine (`runEvents`, `replayRecord`).
- **`packages/ui`:**
  - tokens;
  - `stage-core`: a pure FrameDescription, the orbit camera, the fixed-step driver and the
    palettes;
  - `three-adapter`: the Three.js scene, `mountStage` and the WebGL fallback.
- **`apps/web`** draws the live flock with the default settings and seed 42. It has no
  controls yet.
- **Evaluation:**
  - `eval/sweeps/` holds the defaults sweep (ADR-0003).
  - `fixtures/oracles/` holds 23 hand-derived flock oracles and the mulberry32 vectors.
- **Not yet:** `npm run replay` (in CLAUDE.md's command list) arrives with replay export at
  G2. ADR-0002 (typography) is not written; the header uses a placeholder system font.

## Blockers

None.

## Decisions waiting on the owner

1. **ADR-0003's open options.**
   - The new defaults succeed for 14 of 20 sweep seeds but only 17 of 40 unseen seeds.
   - Alignment sits at its maximum (2).
   - Seed 42, which the page shows, does not settle within 30 s.

   The options are: accept; widen alignment's range; relax or lengthen the criterion; pin a
   hook seed known to form a murmuration (as a teaching choice); or sweep further.
2. **Typography (ADR-0002).** Choosing a display and text pair means loading font files.
   Self-hosting them adds assets to the repo; a font CDN adds a network dependency.
3. **Where the evaluation protocol lives.** The brief says `eval/protocol.md`; CLAUDE.md
   lists `docs/research/protocol.md`. Pick one before G4.
4. **The handbook PDF** in the repo root is untracked. Should it be committed, ignored, or
   moved out of the repo?

## Next three actions

1. The owner decides decision 1, at least for the hook's starting world.
2. **React `WorldStage`:**
   - pointer and keyboard orbit and zoom;
   - pause, next seed, and replay same seed;
   - live readouts at 10 Hz or less, labelled computed-observation.
3. **`LabBench` and `/world/local`:**
   - one tethered rule slider plus collapsed "Rules of this world";
   - beacon and obstacle placement through `unprojectToGround` and `apply`, recorded as
     RunRecord events;
   - the [R04] smoke test: a slider moves the `directionalAgreement` readout.
