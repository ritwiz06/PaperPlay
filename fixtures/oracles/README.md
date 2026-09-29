# Oracle fixtures

Expected behaviours of scientific primitives, written down independently of their code.
A primitive's tests load every fixture here and fail if any is malformed, missing or
wrong.

## Rules for authoring one

- Derive it from the primitive's written equations (for `flock.planar.weighted`, see
  `packages/primitives/src/flock/MODEL.md`). Never copy a number from running the
  implementation. A calculator is fine; a result printed by `step` is not.
- Put the derivation in the fixture, step by step, citing the equations it uses, so
  anyone can check it with pencil and paper.
- Fix every threshold before the first run. If a fixture fails, find out why; never
  loosen the threshold to make it pass.
- Label anything the equations cannot settle `"basis": "expected-qualitative"` and say
  why in the derivation. Everything else is `"basis": "derived"`.
- Give every parameter explicitly, rather than relying on the implementation's defaults.

## Kinds

| Kind | What it pins down |
|---|---|
| `one-step` | Exact next state of a small hand-built flock |
| `measure` | Exact observables of a hand-built state |
| `conserved-velocity-sum` | A conservation law holding over many steps |
| `frozen-observable` | An observable that must not change at all, bit for bit |
| `threshold` | A derived or expected bound on an observable, over several seeds |
| `metamorphic` | A symmetry of the equations (reflection, permutation, translation) |
| `replay` | Identical seed and events give identical observables, bit for bit |
| `known-answers` | Reference outputs of a generator (`prng.mulberry32.json`) |
