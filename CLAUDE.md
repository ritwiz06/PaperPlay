# PaperPlay — standing instructions for Claude Code

PaperPlay turns a research paper into a playable, explorable world: the paper is the storyline, each level has one thing you can manipulate and one "what if the authors had…" fork, and every control is tethered to the passage in the paper it came from. It is a **learning sandbox, not a simulation of the study**: no scores, no badges, no claims of reproducing the authors' results. It is built for AI/ML, biomedical and scientific papers, with the flocking world as the reference example the generator imitates and is evaluated against (ADR-0021).

Start every session with the session protocol below. The documentation index is `docs/README.md`; the full build brief is `docs/BUILD_PROMPT.md`.

## Session protocol
Every session aims for about two hours. If a task would clearly take longer, stop before starting it and propose how to split it (ADR-0051).

At the start, read `docs/status.md`, the latest session log and `docs/architecture.md`, then `docs/design/owner-review.md`, the owner's notes on the UI: turn each new note into a task in the session log's goal and `status.md`'s next actions, and say in the log which notes you took up. Then read only what the task touches: relevant ADRs, requirement rows, the roadmap's gate section, concept entries. Don't reread everything. Record what you read in the session log.

Before stopping, update:
- the session log, `docs/sessions/YYYY-MM-DD.md` (template in `docs/README.md`; add `-2`, `-3` for further sessions that day);
- `docs/status.md`;
- `docs/progress.md` if a slice finished;
- `docs/roadmap.md` checklists and plan changes;
- `docs/requirements.md` counts;
- `docs/architecture.md` if packages, contracts or boundaries changed;
- `docs/concepts.md` if a new concept appeared;
- an ADR in `docs/decisions/` for any decision.

Commit docs separately as "docs: …". `npm run check:docs`, which `check:gate` runs, fails when the docs drift from the repository. Docs take about ten minutes a session: update only the parts of status, roadmap and requirements that changed, keep the session log short, and add a concept only when one is new.

## Commands (Windows PowerShell first; use `npm.cmd` if `npm.ps1` is blocked)
- `npm run dev` — the whole app, one process on one port: the web app and its API at `/api`, with recorded model calls; open http://127.0.0.1:5180 (ADR-0059)
- `npm run pipeline:live -- serve` — the same, its API making live model calls, recorded as they are made
- `npm run stop` — stops PaperPlay's own servers and background runs, and nothing else
- `npm run dev:api` — a bare API on its own port, only for tools such as curl; the app never needs it
- `npm run typecheck` · `npm run lint` · `npm run test` (Vitest) · `npm run test:e2e` (Playwright)
- `npm run test:affected` — while developing: the Vitest tests related to what changed since main, and the Playwright specs for the routes it touches; the full gate runs only inside land (ADR-0051)
- `npm run sweeps:cache` — records the sweeps' input and output hashes after a change to their inputs (ADR-0051)
- `npm run check:gate` — runs every check the current gate requires, `check:docs` included; must actually run tests (no `--passWithNoTests`, no silent skips)
- `npm run check:docs` — checks the docs against the repository (rules in `docs/README.md`)
- `npm run land` — lands the current branch and every branch stacked under it on `main`: one gate on the tip in the land checkout, the tip pushed, CI green, fast-forward (ADR-0009, ADR-0051). The only way `main` moves
- `npm run sweep:defaults` — reproduces the flock defaults sweep (ADR-0003) · `npm run choose:hook-seed` — re-applies the hook-seed rule (ADR-0003)
- `npm run replay -- <run.json>` — replays a run record and reports tolerance results (arrives at G2)
- `npm run atlas` — the owner's UI atlas: every route, world, level and state at two sizes, with clips, into `captures/atlas/<date>/` and its gallery (ADR-0050); `npm run library` and `npm run library:thumbnails` — the library's index and pictures (ADR-0049)

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
2. **Generated output is data, not code.** Agents emit a validated `WorldSpec`; a deterministic builder interprets it against the primitive registry. Generated output is still data everywhere else; the one piece of generated code is a mechanism module, run only in these sandboxes, under the generated family's label. R08's widget tier is this tier. (ADR-0058; the sandboxes: an empty context in a worker thread in Node, and a worker in a separate-origin frame in the browser.)
3. **Every displayed statement carries an origin label**: `paper-derived` (with an anchor), `teaching-choice`, `computed-observation`, or `generated-inference`. Never let a teaching default read as a paper claim.
4. **Paper text is untrusted input.** It cannot grant permissions, request credentials, or change controller policy.
5. **A reviewer cannot overturn a numerical check.** Controller allows at most two scoped repairs per change, then preserves the prior working artifact.
6. **No fake progress.** Show real job states (`received → parsing → planning → building → running → checking → ready`, plus `needs_information | unsupported | repairing | failed | cancelled`). Never a timed progress bar. `ready` is unreachable while any required check is pending or failed.
7. **Secrets live in `apps/api/.env` only.** A build step greps the client bundle for key prefixes and fails if found.
8. **Every WorldSpec level has exactly one manipulable action and exactly one counterfactual.** This is enforced in Zod `.refine()`, not in prose.
9. **No personal data in any outbound request unless the owner opted in.** An API that asks for a contact address gets `PAPERPLAY_CONTACT_EMAIL` from `apps/api/.env`, which the owner sets and which is unset by default; unset, no request carries an address, and nothing else personal is ever sent. Every source fetch goes through `outboundFetch` (`apps/api/src/contact.ts`); a test holds it (ADR-0039).
10. **Live jobs and gates never share the machine.** `npm run land` and `npm run check:gate` refuse while `npm run pipeline:live` runs, and `pipeline:live` refuses while a gate runs (locks in the git directory, ADR-0039). Don't loosen the first-frame timeouts to get a gate through.

