# ADR-0051: Fast sessions

- Status: accepted. The owner asked on 2026-10-19 for sessions of about two hours: measure where
  the time goes, then land a stack once, test only what changed while developing, cache the
  deterministic sweeps, keep live runs out of build sessions, cap the docs, run the atlas only on
  request and incrementally, keep worktrees temporary, and retire the hepatitis C worlds whose
  forks freeze. The mechanisms are mine. Amends ADR-0009 (land), ADR-0049 (the library) and
  ADR-0050 (the atlas).
- Date: 2026-10-19
- Decided by: the owner, the aims; me, how they are met.

## Context

Over the sessions of 2026-10-16 (second), 2026-10-17 and 2026-10-18, 6 to 8 active hours each, the
wall clock went to live model calls (25 to 63%), to lands (18 to 26%, mostly waiting for CI's 13 to
14 minutes, four to six lands a session), then to writing code and replies; a local gate took 3 to 5
minutes. Retries, regenerations run again and lands refused, cost 1 to 3 hours a session. The
slowest tests were the bake-off's replay (90 s) and the level rule's sweep (39 s); the browser
suite took 807 s of test time on six workers. The table is in `docs/sessions/2026-10-19.md`.

## Decision

1. **Land a stack** (amends ADR-0009). `npm run land` on the tip lands every `<gate>/<topic>`
   branch between origin's main and it: one gate on the tip, the tip alone pushed, so one CI run,
   then main moved to the tip and every branch of the stack deleted. The gate runs in its own
   checkout, the sibling folder `<repository>-land`, kept between lands: set to the tip, its
   untracked files cleared, its dependencies installed only when `package-lock.json` changed, the
   API's `.env` linked. The checkout land was started in moves to main only if it is still on the
   tip, so work goes on there while the gate and CI run; never a local browser test while the gate
   runs, as both use ports 4317 and 4318.
2. **Only the affected tests while developing:** `npm run test:affected` runs Vitest's tests related
   to every file changed since main, through its module graph, and the Playwright specs for the
   routes those files serve, by a map in `scripts/affected.ts`; a file the map does not place runs
   every spec. Tests that read fixtures at run time are not in the module graph, so the full gate,
   inside land, remains the check.
3. **Deterministic sweeps cached and checked:** the level rule's sweeps and the bake-off's replays
   record, in `eval/sweeps/cache.json`, the hash of every input (the primitives', pipeline's and
   contracts' code, the fixtures, the recordings, the lockfile) and the hash of the output they
   gave. A hit is checked, not skipped: both are hashed afresh from the files. `npm run
   sweeps:cache` records them after a change; each night, if main moved in the day before, CI runs
   them from scratch and fails if any differs.
4. **Playwright and CI:** half the cores locally, as measured (122 s at six workers, 139 s and a
   failed first frame at nine). CI restores `node_modules` and the browsers from its cache by the
   lockfile, and a pushed tag runs nothing.
5. **Live runs outside build sessions:** none unless the owner asks for it in that session's
   prompt. `npm run pipeline:live -- <command> --background` runs detached, its output and a record
   of how it ended in `apps/api/data/live/`, for the next session to review; `job <source>` runs one
   job with no server. Calls that need nothing from each other are asked at once (the reading and
   the two transcriptions; the explainer's levels), the gateway's client still spacing their starts
   by `minIntervalMs`. `models.json` caps each stage's tokens, thinking and reply together, at or
   above the room each asks for today, so every recording replays.
6. **Docs in about ten minutes a session:** only the parts of status, roadmap and requirements that
   changed; a short session log; concepts only when one is new.
7. **The atlas on request, and incremental** (amends ADR-0050): each world's inputs (its fixture,
   its kit, the code every world page runs) are hashed in the manifest; an unchanged world keeps the
   last atlas's shots and clips; `--all` shoots every one.
8. **Worktrees are temporary:** each is removed when its branch lands; status lists any that exist,
   with why. The land checkout is the one kept.
9. **Retired worlds** (amends ADR-0049): the three older hepatitis C worlds, whose forks freeze at the
   top of their control's range, move to `fixtures/worldspecs/retired/` with `retired.json` saying
   when, why and what replaces them; the shell has no route for them, their job records stay, and
   the library lists them as retired, with no link.

## Consequences

- A session lands once, so its branches stack; a branch the owner must see first stays off the stack.
- A change to a sweep's inputs costs that sweep's full run in each gate until `npm run sweeps:cache`
  records it again.
- The nightly run costs up to about 5 minutes on days main moved.
