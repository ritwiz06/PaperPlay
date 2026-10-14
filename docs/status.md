# Status

Updated 2026-10-14, during the day's first session: the model provider, Threshold Town's fixes,
then G3a.3 ([log](sessions/2026-10-14.md)). This file is rewritten every session.

## Where we are

- **Gate:** G1 Playable baseline **passed**, and is tagged `v0.1.0` at `3448e5b`. G2's
  interface is done; it waits for the Reynolds PDF and the source map. `gates.json` keeps G1
  current until G2's evidence exists (ADR-0009).
- **G3a.1 and G3a.2 are done** (ADR-0025 to ADR-0029, last landed at `3acb157`): families, scene
  kits, `worldspec/3`, the compartment family, the town kit and Threshold Town.
- **The owner's answers (2026-10-14):** the model provider is ASU Research Computing's Voyager
  gateway (ADR-0030); ADR-0029 is accepted with five fixes to Threshold Town.
- **G3a.3, the pipeline on the compartment family, has started:**
  - **landed:** the key in `apps/api/.env` only, and the bundle secret check in every
    production build (`9251435`, ADR-0030, landed at `3e1f855`);
  - **landed:** Threshold Town's five fixes (`eac3826`, ADR-0029's amendment, landed at
    `9dd66e1`);
  - **landing:** the Voyager adapter, recordings, `npm run pipeline:live` and the capability
    probe of all 39 chat models (`796fdc4`);
  - **next:** ingest, the gold ModelSpecs and the bake-off.
- **`main` moves only through `npm run land`** (ADR-0009, amended).
- **Repository:** the private `ritwiz06/PaperPlay` is `origin`. CI runs `check:gate` on every
  push and pull request.
- **Branches:** `g3/model-adapter`, being landed; `worktree-agent-ab8301aef54d2fcc8`, the compartment
  agent's own, whose three commits are on `main`.
- **Working commit:** `796fdc4` on `g3/model-adapter`. `main` is at `9dd66e1`, whose CI passed.
- **Model provider:** Voyager, `https://openai.rc.asu.edu/v1`, its key `VOYAGER_API_KEY` in
  `apps/api/.env` only (ADR-0030); called only by `npm run pipeline:live`.
- **Primitives:** `flock.planar.weighted@3.1.0`, with queries Q1–Q4, the agents family's
  first, at `@paperplay/primitives/flock` (ADR-0025); `compartments.ode@1.0.0`, the solver for
  every compartment model, at `@paperplay/primitives/compartments` (ADR-0028).
- **Contracts:** `worldspec/3`, with `worldspec/2` still read (ADR-0027); `runrecord/3`
  (ADR-0023).
- **Runtime:** Node 24.21.0, pinned in `.node-version`.
- **What a learner can do:** the six flocking levels on `/world/hook`, and Threshold Town's five
  on `/world/epidemic`, each with its control, readout, guide, journal page, prediction and
  fork; both journals now say what the world cannot show; a town can start again.

## Latest check:gate (G1), 2026-10-10, commit 3acb157

Land's own run, on `g3/kermack-mckendrick`'s tip, now `main`:

```
check:gate G1 · Playable baseline · tag v0.1.0
  runtime    node 24.21.0 (pinned 24.21.0)  ok
  typecheck  ok      19.2 s
  lint       ok      12.9 s
  check:docs ok      0.3 s
  test       ok      44.2 s
  build      ok      0.7 s
  test:e2e   ok      123.6 s
  evidence   746 tests (vitest 671, playwright 75), 0 skipped
    R01  Deterministic, oracle-checked primitives      151 passing
    R02  Model/render separation                       9 passing
    R03  Strict, versioned contracts                   151 passing
    R04  Playable local world                          20 passing

G1 passed: every required check ran and every requirement has passing evidence.
```

Ahead of their gate, from the same run's reports: R05 5, R06 53, R07 40, R08 59, R12 18.

## Blockers

- **The Reynolds, Kermack and McKendrick, and Elowitz and Leibler PDFs are not yet in
  `reference/private/`.** Each one's source register and source map come first when it
  appears (ADR-0024). G2 cannot pass until the flocking world's anchors are real.

## Decisions waiting on the owner

0. **Which models the Voyager portal marks "Testing in progress".** The gateway's API does not
   say; no model is chosen for a stage until the owner names them (ADR-0030).

1. **Paid branch protection on GitHub,** which would refuse unlanded pushes to `main` on the
   server too (ADR-0009's amendment).
2. **The deploy:** the owner connects Vercel (ADR-0017). Then I check the CSP against the
   preview.

## Next three actions

1. Ingest: arXiv LaTeX source and PubMed Central's JATS, with the source register.
2. The gold ModelSpecs for three CC BY papers, and the bake-off.
3. `apps/api`'s jobs and the pipeline's stages.

## Recommendations

In priority order:

1. **Add the three PDFs to `reference/private/`.** Risk: no world may claim a passage it cannot
   cite, so both reference worlds stay drafts.
2. **Consider GitHub branch protection.** Risk: land and its hook guard against mistakes on
   this machine, not against `--no-verify` or another clone.
3. **Try context loss and level 5's fork on a real phone** once the deploy is live. Risk: the
   tests run on desktop Chromium with SwiftShader only.
4. **Add the cross-runtime capture check before publishing widely** (ADR-0010).
5. **Look into level 1's first fork after a page load,** about 1.3 s to its first frames on
   SwiftShader. Risk: on a slow phone it could feel stuck.
6. **Revisit TypeScript 7 monthly** (ADR-0001).
