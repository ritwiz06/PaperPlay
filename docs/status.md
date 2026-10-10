# Status

Updated 2026-10-10, at the end of the day's first session: the owner's answers to the plan,
then G3a.1 and G3a.2 ([log](sessions/2026-10-10.md)). This file is rewritten every session.

## Where we are

- **The plan for every paper is answered** (ADR-0024). G3 is re-cut into G3a and G3b, and the
  roadmap gives gates and effort, with no day ranges.
- **Gate:** G1 Playable baseline **passed**, and is tagged `v0.1.0` at `3448e5b`. G2's
  interface is done; it waits for the Reynolds PDF and the source map. `gates.json` keeps G1
  current until G2's evidence exists (ADR-0009).
- **G3a.1, generalize, is done,** on short branches landed through `npm run land`: records of
  the six levels before the refactor (landed at `f79ff76`), primitive families (`34e713a`,
  ADR-0025), scene kits and the generic session and fork (`a0567bf`, ADR-0026), `worldspec/3`
  (`e049dad`, ADR-0027). Tests changed only their imports (and four lines their field's name),
  the records replay bit for bit, and the capture's hashes are `f0bc31c`'s.
- **G3a.2, the compartment family and Kermack and McKendrick by hand, is done:**
  - **landed:** `compartments.ode@1.0.0`, its checks and oracles, in the registry and the
    builder (`32c7899`, ADR-0028, landed at `8bd9a20`);
  - **landing:** the town kit, the shell playing any world, and Threshold Town at
    `/world/epidemic`, every level meeting the rule over the world's values and 19 near them
    (`cf2551d`, ADR-0029).
- **`main` moves only through `npm run land`** (ADR-0009, amended).
- **Repository:** the private `ritwiz06/PaperPlay` is `origin`. CI runs `check:gate` on every
  push and pull request.
- **Branches:** `g3/kermack-mckendrick`, being landed; `worktree-agent-ab8301aef54d2fcc8`, the
  compartment agent's own, whose three commits are on `main`.
- **Working commit:** `cf2551d` on `g3/kermack-mckendrick`. `main` is at `8bd9a20`, whose
  `check:gate` passed G1 and whose CI passed.
- **Primitives:** `flock.planar.weighted@3.1.0`, with queries Q1–Q4, the agents family's
  first, at `@paperplay/primitives/flock` (ADR-0025); `compartments.ode@1.0.0`, the solver for
  every compartment model, at `@paperplay/primitives/compartments` (ADR-0028).
- **Contracts:** `worldspec/3`, with `worldspec/2` still read (ADR-0027); `runrecord/3`
  (ADR-0023).
- **Runtime:** Node 24.21.0, pinned in `.node-version`.
- **What a learner can do:** the six flocking levels on `/world/hook`, and Threshold Town's five
  on `/world/epidemic`, each with its control, readout, guide, journal page, prediction and
  fork; both journals now say what the world cannot show; a town can start again.

## Latest check:gate (G1), 2026-10-10, commit 4a6849d

The code of `cf2551d` before its tests were retagged; land's own run on the branch's tip is in
the session log.

```
check:gate G1 · Playable baseline · tag v0.1.0
  runtime    node 24.21.0 (pinned 24.21.0)  ok
  typecheck  ok      18.1 s
  lint       ok      13.9 s
  check:docs ok      0.3 s
  test       ok      43.3 s
  build      ok      0.6 s
  test:e2e   ok      126.8 s
  evidence   746 tests (vitest 671, playwright 75), 0 skipped
    R01  Deterministic, oracle-checked primitives      151 passing
    R02  Model/render separation                       7 passing
    R03  Strict, versioned contracts                   151 passing
    R04  Playable local world                          20 passing

G1 passed: every required check ran and every requirement has passing evidence.
```

After retagging: R02 9. Ahead of their gate: R05 5, R06 53, R07 40, R08 59, R12 18.

## Blockers

- **The Reynolds, Kermack and McKendrick, and Elowitz and Leibler PDFs are not yet in
  `reference/private/`.** Each one's source register and source map come first when it
  appears (ADR-0024). G2 cannot pass until the flocking world's anchors are real.

## Decisions waiting on the owner

1. **Paid branch protection on GitHub,** which would refuse unlanded pushes to `main` on the
   server too (ADR-0009's amendment).
2. **The deploy:** the owner connects Vercel (ADR-0017). Then I check the CSP against the
   preview.
3. **Threshold Town's design, to confirm (ADR-0029):** its five levels and their claims; four
   days of the model a second at 1x; every value a teaching choice; forks told from day 0;
   Start again.
4. **The level rule's neighbourhood, to confirm:** factors from `mulberry32(k)` for starts 2
   to 20, and the What-if's values held exact at every start.

## Next three actions

1. Land `g3/kermack-mckendrick`, then record the land and `main`'s CI.
2. G3a.3, next session: `apps/api`'s jobs and events, ingest, and the pipeline on the
   compartment family, with Elowitz and Leibler as its first generated world.
3. When the PDFs arrive: the source registers and maps, then Threshold Town's and Murmuration
   Valley's anchors made real.

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
