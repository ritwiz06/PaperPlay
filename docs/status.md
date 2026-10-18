# Status

Updated 2026-10-17: the owner's answers, review rules, two planners, the G2 sources and the
learning family ([log](sessions/2026-10-17.md)). This file is rewritten every session.

## Where we are

- **Gate:** G1 Playable baseline **passed**, and is tagged `v0.1.0` at `3448e5b`. G2's flocking
  world is reviewed against its source map, Reynolds's paper from his own site (ADR-0045);
  `gates.json` keeps G1 current until the owner moves it to G2 (ADR-0009). G2's own gate,
  `npm run check:gate -- G2`, passed at `0a24c13`: every check, the reviewed world, and R01–R08 and
  R12 with passing evidence (the session log has its output).
- **The review rules** (ADR-0044), landed at `95713ad`: the direct-effect tag, named terms checked
  by code, emergent summaries never definitional, two reviewers who must agree, and misworded levels
  written again. Both worlds regenerated under them, 2026-10-18: hepatitis C at
  `/world/generated/pmc-PMC12334037-2026-10-18`, every level new; tuberculosis at
  `/world/generated/arxiv-2506.19869v1-2026-10-18`, its level 2's words written again.
- **G2's sources** (ADR-0045), landed at `4922f96`: Reynolds 1987 in the source register (ACM's
  copyright, the author's copy, its text not kept), `fixtures/papers/flocking/source-map.json` with
  13 claims, the flocking world's 19 placeholders now anchors. Kermack and McKendrick 1927 is free
  to read by the Royal Society's rule but its site refuses this machine (403): Threshold Town waits
  for the owner's browser download.
