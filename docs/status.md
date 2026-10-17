# Status

Updated 2026-10-17: the owner's answers, review rules, two planners, the G2 sources and the
learning family ([log](sessions/2026-10-17.md)). This file is rewritten every session.

## Where we are

- **Gate:** G1 Playable baseline **passed**, and is tagged `v0.1.0` at `3448e5b`. G2's
  interface is done; it waits for the Reynolds PDF and the source map. `gates.json` keeps G1
  current until G2's evidence exists (ADR-0009).
- **G3a.1 and G3a.2 are done** (ADR-0025 to ADR-0029).
- **G3a is closed out** (the roadmap's close-out, 2026-10-17): every item built, PDF ingest the
  last (ADR-0038); the owner's rules and decisions of 2026-10-16 landed: the machine's rules
  (ADR-0039), running the paper's own numbers (ADR-0040), five levels with the hook never dropped
  and the picks they led to (ADR-0041, ADR-0035's fourth amendment).
- **G3b is planned** in `docs/design/g3b.md`, waiting on the owner's seven decisions.
- **Two worlds made under every rule:** the hepatitis C paper, `/world/generated/pmc-PMC12334037-2026-10-17`,
  its level 1 saying the 52% threshold does not appear at Table 1's values (R0 0.762 by its
  equation (7) and by the model's own equations); and the tuberculosis paper,
  `/world/generated/arxiv-2506.19869v1`, on its Ethiopian set. Each has five levels, every one
  meeting the level rule, the visibility rule and the findings check, and a journal page running
  the paper's own numbers. Both jobs are recorded and replay to their worlds.
- **`main` moves only through `npm run land`** (ADR-0009, amended).
- **Repository:** the private `ritwiz06/PaperPlay` is `origin`. CI runs `check:gate` on every
  push and pull request.
- **The owner's two rules** (ADR-0039, CLAUDE.md's boundaries 9 and 10), landed at `814f482`:
  no address in an outbound request unless `PAPERPLAY_CONTACT_EMAIL` is set; live jobs and gates
  never share the machine, held by locks land, the gate and `pipeline:live` read.
- **Running the paper's own numbers** (ADR-0040), landed at `39b7a4f`: R0 from the model's own
  equations beside the paper's formula, every value against its quote, other values behind the
  headline. On the hepatitis C paper it confirms the headline's mismatch; on the tuberculosis
  paper its formulas agree with the model and its stated R0 = 2.67 follows from neither.
- **One origin a sentence, every number in the chart's unit** (ADR-0042), landing on
  `g3/one-origin`.
- **Branches:** `g3/one-origin`, being landed; `worktree-agent-ab8301aef54d2fcc8`, the
  compartment agent's own, whose three commits are on `main`.
- **Working commit:** `da78721` on `g3/one-origin`. `main` is at `7d2bb24`, whose CI passed.
- **Model provider:** Voyager, `https://openai.rc.asu.edu/v1`, its key `VOYAGER_API_KEY` in
  `apps/api/.env` only (ADR-0030); called only by `npm run pipeline:live`. Replies stream; a call
  may take up to 30 minutes.
- **Models per stage** (`apps/api/models.json`, from the bake-off, its planners run again with the
  model's response in front of them): reader qwen36-27b; first transcriber
  qwen3-235b-a22b-thinking-2507; second transcriber inkling-small; router glm-5-3; planner and
  explainer kimi-k2-7-code; reviewer glm-5-3. A job may spend 1,200,000 tokens. Twelve models the portal marks "Testing in
  progress" are excluded, as of the owner's snapshot of 2026-10-16.
- **Primitives:** `flock.planar.weighted@3.1.0` (ADR-0025); `compartments.ode@1.0.0` (ADR-0028).
- **Contracts:** `worldspec/3`, with `worldspec/2` still read (ADR-0027); `runrecord/3`
  (ADR-0023).
- **Runtime:** Node 24.21.0, pinned in `.node-version`.
- **What a learner can do:** the six flocking levels on `/world/hook`, Threshold Town's five on
  `/world/epidemic`, the first generated world's five on `/world/generated/pmc-PMC12334037`, and
  the two worlds of 2026-10-17 above, now with its fork's chart fitted to what it measures and its
  town seen through a lens, each with its control, readout, guide, journal, prediction and fork. On
  this machine only, `/create` makes a world from an arXiv id, a PMCID or a PDF.

## Latest check:gate (G1), 2026-10-17, on `g3/one-origin` at da78721

```
check:gate G1 · Playable baseline · tag v0.1.0
  runtime    node 24.21.0 (pinned 24.21.0)  ok
  typecheck  ok      22.5 s
  lint       ok      16.2 s
  check:docs ok      0.4 s
  test       ok      106.8 s
  build      ok      0.7 s
  test:e2e   ok      127.8 s
  evidence   901 tests (vitest 815, playwright 86), 0 skipped
    R01  Deterministic, oracle-checked primitives      151 passing
    R02  Model/render separation                       9 passing
    R03  Strict, versioned contracts                   154 passing
    R04  Playable local world                          20 passing

G1 passed: every required check ran and every requirement has passing evidence.
```

Ahead of their gate, from the same suites' reports: R05 13, R06 67, R07 40, R08 83, R09 46, R10 22, R11 27, R12 22. Land runs the gate again before it pushes.

## Blockers

- **The Reynolds, Kermack and McKendrick, and Elowitz and Leibler PDFs are not yet in
  `reference/private/`.** G2 cannot pass until the flocking world's anchors are real.

## Decisions waiting on the owner

1. **What counts as definitional** (ADR-0041's consequences): gemma4-31b-it blocked levels on what
   the papers report; glm-5-3 let through a level gemma4-31b-it rightly blocked. A level on a
   reported finding, in the paper's direction, never definitional; a flag that must name its
   equation term; or two reviewers from different vendors who must agree.
2. **Whether a reviewer's "unsupported" sends a level back,** as "definitional" does: today it is
   advice.
3. **The seven decisions the G3b plan needs** (`docs/design/g3b.md` §4): update rules as data or
   a coded registry; the attention toy now or later; Adam's and Dropout's sources; G3b's gate, both
   papers through the pipeline or Adam alone; tier C now or after G4; the level rule's seeds for a
   learning toy.
4. **Paid branch protection on GitHub** (ADR-0009's amendment).
5. **The deploy:** the owner connects Vercel (ADR-0017).

## Next three actions

1. The owner's answers: what counts as definitional, "unsupported", and the G3b plan's decisions.
2. G3b.1a, the router across families.
3. The three PDFs in `reference/private/`, for G2.

## Recommendations

In priority order:

1. **Add the three PDFs to `reference/private/`.** Risk: no world may claim a passage it cannot
   cite.
2. **Consider GitHub branch protection.** Risk: land guards only this machine.
3. **Try the worlds on a real phone** once the deploy is live.
4. **Revisit TypeScript 7 monthly** (ADR-0001).
