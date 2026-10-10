# ADR-0025: Primitive families and the primitive interface

- Status: accepted. The owner asked for the audit to be carried out (ADR-0024); the details are
  mine, for the owner to confirm.
- Date: 2026-10-10
- Decided by: the owner set the slice, G3a.1's first step; I chose the shapes.

## Context

`docs/design/every-paper.md` §1 found the primitive layer assuming flocking in five ways:
- the flock's exports sat at the package root, so every caller imported one model by name;
- its queries Q1–Q4 were bare functions the app imported, with no surface a kit could ask;
- `fixedTimestep` meant seconds per step, played at 1x;
- nothing described a primitive's space or the things a learner can place in it, so the builder
  guessed bounds from variables named `worldWidth` and `worldHeight`;
- every variable was a number.

G3a.1 must change none of the flocking world's behaviour: every existing test passes with only
its imports and paths changed.

## Decision

1. **The families' catalogue is data in contracts** (`packages/contracts/src/families.ts`):
   - `FamilyId`: agents, compartments, learning, study-design, grids, networks;
   - each family's name, its label where it has one (the learning toys' "miniature: the idea at
     toy scale", a study design's "a model of how the study was designed, not its data"), and
     how the level rule varies its runs (`Variation`: seeds, neighbourhood, cohorts);
   - `SpaceKind` (`torus2d` or `none` so far) and `TimeUnit` (second to year).

   The builder may import only contracts and primitives, so data both it and the shell read
   lives in contracts.
2. **The `Primitive` interface gains five descriptions,** none of which changes a run:
   - `family`;
   - `time`: its unit, and `perWatchSecond`, how much model time a second of watching shows at
     1x. `fixedTimestep` is now model time per step, in that unit;
   - `space`: a torus sized by two named start-up variables, or none;
   - `entities`, by kind, when a learner can place things;
   - `queries`: read-only questions by name, which a kit asks and never a version changes.
3. **The flock is the agents family's first primitive,** in `src/agents/flock/`, with its own
   entry point, `@paperplay/primitives/flock`. The package root exports only what is general.
   - It declares the agents family, seconds watched at 1:1, a torus of `worldWidth` by
     `worldHeight`, beacons and obstacles, and its queries Q1–Q4 by name.
   - Its version stays 3.1.0: no equation, state, default or range changed, and the records made
     before the refactor replay against it bit for bit.
4. **The torus is a shared space,** `src/spaces/torus.ts`, for any family on a wrap-around plane.
5. **A family's types cross the stage core's and React's lint boundary** through its entry point,
   as types only, like the package root's.
6. **Primitives may not use `eval` or `new Function`** (lint). A model given as data, the
   compartment family's, is interpreted by closures.

**Deferred, with reasons:**
- **Entity kinds stay a closed list,** beacon and obstacle, in `runrecord/3` and in placements.
  Two existing tests pin it: `run-record.test.ts` ("places only beacons and obstacles") and
  `worldspec.test.ts` (a placement of "an unknown kind" is refused). Widening it would change
  what those tests mean, which G3a.1 may not do. It widens, as `runrecord/4`, when a family first
  places something else; the compartment family places nothing.
- **Positions stay `x, y`.** Both spaces so far are planes, so `x, y` already is a position in
  the declared space.
- **Choice variables** (an optimizer, a trial arm) wait for the learning family (G3b), the first
  to need one. Added now, nothing could test them end to end.

## Consequences

- **About 50 files changed their imports, and only their imports,** to `@paperplay/primitives/flock`.
- **A new family needs no change to the interface:** it declares its family, time and space.
- **The builder can size placements from `space`** instead of variable names; it does so with
  `worldspec/3`.
