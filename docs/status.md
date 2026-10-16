# Status

Updated 2026-10-15, in a session that ran into 2026-10-16: G3a.3's branches landed, the bake-off,
and the first generated world ([log](sessions/2026-10-15.md)). This file is rewritten every
session.

## Where we are

- **Gate:** G1 Playable baseline **passed**, and is tagged `v0.1.0` at `3448e5b`. G2's
  interface is done; it waits for the Reynolds PDF and the source map. `gates.json` keeps G1
  current until G2's evidence exists (ADR-0009).
- **G3a.1 and G3a.2 are done** (ADR-0025 to ADR-0029).
- **G3a.3, the pipeline on the compartment family, has reached the owner's stop point:** the
  first generated world plays.
  - **landed:** the key and the bundle secret check (ADR-0030); Threshold Town's fixes
    (ADR-0029's amendment); the Voyager adapter and the probe; ingest and the sanitiser
    (ADR-0031); transcriptions and three gold answers (ADR-0032, at `6bd0594`); the stages, the
    controller and the API's jobs (ADR-0033, at `3c62216`); `/create` and generated worlds in the
    town kit (ADR-0034, at `7070a27`);
  - **landing:** `g3/bakeoff` (ADR-0035): the fixes the bake-off found, the bake-off's table in
    `eval/models.md`, each stage's model, and the first generated world, hepatitis C treatment
    adherence from PMC12334037, at `/world/generated/pmc-PMC12334037`;
  - **left in G3a.3:** PDF ingest.
- **`main` moves only through `npm run land`** (ADR-0009, amended).
- **Repository:** the private `ritwiz06/PaperPlay` is `origin`. CI runs `check:gate` on every
  push and pull request.
- **Branches:** `g3/bakeoff`, being landed; `worktree-agent-ab8301aef54d2fcc8`, the compartment
  agent's own, whose three commits are on `main`.
- **Working commit:** `eb5aab9` on `g3/bakeoff`. `main` is at `7070a27`, whose CI passed.
- **Model provider:** Voyager, `https://openai.rc.asu.edu/v1`, its key `VOYAGER_API_KEY` in
  `apps/api/.env` only (ADR-0030); called only by `npm run pipeline:live`. Replies stream; a call
  may take up to 30 minutes.
- **Models per stage** (`apps/api/models.json`, provisional): reader, planner and explainer
  kimi-k2-7-code; first transcriber glm-5-3; second transcriber, router and reviewer
  qwen35-397b-a17b.
- **Primitives:** `flock.planar.weighted@3.1.0` (ADR-0025); `compartments.ode@1.0.0` (ADR-0028).
- **Contracts:** `worldspec/3`, with `worldspec/2` still read (ADR-0027); `runrecord/3`
  (ADR-0023).
- **Runtime:** Node 24.21.0, pinned in `.node-version`.
- **What a learner can do:** the six flocking levels on `/world/hook`, Threshold Town's five on
  `/world/epidemic`, and the first generated world's five on
  `/world/generated/pmc-PMC12334037`, each with its control, readout, guide, journal, prediction
  and fork. On this machine only, `/create` makes a world from an arXiv id or a PMCID.

## Latest check:gate (G1), 2026-10-16, on `g3/bakeoff` at eb5aab9 with these docs

```
check:gate G1 · Playable baseline · tag v0.1.0
  runtime    node 24.21.0 (pinned 24.21.0)  ok
  typecheck  ok      14.9 s
  lint       ok      11.3 s
  check:docs ok      0.2 s
  test       ok      31.7 s
  build      ok      0.5 s
  test:e2e   ok      105.9 s
  evidence   831 tests (vitest 751, playwright 80), 0 skipped
    R01  Deterministic, oracle-checked primitives      151 passing
    R02  Model/render separation                       9 passing
    R03  Strict, versioned contracts                   151 passing
    R04  Playable local world                          20 passing

G1 passed: every required check ran and every requirement has passing evidence.
```

Ahead of their gate, from the same suites' reports: R05 8, R06 53, R07 40, R08 66, R09 34, R10 13,
R11 16, R12 20. Land runs the gate again before it pushes.

## Blockers

- **The Reynolds, Kermack and McKendrick, and Elowitz and Leibler PDFs are not yet in
  `reference/private/`.** G2 cannot pass until the flocking world's anchors are real.

## Decisions waiting on the owner

0. **Which models the Voyager portal marks "Testing in progress".** The gateway's API does not
   say; the picks in `apps/api/models.json` are provisional until the owner names them
   (ADR-0035).
1. **Papers that state more than one set of values,** as the tuberculosis paper does: which a
   world uses, or a rule. Today the two transcriptions take different sets and the job stops as
   `needs_information`.
2. **Paid branch protection on GitHub** (ADR-0009's amendment).
3. **The deploy:** the owner connects Vercel (ADR-0017).

## Next three actions

1. Land `g3/bakeoff`.
2. On the owner's answers: the stages' models, and a rule for more than one value set.
3. PDF ingest, the last of G3a.3.

## Recommendations

In priority order:

1. **Tell the planner a compartment's scale, and give the fork's chart its own axis.** The first
   generated world's level 1 measures a compartment near 0.01 of the population on a chart that
   runs to 0.83, so its lines lie flat. Risk: a learner sees no difference.
2. **Shares of a population as their own unit.** Both transcribers wrote "people" for a model in
   shares, so the readout says "people × years". Risk: a wrong unit reads as the paper's.
3. **Add the three PDFs to `reference/private/`.** Risk: no world may claim a passage it cannot
   cite.
4. **Consider GitHub branch protection.** Risk: land guards only this machine.
5. **Try the worlds on a real phone** once the deploy is live.
6. **Revisit TypeScript 7 monthly** (ADR-0001).
