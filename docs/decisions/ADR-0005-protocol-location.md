# ADR-0005: The evaluation protocol lives at eval/protocol.md

- Status: accepted
- Date: 2026-10-01
- Decided by: the project owner, on 2026-10-01

## Context

The documents disagreed about where the frozen evaluation protocol lives:
- The build brief puts it at `eval/protocol.md`, in its repository layout and in G4's first
  step.
- CLAUDE.md's repository shape listed `docs/research/protocol.md`.
- `eval/README.md` left the question open.

## Decision

- The protocol is `eval/protocol.md`. It sits next to the held-out sections, the baseline,
  the raw attempts and the analysis that it governs.
- Other documents link to it and never hold a copy.
- CLAUDE.md and `eval/README.md` now say so.

The file does not exist yet. It is written and frozen at G4, before any evaluated run.

## Consequences

- Every document names one path for the protocol: CLAUDE.md, the brief, `eval/README.md`
  and the roadmap's G4 checklist.
- `docs/research/` is not created.
