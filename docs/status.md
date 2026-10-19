# Status

Updated 2026-10-19: fast sessions ([log](sessions/2026-10-19.md)). This file is rewritten
every session.

## Where we are

- **Gate:** G2 Verified authored world is current (2026-10-18), and `v0.2.0` is cut on the commit
  that made it so, with release notes in `docs/releases/v0.2.0.md` listing what G2 deferred and why.
  G1 is tagged `v0.1.0` at `3448e5b`.
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
- **The review corrections landed** at `46a2c12` (ADR-0044's amendment): definitional corrected and
  found by code, a spread headline's hook on an infected compartment, one reviewer's unsupported block
  enough, reviewers never the planners or the explainer (inkling-small and qwen38-27b), and hepatitis C
  regenerated under them, three levels, its hook on the quitters.
- **The library** (ADR-0049), on `g3/library`: `/library`, every world with its paper, kind, status,
  levels and picture, linked from every world's title card, in the public build too.
- **The library landed** at `419f0e9`.
- **The UI atlas** (ADR-0050), on `g3/atlas`: `npm run atlas`, every route, world, level and state at
  1440 × 900 and 390 × 844, with a clip per level, into `captures/atlas/<date>/`; the first, of
  2026-10-18, is published for the owner as a private artifact,
  https://claude.ai/artifact/ExYNaZyJRoA7az7UpBkdU1, its files in the git-ignored
  `captures/atlas/2026-10-18/` of the main worktree. `docs/design/ui-inventory.md` names
  every screen and HUD element; `docs/design/owner-review.md` takes the owner's notes.
- **Fast sessions** (ADR-0051), landing as one stack: land takes a stack and gates its tip in the
  land checkout; `npm run test:affected`; the sweeps cached and checked, a nightly CI run from
  scratch; CI's installs cached; live runs in the background only when the owner asks; token caps
  in `models.json`; the atlas incremental; the three older hepatitis C worlds retired.
- **Branches:** the stack `g3/stack-land` < `g3/faster-checks` < `g3/live-background` <
  `g3/retire-hcv` < `g3/atlas-incremental`, being landed.
- **Worktrees:** the main one, and `PaperPlay-land`, land's own checkout for the gate, kept with its
  dependencies (ADR-0051).
- **Working commit:** `c2f0341` on `main`; `v0.2.0` is `b37c7dc`.
- **CI and billing:** about 2,111 Actions minutes from 1 to 18 October, by the jobs' own durations
  rounded up per job, against GitHub Free's 2,000 for a private repository; GitHub refused a run on
  `main` on 2026-10-18. Since `g2/release`, a push to `main` runs the gate only when its branch run did
  not already pass (main's run of `b37c7dc` took 4 seconds), and the capture runs on demand only
  (ADR-0048).
- **Model provider:** Voyager, `https://openai.rc.asu.edu/v1`, its key `VOYAGER_API_KEY` in
  `apps/api/.env` only (ADR-0030); called only by `npm run pipeline:live`. Replies stream; a call
  may take up to 30 minutes.
- **Models per stage** (`apps/api/models.json`, from the bake-off, its planners run again with the
  model's response in front of them): reader qwen36-27b; first transcriber
  qwen3-235b-a22b-thinking-2507; second transcriber inkling-small; router glm-5-3; planner and
  explainer kimi-k2-7-code; second planner glm-5-3; reviewer inkling-small and second reviewer
  qwen38-27b, from the reviewers' bake-off on the case worlds, neither the planner, the second planner
  nor the explainer (ADR-0044's amendment). A job may spend 1,200,000 tokens. Twelve models the portal marks "Testing in
  progress" are excluded, as of the owner's snapshot of 2026-10-16.
- **Primitives:** `flock.planar.weighted@3.1.0` (ADR-0025); `compartments.ode@1.0.0` (ADR-0028);
  `learning.landscape@1.0.0` (ADR-0047).
- **Contracts:** `worldspec/3`, with `worldspec/2` still read (ADR-0027); `runrecord/3`
  (ADR-0023).
- **Runtime:** Node 24.21.0, pinned in `.node-version`.
- **What a learner can do:** the six flocking levels on `/world/hook`, Threshold Town's five on
  `/world/epidemic`, Momentum Valley's five on `/world/momentum`, the first generated world's five on `/world/generated/pmc-PMC12334037`, hepatitis C's three under the corrected rules on `/world/generated/pmc-PMC12334037-2026-10-18-2`, its hook on the quitters, and
  the two worlds of 2026-10-17 above, now with its fork's chart fitted to what it measures and its
  town seen through a lens, each with its control, readout, guide, journal, prediction and fork. On
  this machine only, `/create` makes a world from an arXiv id, a PMCID or a PDF. `/library` lists
  every world.

## Latest check:gate (G2), 2026-10-18, on `g3/library` at 0330679

G2's own run, which `v0.2.0` names, was on `g2/release` at `b37c7dc`: 954 tests, CI green
(https://github.com/ritwiz06/PaperPlay/actions/runs/39175501504). This one is the library's.

```
check:gate G2 · Verified authored world · tag v0.2.0
  runtime    node 24.21.0 (pinned 24.21.0)  ok
  typecheck  ok      23.6 s
  lint       ok      17.4 s
  check:docs ok      0.4 s
  test       ok      110.4 s
  build      ok      0.8 s
  test:e2e   ok      170.3 s
  world      ok      fixtures/worldspecs/flocking-reference.json
  evidence   968 tests (vitest 872, playwright 96), 0 skipped
    R01  Deterministic, oracle-checked primitives      160 passing
    R02  Model/render separation                       14 passing
    R03  Strict, versioned contracts                   162 passing
    R04  Playable local world                          20 passing
    R05  Origin labels and two-way provenance          18 passing
    R06  Level structure and learning tools            77 passing
    R07  Replay and stale evidence                     40 passing
    R08  Spec, not code                                86 passing
    R12  Accessibility and motion floor                26 passing

G2 passed: every required check ran and every requirement has passing evidence.
```

Ahead of their gate, from the same suites' reports: R09 48, R10 36, R11 31. Land runs the gate again
before it pushes.

## Blockers

- **Kermack and McKendrick 1927's PDF:** free to read by the Royal Society's rule, but its site
  refuses this machine (403). Threshold Town's anchors wait for the owner's browser download.

## Decisions waiting on the owner

1. **The Actions minutes:** about 2,111 used from 1 to 18 October against GitHub Free's 2,000 for a
   private repository; the owner checks the plan or the spending limit (ADR-0048). The exact figure
   needs the token's `user` scope: `gh auth refresh -h github.com -s user`.
2. **The fork that stops in the older hepatitis C worlds:** the atlas found level 1 of
   `pmc-PMC12334037`, `-2026-10-17` and `-2026-10-18` stopping mid-fork when the control is at the top
   of its range, the solver refusing a step to Infinity or NaN; mend the worlds, or retire them for
   the regenerated one.
3. **The tuberculosis world of 2026-10-18:** its levels 1 and 3 are definitional by the corrected
   rule; regenerate it, or keep it as made, as the library now shows it.
4. **Paid branch protection on GitHub** (ADR-0009's amendment).
5. **The deploy:** the owner connects Vercel (ADR-0017).

The owner settled what counts as definitional, unsupported wording, reviewers' independence and G2
on 2026-10-18; all of it has landed.

## Next three actions

1. The owner decides on a public repository, the Student Pack or a self-hosted runner, with the
   pre-publication check of 2026-10-19; and reviews the atlas in `docs/design/owner-review.md`.
2. G3b.2d: the pipeline on learning, so Adam can be generated, G3b's gate.
3. Kermack and McKendrick's PDF from the owner, for Threshold Town's source map.

## Recommendations

In priority order:

1. **Download Kermack and McKendrick 1927 in a browser** (doi 10.1098/rspa.1927.0118). Risk: no
   world may claim a passage it cannot cite.
2. **Consider GitHub branch protection.** Risk: land guards only this machine.
3. **Try the worlds on a real phone** once the deploy is live.
4. **Revisit TypeScript 7 monthly** (ADR-0001).
