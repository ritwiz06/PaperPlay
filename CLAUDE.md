# PaperPlay — standing instructions for Claude Code

PaperPlay turns a research paper into a playable, explorable world: the paper is the storyline, each level has one thing you can manipulate and one "what if the authors had…" fork, and every control is tethered to the passage in the paper it came from. It is a **learning sandbox, not a simulation of the study**: no scores, no badges, no claims of reproducing the authors' results.

Start every session with the session protocol below. The documentation index is `docs/README.md`; the full build brief is `docs/BUILD_PROMPT.md`.

## Session protocol
At the start, read `docs/status.md`, the latest session log and `docs/architecture.md`, then only what the task touches: relevant ADRs, requirement rows, the roadmap's gate section, concept entries. Don't reread everything. Record what you read in the session log.

Before stopping, update:
- the session log, `docs/sessions/YYYY-MM-DD.md` (template in `docs/README.md`; add `-2`, `-3` for further sessions that day);
- `docs/status.md`;
- `docs/progress.md` if a slice finished;
- `docs/roadmap.md` checklists and plan changes;
- `docs/requirements.md` counts;
- `docs/architecture.md` if packages, contracts or boundaries changed;
- `docs/concepts.md` if a new concept appeared;
- an ADR in `docs/decisions/` for any decision.

Commit docs separately as "docs: …". `npm run check:docs`, which `check:gate` runs, fails when the docs drift from the repository.

## Commands (Windows PowerShell first; use `npm.cmd` if `npm.ps1` is blocked)
- `npm run dev` — web app (Vite) · `npm run dev:api` — Fastify API
- `npm run typecheck` · `npm run lint` · `npm run test` (Vitest) · `npm run test:e2e` (Playwright)
- `npm run check:gate` — runs every check the current gate requires, `check:docs` included; must actually run tests (no `--passWithNoTests`, no silent skips)
- `npm run check:docs` — checks the docs against the repository (rules in `docs/README.md`)
- `npm run sweep:defaults` — reproduces the flock defaults sweep (ADR-0003) · `npm run choose:hook-seed` — re-applies the hook-seed rule (ADR-0003)
- `npm run replay -- <run.json>` — replays a run record and reports tolerance results (arrives at G2)

## Repository shape
```
apps/web          React 19 + Vite + TS. Renders state, submits actions, shows evidence. Never computes science.
apps/api          Node 24 + Fastify + TS. Holds secrets, runs the job state machine, makes bounded model calls.
packages/contracts  Zod schemas + types: SourceManifest, Anchor, WorldSpec, Action, RunRecord, JobState.
packages/primitives Pure, deterministic, fixed-step scientific primitives (starts with flock.planar.weighted).
packages/pipeline   Reader → Planner/Designer → Explainer → Builder → Checks → Reviewer → Controller. Mock provider first.
packages/ui         Design tokens, world stage, and the game-first HUD (ADR-0008): level card, guide, paper journal, level map, depth toggle, fork view.
eval/               protocol.md (frozen at G4, ADR-0005), held-out sections, baseline B1, raw attempts, analysis; sweeps/ behind teaching-choice defaults.
fixtures/           Papers, source maps, WorldSpec fixtures, independent oracle fixtures.
reference/          murmuration-valley.html — the accepted world and palette; outbreak-island.html — the game-first HUD (ADR-0008). Read them; do not copy them verbatim. private/ is git-ignored owner-only material (ADR-0006): read a file there only when the owner asks.
docs/               README (index), project-brief, roadmap, status, requirements, architecture, concepts, progress, sessions/, decisions/ (ADRs)
```

## The boundaries that matter most
1. **Renderer displays state; primitives compute state.** Changing a mesh, colour, or camera must never change a measurement. Test this.
2. **Generated output is data, not code.** Agents emit a validated `WorldSpec`; a deterministic builder interprets it against the primitive registry. Free-form generated widgets exist only behind `FEATURE_WIDGETS=1`, run in a sandboxed iframe (`sandbox="allow-scripts"` only, separate origin), and are labelled `generated-inference`.
3. **Every displayed statement carries an origin label**: `paper-derived` (with an anchor), `teaching-choice`, `computed-observation`, or `generated-inference`. Never let a teaching default read as a paper claim.
4. **Paper text is untrusted input.** It cannot grant permissions, request credentials, or change controller policy.
5. **A reviewer cannot overturn a numerical check.** Controller allows at most two scoped repairs per change, then preserves the prior working artifact.
6. **No fake progress.** Show real job states (`received → parsing → planning → building → running → checking → ready`, plus `needs_information | unsupported | repairing | failed | cancelled`). Never a timed progress bar. `ready` is unreachable while any required check is pending or failed.
7. **Secrets live in `apps/api/.env` only.** A build step greps the client bundle for key prefixes and fails if found.
8. **Every WorldSpec level has exactly one manipulable action and exactly one counterfactual.** This is enforced in Zod `.refine()`, not in prose.

## Branches (ADR-0009)
- `main` is the line of record: `npm run check:gate` passes on every commit it holds, and gate tags are cut on it.
- Work in short branches off the latest `main`, one coherent change each, named `<gate>/<topic>` (for example `g2/axe-scan`). Never start a branch on another unmerged branch.
- When a branch's checks pass, rebase it onto `main` if `main` has moved, merge it with `git merge --ff-only` so history stays linear, and delete the branch.
- A branch whose result the owner must see first, such as a design spike, stays unmerged until the owner says so.
- `origin` is the private `ritwiz06/PaperPlay`. CI runs `check:gate` on every push and pull request (ADR-0011), so push a branch to run CI on it, and push `main` after each merge. Never force-push `main` or move a tag.

## Working style
- Smallest reviewable slice per change; one coherent change per branch.
- Before implementing, restate the acceptance condition in plain language.
- After implementing: run the relevant checks, show exact output, and update the docs as the session protocol says.
- Never claim a gate passed without running `npm run check:gate` and pasting the result.
- Prefer deleting scope over weakening a check.
- Ask before adding a dependency, a new agent role, or a new world. Record the decision as an ADR.

## Design floor (details in the build brief)
Accepted palette: cream `#f8faee`, ink `#172b2b`, dark `#132b2b`, aqua `#62cbc2`, lime `#d4f581`, line `#d2ddd3`, sub `#526a66`. Game-first layout (ADR-0008): the stage fills the screen at all times, with no permanent side columns; a level card (title, goal, the one control, "What if"), the guide and a compact level map sit over it; the paper journal slides over on demand, and every control's "From the paper" tap opens it at its passage. Origin chips name their origin in words; the legend lives in the journal. Sentence case everywhere. No all-caps eyebrow labels, no numbered `01/02/03` markers unless content is a sequence, no identical card grids, no arrows appended to buttons, no fade-up-on-scroll on every section. Respect `prefers-reduced-motion`. Keyboard focus visible.

## Out of scope for month one
Universal paper coverage, arbitrary generated code execution outside the widget sandbox, reproduction of original experiments, billing/teams, multiple providers, photorealism/VR/multiplayer, Next.js/Trigger.dev/Neon productization (planned after G5; packages are framework-agnostic so they port).