## Branches (ADR-0009)
- `main` is the line of record: every commit it points to passed `check:gate` locally and CI on that same commit, and gate tags are cut on it.
- Work in short branches, one coherent change each, named `<gate>/<topic>` (for example `g2/axe-scan`). A session's branches stack, each on the one before, the first off the latest `main`, and land together once at the end (ADR-0051).
- **`main` moves only through `npm run land`**, run on the stack's tip. It refuses a dirty tree, runs `check:gate` on the tip in the land checkout (the sibling folder `<repository>-land`, which keeps its dependencies) and reads its exit status directly, pushes the tip, waits for CI with `gh run watch`, and only on green fast-forwards `main`, pushes it and deletes every branch of the stack. While the gate and CI run, keep working on the next branch; never run a local browser test while the gate runs. Rebase onto `main` first if it has moved. Never `git merge` into `main` or push `main` by hand; the pre-push hook refuses it (ADR-0009's amendment).
- Worktrees are temporary: remove each when its branch lands (`git worktree remove`, then `git worktree prune`); `status.md` lists any that exist, with why. The land checkout is the one kept.
- A branch whose result the owner must see first, such as a design spike, stays unmerged until the owner says so. Land refuses any branch not named `<gate>/<topic>`.
- `origin` is the private `ritwiz06/PaperPlay`. CI runs `check:gate` on every push and pull request (ADR-0011). Never force-push `main`, move a tag or push with `--no-verify`.

## Working style
- Smallest reviewable slice per change; one coherent change per branch.
- Before implementing, restate the acceptance condition in plain language.
- After implementing: run the relevant checks, show exact output, and update the docs as the session protocol says.
- Never claim a gate passed without running `npm run check:gate` and pasting the result.
- Prefer deleting scope over weakening a check.
- Ask before adding a dependency, a new agent role, or a new world. Record the decision as an ADR.
- Live model runs (regenerations, bake-offs) never happen inside a build session unless the owner asks in that session's prompt; `npm run pipeline:live -- <command> --background` leaves its results and recordings for the next session to review (ADR-0051).
- The atlas runs only when the owner asks, and by default only for the worlds whose code or spec changed (ADR-0050, ADR-0051).

## Design floor (details in the build brief)
Accepted palette: cream `#f8faee`, ink `#172b2b`, dark `#132b2b`, aqua `#62cbc2`, lime `#d4f581`, line `#d2ddd3`, sub `#526a66`. Game-first layout (ADR-0008): the stage fills the screen at all times, with no permanent side columns; a level card (title, goal, the one control, "What if"), the guide and a compact level map sit over it; the paper journal slides over on demand, and every control's "From the paper" tap opens it at its passage. Origin chips name their origin in words; the legend lives in the journal. Sentence case everywhere. No all-caps eyebrow labels, no numbered `01/02/03` markers unless content is a sequence, no identical card grids, no arrows appended to buttons, no fade-up-on-scroll on every section. Respect `prefers-reduced-motion`. Keyboard focus visible.

## Out of scope for month one
Universal paper coverage, arbitrary generated code execution outside the widget sandbox, reproduction of original experiments, billing/teams, multiple providers, photorealism/VR/multiplayer, Next.js/Trigger.dev/Neon productization (planned after G5; packages are framework-agnostic so they port).