- **G3a.1 and G3a.2 are done** (ADR-0025 to ADR-0029).
- **G3a is closed out** (the roadmap's close-out, 2026-10-17): every item built, PDF ingest the
  last (ADR-0038); the owner's rules and decisions of 2026-10-16 landed: the machine's rules
  (ADR-0039), running the paper's own numbers (ADR-0040), five levels with the hook never dropped
  and the picks they led to (ADR-0041, ADR-0035's fourth amendment).
- **G3b's decisions are taken** (ADR-0046), and its first step is done (ADR-0047), landed at
  `fcd3c43`: the learning family (update rules as data, `learning.landscape@1.0.0`, its
  oracles derived by hand), the landscape kit, and Momentum Valley at `/world/momentum`, the family's
  reference, five levels meeting the level rule and the visibility rule, reviewed against its
  source map from PMLR's open copy of Sutskever et al. 2013.
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
- **One origin a sentence, every number in the chart's unit** (ADR-0042), landed at `938475a`.
- **Plans from two planners** (ADR-0043), landed at `8df84c3`: kimi-k2-7-code and glm-5-3, the
  better level kept for each slot.
- **Branches:** `g3/session-close`, this log's close, being landed; `worktree-agent-ab8301aef54d2fcc8`,
  the compartment agent's own, whose three commits are on `main`.
- **Working commit:** `fcd3c43` on `main`, where every branch of 2026-10-17 has landed.
- **CI and billing:** on 2026-10-18 GitHub refused to start the jobs of the run on `main` at `95713ad`
  ("recent account payments have failed or your spending limit needs to be increased"); the same
  commit's run on its branch had passed, and the next run on `main`, at `fcd3c43`, passed, `check:gate`
  and `capture:demo` both (run 39168707730). The Actions minutes on the private repository are the
  owner's to check.
- **Model provider:** Voyager, `https://openai.rc.asu.edu/v1`, its key `VOYAGER_API_KEY` in
  `apps/api/.env` only (ADR-0030); called only by `npm run pipeline:live`. Replies stream; a call
  may take up to 30 minutes.
- **Models per stage** (`apps/api/models.json`, from the bake-off, its planners run again with the
  model's response in front of them): reader qwen36-27b; first transcriber
  qwen3-235b-a22b-thinking-2507; second transcriber inkling-small; router glm-5-3; planner and
  explainer kimi-k2-7-code; second planner glm-5-3; reviewer glm-5-3 and second reviewer
  kimi-k2-7-code, from the reviewers' bake-off on the case worlds (ADR-0044). A job may spend 1,200,000 tokens. Twelve models the portal marks "Testing in
  progress" are excluded, as of the owner's snapshot of 2026-10-16.
- **Primitives:** `flock.planar.weighted@3.1.0` (ADR-0025); `compartments.ode@1.0.0` (ADR-0028);
  `learning.landscape@1.0.0` (ADR-0047).
- **Contracts:** `worldspec/3`, with `worldspec/2` still read (ADR-0027); `runrecord/3`
  (ADR-0023).
- **Runtime:** Node 24.21.0, pinned in `.node-version`.
- **What a learner can do:** the six flocking levels on `/world/hook`, Threshold Town's five on
  `/world/epidemic`, Momentum Valley's five on `/world/momentum`, the first generated world's five on `/world/generated/pmc-PMC12334037`, and
  the two worlds of 2026-10-17 above, now with its fork's chart fitted to what it measures and its
  town seen through a lens, each with its control, readout, guide, journal, prediction and fork. On
  this machine only, `/create` makes a world from an arXiv id, a PMCID or a PDF.

## Latest check:gate (G1), 2026-10-17, on `g3/learning-family` at 9e46daa

```
check:gate G1 · Playable baseline · tag v0.1.0
  runtime    node 24.21.0 (pinned 24.21.0)  ok
  typecheck  ok      23.2 s
  lint       ok      17.4 s
  check:docs ok      0.4 s
  test       ok      108.5 s
  build      ok      0.7 s
  test:e2e   ok      134.8 s
  evidence   951 tests (vitest 860, playwright 91), 0 skipped
    R01  Deterministic, oracle-checked primitives      160 passing
    R02  Model/render separation                       14 passing
    R03  Strict, versioned contracts                   159 passing
    R04  Playable local world                          20 passing

G1 passed: every required check ran and every requirement has passing evidence.
```

Ahead of their gate, from the same suites' reports: R01 160, R02 14, R03 159, R04 20, R05 18, R06 77, R07 40, R08 86, R09 46, R10 32, R11 30, R12 24. Land runs the gate again before it pushes.

## Blockers

- **Kermack and McKendrick 1927's PDF:** free to read by the Royal Society's rule, but its site
  refuses this machine (403). Threshold Town's anchors wait for the owner's browser download.

## Decisions waiting on the owner

1. **Hepatitis C's level 5:** emergent, so never definitional by rule 3, yet ruled a fault; the
   regenerated world ships its mirror image (ADR-0044). Which rule gives way.
2. **Whether an unsupported block needs both reviewers:** agreement lost kimi-k2-7-code's right block
   on the new hepatitis C world's level 3 (ADR-0044).
3. **Whether G2 is passed and tagged:** the flocking world is reviewed; `gates.json` keeps G1
   current until the owner moves it (ADR-0009).
4. **Paid branch protection on GitHub** (ADR-0009's amendment).
5. **The deploy:** the owner connects Vercel (ADR-0017).

The owner's G3b decisions of 2026-10-17 are ADR-0046; G3b's first step is ADR-0047.

## Next three actions

1. The owner's answers on hepatitis C's level 5 and on unsupported blocks.
2. G3b.2d: the pipeline on learning, so Adam can be generated, G3b's gate.
3. Kermack and McKendrick's PDF from the owner, for Threshold Town's source map.

## Recommendations

In priority order:

1. **Download Kermack and McKendrick 1927 in a browser** (doi 10.1098/rspa.1927.0118). Risk: no
   world may claim a passage it cannot cite.
2. **Consider GitHub branch protection.** Risk: land guards only this machine.
3. **Try the worlds on a real phone** once the deploy is live.
4. **Revisit TypeScript 7 monthly** (ADR-0001).
