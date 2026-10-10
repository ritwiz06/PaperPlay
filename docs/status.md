# Status

Updated 2026-10-10, during the day's first session: the owner's answers to the plan, then
G3a.1 and G3a.2 ([log](sessions/2026-10-10.md)). This file is rewritten every session.

## Where we are

- **The plan for every paper is answered** (ADR-0024). G3 is re-cut into G3a and G3b, and the
  roadmap gives gates and effort, with no day ranges.
- **Gate:** G1 Playable baseline **passed**, and is tagged `v0.1.0` at `3448e5b`. G2's
  interface is done; it waits for the Reynolds PDF and the source map. `gates.json` keeps G1
  current until G2's evidence exists (ADR-0009).
- **G3a.1, generalize, is in progress,** on short branches landed through `npm run land`:
  - **done:** records of the six levels on seed 5, made before the refactor, with a test that
    holds the code to them (`fc3f828`);
  - **next:** primitive families, scene kits, the generic session and fork, `worldspec/3`.
- **`main` moves only through `npm run land`** (ADR-0009, amended).
- **Repository:** the private `ritwiz06/PaperPlay` is `origin`. CI runs `check:gate` on every
  push and pull request.
- **Branches:** `g3/records`, being landed again after CI found one ulp of difference on Linux
  (the session log has the story).
- **Working commit:** `8de1c33` on `g3/records`: the records test holds the flocking world's
  records bit for bit on the Mac that made them, and state for state elsewhere. `check:gate`
  passed G1 on `fc3f828`, its code before this fix.
- **Primitive:** `flock.planar.weighted@3.1.0`, with queries Q1–Q4.
- **Contracts:** `worldspec/2` (ADR-0016, ADR-0018); `runrecord/3` (ADR-0023).
- **Runtime:** Node 24.21.0, pinned in `.node-version`.
- **What a learner can do** is unchanged since the sixth session of 2026-10-09: the six levels
  on `/world/hook`, each with its control, readout, guide, journal page, prediction and fork.

## Latest check:gate (G1), 2026-10-10, commit fc3f828

```
check:gate G1 · Playable baseline · tag v0.1.0
  runtime    node 24.21.0 (pinned 24.21.0)  ok
  typecheck  ok      11.0 s
  lint       ok      8.3 s
  check:docs ok      0.2 s
  test       ok      28.4 s
  build      ok      0.4 s
  test:e2e   ok      88.2 s
  evidence   565 tests (vitest 496, playwright 69), 0 skipped
    R01  Deterministic, oracle-checked primitives      61 passing
    R02  Model/render separation                       6 passing
    R03  Strict, versioned contracts                   103 passing
    R04  Playable local world                          20 passing

G1 passed: every required check ran and every requirement has passing evidence.
```

Ahead of their gate, from the same run's reports: R05 4, R06 40, R07 40, R08 48, R12 16.

## Blockers

- **The Reynolds, Kermack and McKendrick, and Elowitz and Leibler PDFs are not yet in
  `reference/private/`.** Each one's source register and source map come first when it
  appears (ADR-0024). G2 cannot pass until the flocking world's anchors are real.

## Decisions waiting on the owner

1. **Paid branch protection on GitHub,** which would refuse unlanded pushes to `main` on the
   server too (ADR-0009's amendment).
2. **The deploy:** the owner connects Vercel (ADR-0017). Then I check the CSP against the
   preview.

## Next three actions

1. Land `g3/records`, then G3a.1's primitive families.
2. The scene kits, the generic session and fork, and `worldspec/3`, each landed in turn.
3. G3a.2: the compartment family, the town kit and the Kermack and McKendrick world.

## Recommendations

In priority order:

1. **Add the three PDFs to `reference/private/`.** Risk: no world may claim a passage it cannot
   cite, so both reference worlds stay drafts.
2. **Consider GitHub branch protection.** Risk: land and its hook guard against mistakes on
   this machine, not against `--no-verify` or another clone.
3. **Try context loss and level 5's fork on a real phone** once the deploy is live. Risk: the
   tests run on desktop Chromium with SwiftShader only.
4. **Add the cross-runtime capture check before publishing widely** (ADR-0010).
5. **Revisit TypeScript 7 monthly** (ADR-0001).
