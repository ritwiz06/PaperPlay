# Progress

An append-only ledger with one entry per finished slice, newest first. Entries are added,
never rewritten. The plan lives in [roadmap.md](roadmap.md) and the present state in
[status.md](status.md).

Each entry gives the branch, the commits, what shipped, the requirement evidence counts,
and the gate summary. Counts are passing tests tagged with each requirement.

## 2026-10-09 · The hook design spike, for review

- Branch: `g2/hook-spike`, unmerged until the owner reviews it (ADR-0009)
- Commits: `5aadf22`
- Shipped:
  - `/world/hook`: the game-first HUD from ADR-0008, with hard-coded content over the live
    flock on seed 4.
  - Every element ADR-0008 lists: a world card, the level map, the guide, the level card
    with the one control and "What if", the depth toggle, and the paper journal with a
    placeholder passage and the legend.
  - One round of critique and one iteration. Screenshots are in `captures/hook-spike/`.
- Evidence:
  - 6 unit tests for the guide's sentences, untagged.
  - axe found no WCAG A or AA violation at 1440 × 900 or 390 × 844, with the journal shut
    or open.
- Gate: `check:gate` G1 passed at `5aadf22` with 275 tests.

## 2026-10-09 · The demo capture

- Branch: `g2/capture-demo`
- Commits: `edfadad`
- Shipped:
  - `npm run capture:demo`: seed 4 forming a murmuration while a scripted beacon is dragged
    through it, at 1080 × 1350 and 1920 × 1080, 15 s each, into the git-ignored
    `captures/` (ADR-0010).
  - The world advances two steps per video frame, and Playwright's own ffmpeg writes
    bit-exact VP8 WebM.
- Evidence:
  - 9 new unit tests, untagged.
  - Two full runs gave byte-identical frame streams and videos.
  - A planted unknown encoder failed at once, with ffmpeg's own message.
- Gate: `check:gate` G1 passed at `edfadad` with 269 tests.

## 2026-10-09 · The axe scan

- Branch: `g2/axe-scan`
- Commits: `3639dfb`
- Shipped:
  - `@axe-core/playwright` 4.13, approved on 2026-10-01.
  - Four [R12] scans of `/world/local`, for WCAG 2.0 to 2.2 at A and AA. They run as the
    page opens, and again with its rules open, a bird picked and a beacon placed, each at
    1280 × 720 and 360 × 740.
  - `npm run typecheck` now covers `tests/e2e`.
- Evidence: R01 43, R02 5, R03 49, R04 16, R12 4 (ahead of its gate), from 260 tests with
  none skipped. 4 of 4 planted violations were caught.
- Gate: `check:gate` G1 passed at `3639dfb`.

## 2026-10-01 · G1 tagged v0.1.0

- Branch: `g1/world-local`
- Commits: `3448e5b`
- Shipped: the G1 playable baseline, tagged `v0.1.0` (a local tag; nothing is pushed),
  with the owner's go-ahead.
- Evidence: R01 43, R02 5, R03 49, R04 16, from 256 tests with none skipped.
- Gate: `check:gate` G1 passed at `3448e5b`, exit 0.

## 2026-10-01 · The playable local world

- Branch: `g1/world-local`
- Commits: `109e9c6`, `73c491e`, `107a38a`
- Shipped:
  - `/world/local` on the hook seed: WorldStage, LabBench, the origin legend, readouts,
    placement, the selected-neighbour view, next seed and replay same seed (ADR-0007).
  - A recorded session that replays exactly through `runEvents`.
- Evidence: R01 43, R02 5, R03 49, R04 16. 20 of 20 planted bugs were caught.
- Gate: `check:gate` G1 passed at `107a38a`: every script ran, and every requirement has
  evidence.

## 2026-10-01 · Self-hosted fonts

- Branch: `g1/fonts`
- Commits: `788a1a3` (code), `eae973a` (docs)
- Shipped: Fredoka 400 and 600 and Literata 400, in latin and latin-ext, served from the
  page's own origin (ADR-0002).
- Evidence: 5 unit tests and 1 browser test, untagged. 6 of 6 planted failures were caught.
- Gate: no `check:gate` run is recorded at these commits; the run at `107a38a` includes them.

