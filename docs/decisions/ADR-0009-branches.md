# ADR-0009: Short branches off main

- Status: accepted. Decision 4 is amended by ADR-0011: `origin` is `ritwiz06/PaperPlay`,
  and pushes are routine so CI can run on them. Decision 2 is amended below (2026-10-09,
  the sixth session): `main` moves only through `npm run land`.
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

## Amendment, 2026-10-09: main moves only through npm run land

Decided by the owner, after three broken states reached `main` in the day's fifth session:
- `8634b2b` failed `check:docs`, because the check's output was piped through `tail` and the
  chain read `tail`'s exit status;
- `85e43fe` failed a browser test, because only part of the gate ran before the merge;
- `7cdf2b8` was merged before CI had run on it, and failed there.

Each time the rule was known and not followed. The fix is to make breaking it impossible in
routine work, not to remember it harder.

### Decision

1. **`npm run land` is the only routine way `main` moves.** Run on a branch, it refuses, at
   the first problem:
   - main itself, a detached HEAD, or a branch not named `<gate>/<topic>`, so a spike cannot
     be landed;
   - a tree with any uncommitted or untracked change;
   - a branch not on top of origin's `main`;
   - `npm run check:gate` exiting non-zero, read from its own exit status, with no pipe;
   - a gate that changed the tree or HEAD.

   Then it pushes the branch and waits for CI's run on that exact commit with
   `gh run watch`. Only when that run concluded success does it fast-forward origin's
   `main` to the commit, then the local `main`, and delete the branch. It takes no options,
   so nothing can skip a step.
2. **A pre-push hook refuses any push that would move or delete `main`** unless land recorded
   the commit as gate-passed and CI-green. The records live in `.git/paperplay/landed/`,
   never in the tree. The hook is `.githooks/pre-push`, and npm's `prepare` script points git
   at `.githooks` on every install. Land also sets it if it is missing.
3. **Tests cover land's refusal paths** against throwaway repositories with a bare remote:
   - a dirty tree;
   - main, a detached HEAD and a spike branch;
   - a branch behind `main`;
   - a planted failing gate;
   - a gate that writes to the tree;
   - red CI;
   - a CI run on another commit;
   - no CI run at all.

   They also cover the hook's refusals. They are in `scripts/test/land.test.ts`, and they
   catch four planted bugs in land and the guard.

### Consequences

- **What "passes on every commit" now means.** Every commit `main` has pointed to since this
  amendment passed `check:gate` locally and CI on that same commit. The commits inside a
  slice, between its start and its tip, are not gated one by one. A bisect may land on one
  that fails.
- **Landing takes as long as CI,** about 13 minutes per slice on the 2026-10-09 runs.
  Docs-only work lands the same way.
- **What the guard does not stop.** It is local. `git push --no-verify`, a forged record, or a
  push from a clone without the hooks can still move `main`. It stops mistakes, not an
  adversary. GitHub's branch protection would stop those pushes on the server, but for a
  private repository it needs a paid plan. That choice is the owner's.
- **CI runs twice per landed commit:** once on the branch, which land waits for, and once on
  `main` after the push. The second run adds the capture job.
