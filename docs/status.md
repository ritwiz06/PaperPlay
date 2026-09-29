# Status

Updated 2026-09-28, at the end of the G1 kickoff session.

## Where we are

- **Gate:** G1 Playable baseline, in progress. Steps 1–3 of 6 are done.
- **Branch:** `g1/kickoff`. Working commit: `c18488d` (all code and fixtures). The
  documentation commit follows it. Nothing is pushed and there is no remote.
- **Runtime:** Node 24.21.0, pinned in `.node-version`. Install it with
  `fnm install 24.21.0` and switch with `fnm use` in the repo; the fnm default on this
  machine is still 22. `check:gate` refuses evidence from any other version.

## Latest check:gate (G1), 2026-09-28, commit c18488d

```
check:gate G1 · Playable baseline · tag v0.1.0
  runtime    node 24.21.0 (pinned 24.21.0)  ok
  typecheck  ok      3.7 s
  lint       ok      5.2 s
  test       ok      3.9 s
  build      ok      0.3 s
  test:e2e   ok      1.5 s
  evidence   112 tests (vitest 111, playwright 1), 0 skipped
    R01  Deterministic, oracle-checked primitives      40 passing
    R02  Model/render separation                       no evidence yet
    R03  Strict, versioned contracts                   42 passing
    R04  Playable local world                          no evidence yet

G1 not passed: 2 problem(s)
  - R02 has no passing test tagged [R02]
  - R04 has no passing test tagged [R04]
```

G1 is correctly not passed at this point. R02 and R04 arrive with G1 steps 5 and 6.

## What exists

- `packages/contracts`: the G1 subset (Origin, Anchor, SourceManifest, PrimitiveRef,
  Action, RunRecord, JobState), strict and versioned.
- `packages/primitives`: `flock.planar.weighted@1.0.0` (equations in
  `src/flock/MODEL.md`), mulberry32, the registry and `describe()`.
- `fixtures/oracles`: 23 flock oracle fixtures derived by hand from the equations, plus
  mulberry32 reference vectors.
- `scripts/check-gate.ts` and `gates.json`: the real gate.
- Skeleton only, deliberately: `apps/web` (an app shell), `apps/api` (`GET /health`),
  `packages/ui` and `packages/pipeline` (empty until their gates), and `tests/e2e` (a
  wiring smoke test).
- Not yet: `npm run replay`, which CLAUDE.md lists, arrives with RunRecord replay at G2.

## Blockers

None.

## Decisions waiting on the owner

1. **RunRecord events cannot record a placement.** An event is `{ step, actionId, value }`,
   so placing a beacon or obstacle (a point) can be neither recorded nor replayed.
   Proposal: a discriminated union of `set` and `place` events, decided before G1 step 5
   needs it.
2. **RunRecord observables do not say when they were sampled,** so replay cannot line
   them up. Proposal: add `sampleInterval`, the number of steps between samples.
3. **The defaults on a torus do not form one murmuration.** With the prototype's defaults,
   directional agreement is 0.18–0.67 after 20 s, because several groups head different
   ways. The G2 hook ("a striking murmuration pattern you can already touch") may need
   tuned defaults, recorded as teaching choices.
4. **Where the evaluation protocol lives.** The brief says `eval/protocol.md`; CLAUDE.md
   lists `docs/research/protocol.md`. Pick one before G4.

## Next three actions

1. Agree the stage-core slice proposed in `docs/sessions/2026-09-28.md`, and decisions 1
   and 2 above.
2. Build the stage core in `packages/ui`: tokens, orbit camera, flock drawing and the
   fixed-step driver, with the render-invariance test tagged [R02].
3. Wire `apps/web` `/world/local` to `flock.planar.weighted` through that driver, then
   add the Playwright smoke tagged [R04].
