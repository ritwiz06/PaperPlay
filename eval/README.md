# Evaluation

The G4 evaluation lives here once that gate begins. Until then, the only content is the
parameter sweeps behind teaching-choice decisions.

- `sweeps/`: deterministic parameter sweeps, each written by a script and tied to an ADR.
  `flock-defaults.*` (from `npm run sweep:defaults`) records how ADR-0003 chose the flock's
  defaults. Rerunning a sweep on the same commit rewrites its files byte for byte.
- `protocol.md` is frozen before any evaluated run: tasks (the 8 held-out sections),
  baseline B1, metrics, budgets, exclusions and seeds. Whether it lives here or in
  `docs/research/` is still to be decided (see `docs/status.md`).
- Every raw attempt is saved, including failures and abstentions.
- Analysis reports case-level outcomes and never averages failures away. A clean
  negative result is a result.