## 2026-10-01 · Hook seed and alignment's range

- Branch: `g1/hook-seed`
- Commits: `a93e033`, `ef7eb32` (code), `394e322` (docs)
- Shipped:
  - `flock.planar.weighted@2.2.0`, with alignment's range at 0–4.
  - `npm run choose:hook-seed` and `eval/sweeps/hook-seed.md`.
  - Seed 4 as the opening seed (ADR-0003).
- Evidence:
  - 7 tooling tests, one of which re-runs the rule; 2 of 2 planted bugs were caught.
  - Confirmed in the browser on `/world/local`.
- Gate: no `check:gate` run is recorded at these commits; the run at `107a38a` includes them.

## 2026-10-01 · Protocol location and private reference folder

- Branch: `g1/layout`
- Commits: `22fa5f6` (code), `50df5d1` (docs)
- Shipped:
  - `eval/protocol.md` is the protocol's only path (ADR-0005).
  - `reference/private/` is git-ignored, and the handbook was moved there (ADR-0006).
- Evidence: configuration and docs only. `git check-ignore` confirms the handbook is ignored.
- Gate: no `check:gate` run is recorded at these commits; the run at `107a38a` includes them.

## 2026-10-01 · Documentation system

- Branch: `g1/docs-system`
- Commits: `c84333d`
- Shipped:
  - The docs index, architecture, concepts, this ledger, and the session template and
    protocol.
  - `check:docs` in every gate.
- Evidence: 14 checker tests, one planted failure per rule, and 3 planted failures in the
  real files.
- Gate: `check:gate` G1 on its tree passed every script. R04 had no evidence yet.

## 2026-09-30 · Three.js stage core and adapter

- Branch: `g1/stage-three`
- Commits: `f89a2db` (code), `843050f` (docs)
- Shipped:
  - `@paperplay/ui`: tokens; a pure stage core that turns two states into a frame
    description; a Three.js adapter that draws it, with a plain message when WebGL2 is
    missing.
  - `apps/web` draws the live flock.
  - Playwright runs on forced SwiftShader (ADR-0004).
- Evidence: R01 40, R02 4, R03 49. 12 of 12 planted stage-core bugs and 2 of 2 planted
  browser bugs were caught.
- Gate: `check:gate` G1 at `843050f`. Every script passes; G1 is not passed, because R04 has
  no evidence yet.

## 2026-09-30 · Flock defaults by sweep (flock 2.1.0)

- Branch: `g1/flock-defaults`
- Commits: `cdaf66f`
- Shipped:
  - `npm run sweep:defaults`, a deterministic two-stage sweep with a held-out check.
  - Its tables in `eval/sweeps/`.
  - New defaults as `flock.planar.weighted@2.1.0` (ADR-0003).
- Evidence: the sweep table was byte-identical across runs. The chosen defaults ordered 14
  of 20 sweep seeds but 17 of 40 held-out seeds.
- Gate: no `check:gate` run is recorded at this commit; the run at `843050f` includes it.

## 2026-09-30 · RunRecord v2 and replay

- Branch: `g1/run-record-v2`
- Commits: `a5ca4df`
- Shipped:
  - `runrecord/2`: a strict event union (param, place, remove), plus `sampleInterval` and
    `totalSteps`, so a truncated record fails.
  - `flock.planar.weighted@2.0.0`, with named beacons and obstacles.
  - `runEvents` and `replayRecord`.
- Evidence: the new contract tests count towards R03; R07 has 11 replay tests (partial).
  7 of 7 planted replay bugs were caught.
- Gate: no `check:gate` run is recorded at this commit; the run at `843050f` includes it.

## 2026-09-28 · G1 kickoff

- Branch: `g1/kickoff`
- Commits: `c18488d` (code), `3b2352a` (docs)
- Shipped:
  - The monorepo skeleton: pinned Node, strict TypeScript, Vitest, Playwright, ESLint and
    `check:gate`.
  - The G1 contracts.
  - `flock.planar.weighted@1.0.0`, with hand-derived oracle fixtures.
- Evidence: R01 40, R03 42, from 111 tests in total. 12 of 12 planted primitive bugs were
  caught.
- Gate: `check:gate` G1 failed by design. All five scripts passed; R02 and R04 had no
  evidence.
