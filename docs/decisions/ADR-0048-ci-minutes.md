# ADR-0048: CI's minutes: main's run skipped when its branch passed, the capture on demand

- Status: accepted. The owner's decision (2026-10-18): skip main's run when the identical commit
  already passed CI on its branch; run the capture job on demand or nightly, not on every main
  push. The form is mine.
- Date: 2026-10-18
- Decided by: the owner.

## Context

On 2026-10-18 GitHub refused to start the jobs of a run on `main`: "recent account payments have
failed or your spending limit needs to be increased". The repository is private, and GitHub Free
includes 2,000 Actions minutes a month for private repositories. From 1 to 18 October its jobs ran
about 2,082 minutes, rounded up per job as GitHub bills them, read from the Actions API (the billing
API itself needs a scope the machine's token lacks): `check:gate` 1,456 minutes over 101 runs, and
`capture:demo` 626 minutes over the 58 times it ran, on every push to `main`. Each land ran
`check:gate` twice in CI on one commit: once on its branch, which land waits for, and again when
`main` moved to it.

## Decision

1. **A push to `main` runs the gate only when needed:** a first job, `passed`, asks the Actions API
   whether a run of this workflow already succeeded on this exact commit on a branch other than
   `main`; the gate runs unless it did. Every other push, and every pull request, runs the gate as
   before. Should the question fail, the gate runs.
2. **The capture job runs on demand only,** from the Actions tab (`workflow_dispatch`). Nightly runs
   would spend about 360 minutes a month whether or not anything changed.
3. A test holds the workflow to both (`scripts/test/ci-workflow.test.ts`).

## Consequences

- A land spends one gate run in CI, not two, and no capture: about 20 minutes rather than 50.
- The canonical Linux capture is made when someone asks for it, as before a published video.
