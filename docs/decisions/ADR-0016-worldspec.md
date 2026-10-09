# ADR-0016: WorldSpec, drafts and the builder

- Status: accepted
- Date: 2026-10-09
- Decided by: me, within the owner's decisions of 2026-10-09:
  - the level script's six decisions (ADR-0014);
  - "Do slice 1 later": continue with WorldSpec and the builder while the Reynolds PDF is
    missing, with placeholder anchors clearly marked, and the reference fixture waiting for
    real ones.

  The owner is asked to confirm it in the session's report.

## Context

The brief (§3) gives WorldSpec's shape. Building it for the game-first shell (ADR-0008) and
the owner's level decisions (ADR-0014) raised four questions:
- **No source in hand.** The source map needs the Reynolds PDF, which is not on disk. So no
  real anchor, page or digest exists yet, but the shell must still run on a spec.
- **The shell needs content** the brief's Level has no place for:
  - a goal;
  - the slider's step and end words;
  - the guide's lines;
  - a bonus flag;
  - setup placements.
- **The brief allows free element ids,** and LaTeX, which the shell cannot render.
- **Part of the brief's DesignSpec no longer applies:**
  - its per-section layouts were superseded by ADR-0008;
  - its typography choices by ADR-0002.

## Decision

1. **`status: "draft" | "reviewed"`.**
   - A draft may hold placeholder anchors, `{ placeholder: true, sourceId, need }`. A
     placeholder says which passage will stand there, and quotes nothing.
   - A draft may also hold a pending source: bibliographic data and what is still missing,
     with no digest and no sections.
   - A reviewed spec may hold neither.
   - Every anchor must point at the spec's own source, and a real anchor at one of its
     sections. A real anchor beside a pending source is refused, since nothing can check its
     section.
   - `fixtures/worldspecs/flocking-reference.json` is a draft until the source map exists.
2. **Additions to the brief's Level:**
   - `goal`;
   - `bonus`;
   - `slider` (step, and the two end words);
   - `setup` (ADR-0014);
   - `guide` (the guide's script);
   - `furtherReading`.

   And to WorldSpec, `title`.
3. **Origins are added where text is displayed.**
   - Each depth variant carries an origin and anchors, since each is a displayed statement.
   - The guide's first line is always a teaching choice, and its second a computed
     observation. Their text holds no origin field, so neither can be mislabelled.
   - An observable's origin is fixed as computed observation.
4. **Depth variants name the shell's elements from a closed list:**
   - `control-value` and `range-numbers`;
   - `range-words`;
   - `readout-number`;
   - `equation` and `analogy`.

   Every variant places every element in `show` or `hide`, exactly once, so a typo is
   refused rather than ignored.
5. **Equations are plain Unicode text** (`equation`), not LaTeX, because no renderer is
   installed and adding one is a dependency. An equation is given only at Advanced, and an
   analogy only at Beginner.
6. **DesignSpec drops `layout` and `typographyPairing`.**
   - The builder refuses any design choice the shell cannot draw yet, rather than drawing
     something else: today the valley, cream-teal, comfortable density, no motion, and a line
     chart.
7. **Exactly one manipulable and one counterfactual** are single objects, never lists. The
   strict schema refuses a second one under any other key. One action id may appear in
   several levels only if it moves the same variable, so a run's events mean the same thing
   everywhere.
8. **The builder lives in `packages/pipeline/src/builder/`,** and lint keeps it to contracts,
   primitives and its own modules. It takes unvalidated input, validates it, then checks
   what only the registry knows:
   - each variable exists;
   - a control moves a live variable, inside the primitive's range and in its unit;
   - the binding does not start the control somewhere else;
   - the observable is measured, in its unit;
   - a what-if's values are valid, and it changes something;
   - placements lie inside both worlds of the fork.

   It reports every problem with its path, and builds nothing if any remain.
9. **It derives what no spec states:**
   - each level's full parameters;
   - setup as place events at step 0;
   - the fork's parameters, and whether it restarts both worlds (any start-up override);
   - the elements shown at each depth.
10. **Binding fixtures are written by hand,** in `fixtures/bindings/`, from the level script
    and the parameter table. A test sets each level's control through the built world and
    compares the run with the primitive stepped directly at that value.
11. **Widget bindings are in the schema, and the builder refuses them** until the widget tier
    (G3).

## Consequences

- **The shell runs on a draft.** Every placeholder shows as one, and nothing is quoted. When
  the source map exists, the anchors are replaced and the status becomes "reviewed". The
  schema then forbids any placeholder left behind.
- **Before the fixture was written, each What-if was checked against seed 5.** Two of the
  level script's expected effects did not hold:
  - level 2's;
  - level 4's.

  The fixture states what the model does, and the owner is asked to choose (session log
  2026-10-09-4).
- **The ForkView (next session) reads `fork`:** its parameters, its overrides and `restarts`.
  The measured difference each level names is added then, with the real values recorded.
