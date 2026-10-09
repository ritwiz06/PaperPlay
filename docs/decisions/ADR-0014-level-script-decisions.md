# ADR-0014: The flocking world's level script, as decided

- Status: accepted
- Date: 2026-10-09
- Decided by: the owner, answering the level script's questions on 2026-10-09. The group
  measure has its own ADR, ADR-0015.

## Context

`docs/design/flocking-levels.md` drafted six levels for the flocking world and left five
questions open:
- the source;
- level 6, which teaches beyond the paper;
- the readouts;
- placements a level needs at its start;
- forks that change start-up variables.

WorldSpec, the builder and the authored fixture all depend on the answers.

## Decision

1. **The source is Reynolds 1987,** "Flocks, Herds, and Schools: A Distributed Behavioral
   Model" (SIGGRAPH '87).
   - The owner's PDF lives in `reference/private/` and is never committed (ADR-0006).
   - Journal passages stay short and always attributed.
   - The source register records the copy's access and licence.
2. **Level 6 is a bonus level, and a teaching choice.**
   - It is marked as a bonus in the level map and the journal.
   - Nothing in it is labelled paper-derived from Reynolds. Even its control's chip there is
     a teaching choice.
   - Vicsek et al. 1995 gets its own source-register entry, as further reading.
3. **One readout per level:**
   - the heading compass for the levels about agreement;
   - the spacing gauge, the mean nearest-neighbour distance, for the separation level;
   - for the cohesion level, a groups counter by ADR-0015's measure. That is my reading,
     for the owner to confirm.

   The agreement chart lives inside the fork, as the measured difference over time. It never
   sits on the level card.
4. **A level may have a `setup`:** placements applied at step 0 as ordinary place events.
   - Each placement carries its origin label.
   - They are recorded like any learner's, so replay keeps working.
   - What-ifs stay parameter overrides only.
5. **Restarting forks are derived, never authored.**
   - The builder reads the primitive's parameter schema. If a counterfactual overrides a
     start-up (init-phase) variable, both worlds restart from the same seed, and the fork
     shows "Both worlds restart".
   - No level states it, so it cannot be stated wrongly.

The level script was updated to these before any code.

## Consequences

- **WorldSpec gains `setup`** on Level, and its refinements check it:
  - placements must be inside the world;
  - placements carry their origins;
  - counterfactuals override parameters only.
- **The builder needs each parameter's phase.** The primitive's `describe()` already gives
  it.
- **Level 6 needs no Reynolds passage.** A test can hold that none of its statements claims
  one.
