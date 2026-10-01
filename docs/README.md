# Documentation

Start here. Each document has one job, and documents link to each other instead of
repeating each other. A fresh session reads `status.md`, the newest session log and
`architecture.md`, then only what its task touches; the session protocol lives in
[`../CLAUDE.md`](../CLAUDE.md).

## Index

| Document | Its job | Changes when |
|---|---|---|
| [project-brief.md](project-brief.md) | What PaperPlay is and promises | Rarely: only if the promise changes |
| [roadmap.md](roadmap.md) | The plan: a checklist per gate, effort, and a log of plan changes | A checklist item moves, or the plan changes |
| [status.md](status.md) | A snapshot of now: gate, branches, latest check:gate, blockers, decisions, next actions, recommendations | Rewritten every session |
| [requirements.md](requirements.md) | R01–R12 and the evidence each has | Evidence counts change |
| [architecture.md](architecture.md) | How the system fits together now, and what enforces each boundary | Packages, contracts or boundaries change |
| [concepts.md](concepts.md) | Every concept the code uses, explained for a learner | A new concept appears |
| [progress.md](progress.md) | Append-only ledger of finished slices, newest first | A slice finishes |
| [decisions/](decisions/) | One ADR per decision | Every decision |
| [sessions/](sessions/) | The detailed log of each working session | Every session |
| [BUILD_PROMPT.md](BUILD_PROMPT.md) | The owner's original build brief | Never; ADRs record what superseded it |
| [`../CLAUDE.md`](../CLAUDE.md) | Standing instructions, including the session protocol | The way of working changes |

Elsewhere: each primitive's equations sit next to its code (for example
`packages/primitives/src/flock/MODEL.md`), oracle fixture rules in
`fixtures/oracles/README.md`, and evaluation material in `eval/README.md`.

## How the docs are checked

`npm run check:docs` runs inside `check:gate` and fails when:
- a document above is missing, or lacks its required headings;
- an ADR lacks Context and Decision sections;
- the newest session log does not follow the template below;
- `status.md`'s date differs from the newest session log, or its working commit is not in
  git;
- `architecture.md` does not name every directory under `apps/` and `packages/`;
- a concept lacks its "Used in", "Why here" or "Learn more" line, or names a path that
  does not exist;
- `progress.md`'s newest entry names no commit, or a commit that is not in git.

The rules live in `scripts/docs/check.ts`.

## Session log template

One file per session: `docs/sessions/YYYY-MM-DD.md`, then `-2`, `-3` for further sessions
that day. Each has these second-level headings, in this order:

- **Goal:** what the session set out to do, and the acceptance conditions in plain language.
- **What I read:** the documents and code read at the start, and why.
- **What changed, by commit:** branch, commit, and what each commit changed.
- **Checks run, exact output:** commands and their real output, including failures.
- **Concepts introduced:** new entries added to `concepts.md`.
- **Decisions made and needed:** with links to ADRs, and what waits on the owner.
- **Problems and how they were solved:** what went wrong and what fixed it.
- **Next:** the precise next action.
