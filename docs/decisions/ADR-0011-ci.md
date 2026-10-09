# ADR-0011: check:gate in CI, on Linux

- Status: accepted
- Date: 2026-10-09
- Decided by: the owner, on 2026-10-09:
  - a GitHub Actions workflow running `check:gate` on ubuntu-latest, with Node 24.21.0, on
    every push and pull request;
  - if a determinism, oracle or capture result differs from the Mac, the test is not
    loosened. Instead the difference is recorded as a finding, `architecture.md` marks which
    claims hold per runtime, and the owner is told.

  The workflow's shape is this ADR's.

## Context

Until now every piece of evidence came from one Mac. Several claims could hold there
without holding everywhere:
- the bitwise determinism and replay tests (R01);
- the hand-derived oracles;
- the hook-seed rule;
- the demo capture's byte-identical videos (ADR-0010).

Three things could make Linux differ:
- V8's floating-point library on another CPU architecture;
- SwiftShader's code generation on x86-64 rather than arm64;
- libvpx.

The repository now lives at `ritwiz06/PaperPlay` (private), so a runner can check it.

## Decision

1. **`.github/workflows/check-gate.yml`** runs the gate job on every push (branches and tags)
   and every pull request:
   - `npm ci`;
   - Playwright's Chromium, with its system dependencies;
   - `npm run check:gate`, which does exactly what it does locally;
   - the reports, kept for 14 days, pass or fail.
2. **Node comes from `.node-version`,** so the gate's own runtime check holds in CI as it does
   locally.
3. **A full clone.** `check:docs` looks up the commits that `status.md` and `progress.md`
   name. A shallow clone would fail it, and so would a commit that exists only on one
   machine. The first CI run caught exactly that: the spike's commit was reachable only
   through a local tag, so the tag was pushed.
4. **A second job films the demo capture on Linux,** on `main` and on demand. It uploads
   the videos and the manifest, so their hashes can be compared with the Mac's. It is not
   part of the gate: a capture is a deliverable, not a requirement's evidence.
5. **Pushes become routine.** CI runs only on what is pushed, so a branch is pushed to run CI
   on it, and `main` is pushed after each merge. `main` is never force-pushed, and no tag
   ever moves (ADR-0009 is amended to match).

## Consequences

- Every claim in `architecture.md`'s invariants table is now checked on two runtimes:
  - macOS on arm64, locally;
  - Linux on x86-64, in CI.

  Where a result differs, the table says which runtime it holds on.
- A gate run in CI takes about 3 minutes plus setup. The e2e suite is slower on the runner
  than on the Mac (77 s against 13 s).
- CI minutes count against the private repository's allowance. The capture job runs only on
  `main` and on demand for that reason.
