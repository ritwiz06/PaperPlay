# ADR-0027: worldspec/3, and worldspec/2 still read

- Status: accepted. The owner asked for `worldspec/3` with a routing tier, a scene kit, a time
  unit and a "What this world cannot show" page (G3a.1); the shapes are mine, for the owner to
  confirm.
- Date: 2026-10-10
- Decided by: the owner set the fields; I chose the shapes, and how version 2 is still read.

## Context

`worldspec/2` assumed one family: a closed list of scenes, time in seconds with an 80 s cap,
the app's own opening seed, and a prediction a level could skip. G3a.2's Kermack and McKendrick
world counts days and is drawn in a town. The plan (`docs/design/every-paper.md` §2.5) listed
what version 3 needs.

Two constraints shaped it:
- **Every existing test passes with only its imports and paths changed.** About 60 contract tests
  build `worldspec/2` examples, and the builder's tests edit the flocking fixture.
- **The records made before G3a** name the version 2 spec by its hash.

## Decision

1. **`worldspec/3` adds, beside version 2:**
   - **`routing`:** tier A (a released family primitive covers the mechanism) or B (a new one,
     not yet merged, with its pull request), the family, and why. A tier A world needs a
     released primitive, tier B an unmerged one, and a world on an unmerged primitive is never
     reviewed. Tier C is an explainer, which is not a WorldSpec (G3b).
   - **`design.world` names a scene kit by id,** checked by the builder against `SCENE_KITS`, the
     kits' manifests as data in contracts: the shell has the kit, and it draws the primitive's
     family and space. The field keeps its name: it always said what the world looks like, and
     the builder's own test of a kit it cannot draw stays as it was.
   - **`timeUnit`,** which must be the primitive's. A level's time and its summary's are `time`,
     not `seconds`, in that unit. The builder checks the level rule's bound on watching: at most
     20 s at 4x, given the primitive's `perWatchSecond`.
   - **`openingSeed`,** every level's: the flocking world's is 5, the seed ADR-0003's rule chose,
     and a test holds it to `HOOK_SEED`.
   - **`limits`,** at least one statement of what the world cannot show, each with its origin and
     anchors, for its journal page (G3a.2).
   - **A prediction before every What-if,** required of every level (ADR-0023 left it optional).
2. **`worldspec/2` is still read, and frozen.** `WorldSpec` is now the reader: either version, each
   by its own schema, so a version 2 document is checked exactly as before. `upgradeWorldSpec`
   carries version 2 across: tier A in the agents family, seconds, its limitations as teaching
   choices, opening on seed 0. It refuses a level with no prediction. The builder builds only
   version 3, upgrading a version 2 spec first; a test builds the flocking world from both and
   gets the same levels.
3. **The current version's schemas carry a suffix,** `WorldSpecV3`, `LevelV3`,
   `MeasuredDifferenceV3`, because the version 2 names (`Level`, `MeasuredDifference`) are what the
   unchanged tests build. `summarise` reads either version's summary.
4. **Whole-spec rules are one function,** `checkWorld`, which both versions call. Version 3's
   level rules are its own copy, since version 2 no longer changes.
5. **The builder sizes placements from the primitive's `space`,** not from variables named
   `worldWidth` and `worldHeight`, and refuses an entity kind the primitive does not declare.
6. **The flocking fixture is now `worldspec/3`,** migrated with every other byte kept.

**Deferred:** the compartment family's binding (a ModelSpec with the solver) arrives in G3a.2,
still as `worldspec/3`, which no one outside this repository has written. Version 3 freezes when
G3a.2 lands.

## Consequences

- **One test change goes beyond imports.** The level's time is now `time`, in the world's unit,
  so four lines that read `level.fork.difference.seconds` read `level.fork.difference.time`:
  `apps/web/test/fork.test.ts` (two), `tests/e2e/predictions.spec.ts` and
  `tests/e2e/rocks.spec.ts`. No assertion changed: each still takes the level's time and divides
  it by the step.
- **The levels sweep's record is unchanged, byte for byte.**
- **A world in days needs no special case:** its time, its chart and its readings follow its
  unit.
