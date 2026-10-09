# ADR-0009: Short branches off main

- Status: accepted. Decision 4 is amended by ADR-0011: `origin` is `ritwiz06/PaperPlay`,
  and pushes are routine so CI can run on them.
- Date: 2026-10-09
- Decided by: the owner, on 2026-10-09, before G2's interface work.

## Context

G1 was built on nine stacked branches, from `g1/kickoff` to `g1/world-local`, each started
on the one before it. `main` still pointed at the first commit (`842543b`), and there was
no remote. Stacking kept each change reviewable, but nothing was ever merged, so every new
branch carried all the unmerged work beneath it, and no single branch said what the project
had accepted.

## Decision

1. **`main` holds G1.** It was fast-forwarded through the stacked `g1/*` branches to
   `3aa0ea5`: the tagged `v0.1.0` (`3448e5b`) plus the docs-only commit that records the tag
   and the owner's answers. `check:gate` passed G1 on `3aa0ea5` before any G2 work began.
2. **From now on, work in short branches off the latest `main`:**
   - one coherent change per branch, named `<gate>/<topic>`;
   - never started on another unmerged branch;
   - merged with `git merge --ff-only` once its checks pass, after a rebase if `main` has
     moved, then deleted.
3. **Work the owner must see first stays on its branch** until the owner says so; a design
   spike is the usual case.
4. **`origin` is a private GitHub repository.** `main` and the `v0.1.0` tag go to it first.
   Pushes happen only when the owner asks; `main` is never force-pushed and tags never move.

The rule lives in `CLAUDE.md` under "Branches".

## Consequences

- `main` alone says what is accepted, and every commit on it passes the gate that was
  current when it merged.
- History stays linear, so `git log main` reads as the project's story, and a bisect walks
  only commits that passed.
- While G2 is in progress, `gates.json` keeps `current` at G1. So "checks pass" means G1's
  gate, plus every new test, which must pass even before its requirement is enforced. The
  gate switches to G2 when G2's evidence exists.
- The old `g1/*` branch names still exist. Each is an ancestor of `main`, so deleting them
  loses nothing; that is left to the owner.
