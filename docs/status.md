# Status

Updated 2026-10-09, at the close of the day's sixth session: a guard for `main`, G2's
essentials, and the plan for every paper ([log](sessions/2026-10-09-6.md)). This file is
rewritten every session.

## Where we are

- **Direction (ADR-0021):** PaperPlay builds for AI/ML, biomedical and scientific papers. The
  flocking world is the reference example. The plan is `docs/design/every-paper.md`, **for
  the owner's review. No pipeline code until it is reviewed.**
- **Gate:** G1 Playable baseline **passed**, and is tagged `v0.1.0` at `3448e5b`. G2 is in
  progress. `gates.json` keeps G1 current until G2's evidence exists (ADR-0009).
- **`main` moves only through `npm run land`** (ADR-0009, amended). Land refuses a dirty tree,
  runs `check:gate`, pushes the branch, waits for CI on that exact commit, and only on green
  fast-forwards `main`. The pre-push hook refuses any other push to `main`. This session:
  - every branch reached `main` that way;
  - land refused level 5's first landing, on red CI, and `main` stayed where it was.
- **Repository:** the private `ritwiz06/PaperPlay` is `origin`.
  - CI runs `check:gate` on every push and pull request.
  - Its capture job, on a pinned `ubuntu-24.04`, makes the canonical capture on `main`
    (ADR-0010, ADR-0011).
- **Branches:** only `main`.
- **Working commit:** `ea2fdf1` on `main`, the latest code commit: a prediction before every
  What-if. `check:gate` passed G1 on `ac6f413`, its tip, and CI run 38025467996 passed on the same
  commit.
- **Bundle:** the entry chunk is about 416 KB, and Three.js loads after it as its own 551 KB
  chunk. `vercel.json` is ready for a static deploy, with a tested Content-Security-Policy.
  The owner connects it (ADR-0017).
- **Primitive:** `flock.planar.weighted@3.1.0`, with queries Q1–Q4. Q4, birds at rocks,
  arrived this session and leaves the version unchanged.
- **Contracts:**
  - `worldspec/2` (ADR-0016, ADR-0018);
  - `runrecord/3`, with the learner's predictions (ADR-0023).

  G2 cannot pass while the flocking fixture is a draft with placeholder anchors.
- **Runtime:** Node 24.21.0, pinned in `.node-version`. Run tools through
  `fnm exec --using=24.21.0` when the shell's default Node differs.
- **What a learner can do now, on `/world/hook`:** the six levels on the game-first shell,
  each opening on seed 5, each with one control, one readout, a guide, a journal page and a
  What-if.
  - **Level 5 reads as birds at rocks:** a counter on the card, and rocks that light up while
    a bird is inside them.
  - **Every What-if asks for a prediction first:** two choices, never scored. The guide reports
    the result at the level's time, and the prediction is saved in the run's record.
  - **The fork:** two worlds side by side, stacked on a phone, with a chart that keeps 12 px
    labels on a phone.
  - **The speed button says "Speed 1×",** and the run goes at 1x, 2x or 4x.
  - **If the browser takes the graphics away,** the stage says so and offers "Tap to reload the
    world".
  - **Level 5's fork no longer stalls** for 1.6 s after its first frame.
- **`/world/local`** is as at G1. It moves into the shell after G3's first generated world
  (owner, this session).

## Latest check:gate (G1), 2026-10-09, commit ac6f413

Run by `npm run land` before it pushed `g2/predictions`:

```
check:gate G1 · Playable baseline · tag v0.1.0
  runtime    node 24.21.0 (pinned 24.21.0)  ok
  typecheck  ok      12.2 s
  lint       ok      8.9 s
  check:docs ok      0.2 s
  test       ok      29.1 s
  build      ok      0.4 s
  test:e2e   ok      101.9 s
  evidence   545 tests (vitest 476, playwright 69), 0 skipped
    R01  Deterministic, oracle-checked primitives      61 passing
    R02  Model/render separation                       6 passing
    R03  Strict, versioned contracts                   103 passing
    R04  Playable local world                          20 passing

G1 passed: every required check ran and every requirement has passing evidence.
```

Ahead of their gate, from the same run's reports: R05 4, R06 40, R07 20, R08 48, R12 16.

## Blockers

- **The Reynolds PDF is not yet in `reference/private/`.** The source map waits for it, and G2
  cannot pass until the flocking world's anchors are real.
- **The plan for every paper waits for the owner's review** (`docs/design/every-paper.md`). G3
  starts from its answers.

## Decisions waiting on the owner

1. **The plan's decisions,** listed at the top of `docs/design/every-paper.md`:
   - the order of families and the first test papers;
   - whether equations as data count as tier A;
   - the level rule for models with no randomness;
   - the gates re-cut, since G3 as written cannot hold the work;
   - when the primitive-builder agent comes;
   - three new dependencies;
   - the licence policy;
   - a PubMed Central open-access test paper.
2. **This session's choices** (ADR-0009's amendment, ADR-0022, ADR-0023, and the session log):
   - land's details;
   - level 5's counter showing birds inside rocks now, not a running total;
   - rocks casting no shadow;
   - the context-loss notice;
   - each level's prediction choices.
3. **Paid branch protection on GitHub,** which would refuse unlanded pushes to `main` on the
   server too (ADR-0009's amendment).
4. **The deploy:** the owner connects Vercel (ADR-0017). Then I check the CSP against the
   preview.
5. **The screenshots in `captures/session-6/`:** level 5's readout and the prediction prompts,
   on desktop and phone.

## Next three actions

1. The owner's review of `docs/design/every-paper.md`, then G3a.1, generalize, as the review
   decides.
2. The source map, once the Reynolds PDF is in `reference/private/`. G2 waits for it.
3. The CSP checked against the first preview deploy, and tightened.

## Recommendations

In priority order:

1. **Review the plan before any G3 code.** Risk: building the pipeline before the contracts
   generalize means building it twice.
2. **Add the Reynolds PDF before the reference fixture is marked reviewed.** Risk: no level
   may claim a passage it cannot cite.
3. **Consider GitHub branch protection.** Risk: land and its hook guard against mistakes on
   this machine, not against `--no-verify` or another clone.
4. **Try context loss and level 5's fork on a real phone** once the deploy is live. Risk: the
   tests run on desktop Chromium with SwiftShader only.
5. **Look into level 1's first fork after a page load,** about 1.3 s to its first frames on
   SwiftShader. Risk: on a slow phone it could feel stuck.
6. **Add the cross-runtime capture check before publishing widely** (ADR-0010).
7. **Revisit TypeScript 7 monthly** (ADR-0001).
