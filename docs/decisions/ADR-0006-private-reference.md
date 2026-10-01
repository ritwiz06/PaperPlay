# ADR-0006: Owner-only reference material lives in a git-ignored folder

- Status: accepted
- Date: 2026-10-01
- Decided by: the project owner, on 2026-10-01. The last point under Decision was added
  while carrying it out.

## Context

Since 2026-09-30, the owner's project handbook (`PaperPlay_30_Day_Project_Handbook (1).pdf`)
had sat untracked in the repository root, neither committed nor ignored. It is a personal
learning record. Sessions stage files by explicit path, but that is a habit, not a guard:
one broad `git add` would have committed the handbook.

## Decision

- **Location:** owner-only material lives in `reference/private/`, which `.gitignore`
  excludes. The handbook was moved there unchanged.
- **No dependence:** nothing in the repository depends on files in that folder, whether
  code, tests, docs or the gate. A fresh checkout has none of them.
- **Reading:** sessions read a file there only when the owner asks.

## Consequences

- `git status` no longer lists the handbook, and a broad `git add` cannot pick it up.
- The rest of `reference/`, including the accepted prototype, stays tracked.
- Anyone cloning the repository works without the handbook, by design.
