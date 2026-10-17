# Status

Updated 2026-10-16: the owner's two rules, then the reproducibility check, five levels, the
regenerations and the G3b plan ([log](sessions/2026-10-16-2.md)). This file is rewritten every
session.

## Where we are

- **Gate:** G1 Playable baseline **passed**, and is tagged `v0.1.0` at `3448e5b`. G2's
  interface is done; it waits for the Reynolds PDF and the source map. `gates.json` keeps G1
  current until G2's evidence exists (ADR-0009).
- **G3a.1 and G3a.2 are done** (ADR-0025 to ADR-0029).
- **G3a.3, the pipeline on the compartment family:** every item is built, PDF ingest the last
  (landed at `bf0a265`, ADR-0038). The first generated world plays (ADR-0030 to ADR-0035). The
  owner's answers of 2026-10-16 all landed: the models in testing excluded (ADR-0035's
  amendments), several value sets picked by rule (ADR-0036), the visibility rule, the lens, share
  units and findings, not definitions (ADR-0037).
- **No world yet under the rules of 2026-10-16.** The hepatitis C world, regenerated, and the
  tuberculosis paper, re-run, are recorded jobs that both fail (ADR-0037's amendment, landed at
  `d9ec319`). The owner has answered both decisions: a reproducibility check before the hook
  bends, and five levels; they are next:
  - hepatitis C: at its own Table 1 values the paper's reproduction number is 0.65 to 0.78 for
    every adherence, so its headline, adherence above 52% ending spread, shows only in the
    quit-treatment compartment, which the reviewer blocks as definitional;
  - tuberculosis: the value-set rule picks the Ethiopian fit and both transcriptions agree on it;
    the plan's three levels are the fewest a world keeps, and one fails its repair.
- **`main` moves only through `npm run land`** (ADR-0009, amended).
- **Repository:** the private `ritwiz06/PaperPlay` is `origin`. CI runs `check:gate` on every
  push and pull request.
- **The owner's two rules** (ADR-0039, CLAUDE.md's boundaries 9 and 10), landed at `814f482`: no address in an outbound request unless `PAPERPLAY_CONTACT_EMAIL` is set;
  live jobs and gates never share the machine, held by locks land, the gate and `pipeline:live`
  read.
- **Running the paper's own numbers** (ADR-0040), landing on `g3/reproducibility`: R0 from the
  model's own equations beside the paper's formula, every value against its quote, other values
  behind the headline. On the hepatitis C paper it confirms the headline's mismatch; on the
  tuberculosis paper its formulas agree with the model and its stated R0 = 2.67 follows from
  neither.
- **Branches:** `g3/reproducibility`, being landed; `worktree-agent-ab8301aef54d2fcc8`, the
  compartment agent's own, whose three commits are on `main`.
- **Working commit:** `ef4c054` on `g3/reproducibility`. `main` is at `814f482`, whose CI passed.
- **Model provider:** Voyager, `https://openai.rc.asu.edu/v1`, its key `VOYAGER_API_KEY` in
  `apps/api/.env` only (ADR-0030); called only by `npm run pipeline:live`. Replies stream; a call
  may take up to 30 minutes.
- **Models per stage** (`apps/api/models.json`, from the bake-off, its planners run again with the
  model's response in front of them): reader qwen36-27b; first transcriber
  qwen3-235b-a22b-thinking-2507; second transcriber inkling-small; router glm-5-3; planner and
  explainer qwen36-27b; reviewer gemma4-31b-it. Twelve models the portal marks "Testing in
  progress" are excluded, as of the owner's snapshot of 2026-10-16.
- **Primitives:** `flock.planar.weighted@3.1.0` (ADR-0025); `compartments.ode@1.0.0` (ADR-0028).
- **Contracts:** `worldspec/3`, with `worldspec/2` still read (ADR-0027); `runrecord/3`
  (ADR-0023).
- **Runtime:** Node 24.21.0, pinned in `.node-version`.
- **What a learner can do:** the six flocking levels on `/world/hook`, Threshold Town's five on
  `/world/epidemic`, and the first generated world's five on
  `/world/generated/pmc-PMC12334037`, now with its fork's chart fitted to what it measures and its
  town seen through a lens, each with its control, readout, guide, journal, prediction and fork. On
  this machine only, `/create` makes a world from an arXiv id, a PMCID or a PDF.

## Latest check:gate (G1), 2026-10-16, on `g3/reproducibility` at ef4c054

```
check:gate G1 · Playable baseline · tag v0.1.0
  runtime    node 24.21.0 (pinned 24.21.0)  ok
  typecheck  ok      22.6 s
  lint       ok      17.0 s
  check:docs ok      0.3 s
  test       ok      84.7 s
  build      ok      0.6 s
  test:e2e   ok      131.1 s
  evidence   887 tests (vitest 803, playwright 84), 0 skipped
    R01  Deterministic, oracle-checked primitives      151 passing
    R02  Model/render separation                       9 passing
    R03  Strict, versioned contracts                   153 passing
    R04  Playable local world                          20 passing

G1 passed: every required check ran and every requirement has passing evidence.
```

Ahead of their gate, from the same suites' reports: R05 10, R06 61, R07 40, R08 83, R09 46, R10 18,
R11 23, R12 22. Land runs the gate again before it pushes.

## Blockers

- **The Reynolds, Kermack and McKendrick, and Elowitz and Leibler PDFs are not yet in
  `reference/private/`.** G2 cannot pass until the flocking world's anchors are real.

## Decisions waiting on the owner

1. **Paid branch protection on GitHub** (ADR-0009's amendment).
2. **The deploy:** the owner connects Vercel (ADR-0017).

The hook's rule when a headline does not show, and five levels, were answered on 2026-10-16.

## Next three actions

1. Land `g3/reproducibility`.
2. Five levels and the planner bake-off on the new prompts, then the two papers regenerated.
3. G3a's close-out and the G3b plan.

## Recommendations

In priority order:

1. **Add the three PDFs to `reference/private/`.** Risk: no world may claim a passage it cannot
   cite.
2. **Consider GitHub branch protection.** Risk: land guards only this machine.
3. **Try the worlds on a real phone** once the deploy is live.
4. **Revisit TypeScript 7 monthly** (ADR-0001).
