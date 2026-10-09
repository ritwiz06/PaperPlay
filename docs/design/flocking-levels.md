# The flocking world: the level script

Status: **reviewed by the owner** on 2026-10-09, and updated to the owner's decisions
(ADR-0014). It becomes `fixtures/worldspecs/flocking-reference.json`. Nothing here is quoted
from a paper. Each level names the passage it needs, anchored in
`fixtures/papers/flocking/source-map.json`. Journal passages stay short and always
attributed.

## What this script assumes

- **The source:** Reynolds 1987, "Flocks, Herds, and Schools: A Distributed Behavioral
  Model" (SIGGRAPH '87), confirmed by the owner. Its access and licence are in the source
  register (`docs/papers/source-register.md`).
- **Levels 1 to 5 follow the paper. Level 6 is a bonus level beyond it.**
  - It is a teaching choice, and nothing in it is labelled paper-derived from Reynolds.
  - Vicsek et al. 1995 is listed separately in the source register, as further reading.
- **The primitive:** `flock.planar.weighted@3.0.0`, a two-dimensional teaching adaptation.
  - **Every What if is parameter overrides on it,** as the brief's `Counterfactual` requires
    (`altParams`): no new science.
  - **Its rules are summed with weights and capped.** The paper ranks its behaviours by
    precedence instead. Levels say so where it matters, as a teaching choice.
  - **Its controls are its live variables.** Each level's range is a teaching choice inside
    the primitive's own range (`MODEL.md`).
- **Every level has:**
  - one control and one What if, so one fork;
  - three depth variants;
  - a guide that never scores.
- **The level opens** once the one before has been touched through its range, never because
  something was achieved.
- **The group measure** is the owner's (ADR-0015):
  - two birds are linked when they are within the link radius and their headings differ by
    less than 45°;
  - clusters of fewer than 4 birds are strays, not groups.

  It passed its sweep under the reading O1, one group holding at least half the birds
  (`eval/sweeps/group-measure.md`).
- **One readout per level** (owner):
  - the heading compass for the levels about agreement (1, 2, 5 and 6);
  - the spacing gauge for the separation level (3);
  - a groups counter for the cohesion level (4). That is my reading: the owner named the
    compass and the gauge, and the group measure is level 4's observable.

  The agreement chart appears inside the fork, as its measured difference over time, never
  on the level card.
- **Setup:**
  - A level may hold setup placements, such as level 5's rock. They are applied at step 0 as
    ordinary place events, each with its origin, so replay keeps working.
  - A What if stays parameter overrides only.
- **Checked against the model.** Before the fixture was written, every What if was run on the
  hook seed (5), and levels 1, 2 and 4 on seeds 1–20 as well. Where an expected effect did not
  hold, the fixture says what the model does instead, and a "Measured" line below gives the
  numbers. Levels 2 and 4 need the owner's decision.
- **Restarts:** a What if that overrides a start-up (init-phase) variable makes both worlds
  restart from the same seed. The builder works that out from the primitive's parameter
  schema, so no level states it, and the fork then says "Both worlds restart".

The guide's lines follow the hook's pattern. The first line is "you did X, so Y", a teaching
choice. The second is what was measured, a computed observation. At Beginner there are words
only. At Intermediate, a rounded number. At Advanced, the measure named, with two decimals.
Below, ↑ means after raising the control and ↓ after lowering it.

## Level 1 · Hook · A flock with no leader

- **Afterwards, the learner understands that** a flock can turn as one without a leader. Each
  bird matches the heading of the few birds near it, and agreement spreads bird to bird.
- **The control:** `alignmentWeight`, called "Move together".
  - Range 0 to 4 per second (the primitive's own), starting at 2.
  - Beginner end words: "Ignore neighbours" and "Follow closely".
- **What they watch:**
  - **On screen:** the birds' colours, by heading. They converge as the flock agrees, and
    scatter when it doesn't.
  - **On the compass:** the ticks gather into a fan, and the arrow grows toward the rim.
- **The guide:**

  | Depth | ↑ | ↓ |
  |---|---|---|
  | Beginner | "You raised Move together, so birds turn harder toward their neighbours' heading." / "Most birds head the same way, and more are joining in." | "You lowered Move together, so birds care less which way their neighbours fly." / "Headings are only partly shared, and they are drifting apart." |
  | Intermediate | "…to 3.50, so…" / "Agreement 0.8 and rising: most birds head the same way." | "…to 0.50, so…" / "Agreement 0.3 and falling: headings are only partly shared." |
  | Advanced | as Intermediate / "Directional agreement 0.83 and rising: …" | as Intermediate / "Directional agreement 0.31 and falling: …" |
- **What if birds ignored their neighbours' headings?**
  - The right world runs with Move together at 0, from the same seed and the same events.
  - **The effect to show:** the left flock turns one colour, and the right one stays a
    confetti of colours.
  - **The one measured difference:** directional agreement after 10 s, for example 0.9
    against 0.2. The fixture records the real values.
  - **Measured (2026-10-09):** at 10 s the flock has not ordered yet. On seed 5, agreement is
    0.21 against 0.12. At 20 s it is 0.93 against 0.08, and the gap exceeds 0.5 on 19 of
    seeds 1–20. **The difference is measured at 20 s,** and the fixture's effect says "within
    20 seconds".
- **The passage it needs:** the paper's description of velocity matching, a bird matching the
  velocity of the flockmates near it.

## Level 2 · Background · Each bird sees only a little

- **Afterwards, the learner understands that** no bird sees the whole flock. Each reacts to
  birds within a short distance, so order has to travel through the flock, and a bird that
  sees too few neighbours drifts off on its own.
- **The control:** `perceptionRadius`, called "How far a bird sees".
  - Range 1 to 16 world units, a teaching choice inside the primitive's 0.5 to 50: up to half
    the field. Starting at 9.
  - Beginner end words: "Only its nearest" and "Half the valley".
- **What they watch:**
  - **On screen:** picking a bird shows its reach ring, with the birds it sees in full
    colour. At a small radius, patches of colour form and each patch flies its own way.
  - **On the compass:** several separate fans and a short arrow, becoming one fan as the
    radius grows.
- **The guide:**

  | Depth | ↑ | ↓ |
  |---|---|---|
  | Beginner | "You let each bird see further, so news of a turn reaches more birds at once." / "The patches are merging into one flock." | "You made each bird short-sighted, so it only hears from its nearest neighbours." / "The flock is breaking into patches, each with its own heading." |
  | Intermediate | "…to 14 world units, so…" / "Agreement 0.9 and rising: …" | "…to 2 world units, so…" / "Agreement 0.4 and falling: …" |
  | Advanced | "…R = 14: alignment and cohesion now average over every bird within 14 units." / "Directional agreement 0.91 and rising: …" | "…R = 2: …" / "Directional agreement 0.38 and falling: …" |
- **What if every bird could see the whole flock?**
  - The right world runs with "How far a bird sees" at 50, past the field's size.
  - **The effect to show:** the right flock snaps to one heading almost at once, more like a
    marching band than a murmuration. The left one ripples into order.
  - **The one measured difference:** seconds until directional agreement first reaches 0.9.
  - **Measured (2026-10-09): the expected effect does not hold.**
    - On seed 5, seeing the whole flock reaches 0.9 later: 19.5 s, against 17.7 s.
    - Over seeds 1–20 it is sooner on only 7. With every bird seeing every other, a bird
      matches the whole flock's mean velocity, which starts near zero.
    - The fixture says so: seeing everyone does not bring order sooner in this model.
    - **For the owner:**
      - keep this What if, with the surprise as the lesson;
      - or ask the opposite, "What if each bird saw only its nearest?" (radius 2). That
        gives 0.93 against 0.74 at 20 s on seed 5, and a gap over 0.5 on only 9 of 20
        seeds.
- **The passage it needs:** the paper's argument that a flock member perceives only nearby
  flockmates, and why that locality matters.

## Level 3 · Idea · Three urges, and the first: keep your distance

- **Afterwards, the learner understands that** a bird follows three simple urges: keep your
  distance, match your neighbours, stay with the flock. The first stops collisions and sets
  the flock's spacing. (Level 1 was the second urge; level 4 is the third.)
- **The control:** `separationWeight`, called "Personal space".
  - Range 0 to 2 per second (the primitive's own), starting at 1.05.
  - Beginner end words: "Crowd in" and "Keep well apart".
- **What they watch:**
  - **On screen:** at 0 the birds pile into tight clumps, their wings overlapping. Raised,
    they spread into an even lattice.
  - **On the readout:** the spacing gauge, the mean nearest-neighbour distance, proposed as
    this level's readout. The compass stays visible but is not the focus.
- **The guide:**

  | Depth | ↑ | ↓ |
  |---|---|---|
  | Beginner | "You gave each bird more personal space, so it swerves sooner from a bird that comes too close." / "The flock is spreading out evenly." | "You shrank each bird's personal space, so birds let others crowd in." / "Birds are bunching into tight clumps." |
  | Intermediate | "…to 1.80, so…" / "Spacing 1.6 world units and widening." | "…to 0.10, so…" / "Spacing 0.4 world units and shrinking." |
  | Advanced | "…w_s = 1.80: the push from neighbours closer than R_s = 1.55 is stronger." / "Mean nearest-neighbour distance 1.62 and widening." | "…w_s = 0.10: …" / "Mean nearest-neighbour distance 0.41 and shrinking." |
- **What if birds never kept their distance?**
  - The right world runs with "Personal space" at 0.
  - **The effect to show:** the right flock collapses into a few dense knots. The left one
    stays evenly spaced.
  - **The one measured difference:** mean nearest-neighbour distance after 10 s.
  - **Measured (2026-10-09):** on seed 5, 1.85 against 1.17 world units at 10 s. The flock
    bunches tighter, but "a few dense knots" was not checked. The fixture says the birds end
    up much closer together.
- **The passage it needs:** the paper's statement of its three behaviours, and its
  description of collision avoidance.

## Level 4 · Method · Stay with the flock

- **Afterwards, the learner understands that** the third urge, steering toward the middle of
  the birds you see, is what keeps a flock from drifting apart into separate flocks.
- **The control:** `cohesionWeight`, called "Stay close".
  - Range 0 to 2 per second (the primitive's own), starting at 0.4.
  - Beginner end words: "Drift apart" and "Huddle together".
- **What they watch:**
  - **On screen:** at 0, the flock frays into separate flocks that fly apart. Raised, the
    stragglers turn back in.
  - **On the readout:** the groups counter, by the owner's measure (ADR-0015). Strays, in
    clusters of fewer than 4, are not counted.
- **The guide:**

  | Depth | ↑ | ↓ |
  |---|---|---|
  | Beginner | "You strengthened the pull toward the middle, so stragglers turn back in." / "The flock is holding together." | "You weakened the pull toward the middle, so birds stop turning back." / "The flock is coming apart." |
  | Intermediate | "…to 1.20, so…" / "1 group, flying as one." | "…to 0.00, so…" / "4 groups and rising." |
  | Advanced | "…w_c = 1.20: each bird steers toward the centre of the birds within R." / "Groups (linked within L_c, headings within 45°, 4 birds or more): 1." | as Intermediate, with the measure named |
- **What if birds had no urge to stay together?**
  - The right world runs with "Stay close" at 0.
  - **The effect to show:** after 20 s the right world holds several small flocks, and the
    left one flock.
  - **The one measured difference:** the number of groups after 20 s, by the owner's
    measure.
  - **Measured (2026-10-09): the expected effect does not hold.**
    - On seed 5 both worlds are one group at 20 s and at 40 s.
    - Over seeds 1–20, removing cohesion gives more groups at 20 s on only 2 seeds.
    - A smaller sight radius in this level does not help either. At radius 3 to 6, it gives
      more groups on 0 to 4 seeds of 20, and at radius 3 to 5 cohesion often gives more
      groups, not fewer.
    - In this model, at this density, alignment holds the flock together.
    - The fixture says so. **For the owner:** the lesson of this level, and with it the groups
      counter as its readout.
- **The passage it needs:** the paper's description of flock centering.

## Level 5 · Evaluation · Does it behave like a flock?

- **Afterwards, the learner understands how a model like this is judged.** The paper judged
  its flock by how it behaves, and one test is a rock in the way. A real flock parts around
  it and closes up again, and the rules alone produce that, with no rule written for it.
- **The control:** `obstacleRadius`, called "How early birds swerve".
  - Range 1 to 6 world units, a teaching choice inside the primitive's 0.1 to 10. Starting
    at 3.4.
  - Beginner end words: "At the last moment" and "From far away".
  - The level's `setup` places one rock in the flock's path. It is a teaching choice, applied
    as a place event at step 0.
- **What they watch:**
  - **On screen:** the flock reaching the rock, parting round it and rejoining. At a small
    radius, birds clip the rock and scatter. At a large one, the flock parts wide and
    smoothly.
  - **On the compass:** a brief split into two fans as it parts, then one fan again.
- **The guide:**

  | Depth | ↑ | ↓ |
  |---|---|---|
  | Beginner | "You made birds swerve from further away, so the flock parts smoothly round the rock." / "Headings split for a moment, then agree again." | "You made birds swerve late, so they nearly hit the rock and scatter." / "Headings are scattered after the rock." |
  | Intermediate | "…to 5.0, so…" / "Agreement dipped to 0.6 and is back to 0.9." | "…to 1.0, so…" / "Agreement 0.4 and slow to recover." |
  | Advanced | "…R_o = 5.0: the push starts 5 units from the rock and grows linearly toward it (E7)." / "Directional agreement: low 0.62, now 0.91." | as Intermediate, named |
- **What if the rock pushed as hard as the model allows?**
  - The right world runs with `obstacleWeight` at 20, the primitive's maximum (left: 3).
    That is a parameter override, as a counterfactual must be.
  - **The effect to show:** the right flock bursts apart at the rock and takes far longer to
    agree again.
  - **The one measured difference:** the lowest directional agreement while passing the
    rock.
  - **Measured (2026-10-09):** the rock is placed at (15, 8.5), ahead of seed 5's flock.
    After 18 s, the lowest agreement is 0.29 with the strongest push, against 0.86 with the
    default. Both agree again (0.97 and 0.98) by 30 s, so "far longer" is not claimed.
- **The passage it needs:** the paper's discussion of avoiding environmental obstacles, and
  its observation that flocks split around obstacles and re-form.
- **A teaching choice to state on screen:** the primitive's rocks push like a force field,
  and do not steer birds away. The paper discusses that difference, and the level's
  Advanced text names it.

## Level 6 · Result (bonus) · Order from the bottom up

A bonus level, beyond the paper. Every statement in it is a teaching choice or a computed
observation, and none is labelled paper-derived from Reynolds.

- **Afterwards, the learner understands the result:** global order from local rules. Below a
  certain strength of following, the flock stays disordered. Above it, order appears fairly
  suddenly. That jump, and not the gradual change, is what makes it emergent.
- **The control:** `alignmentWeight`, "Move together", again.
  - Range 0 to 4 per second, the same as level 1.
  - Here its chip says teaching choice, not paper-derived.
  - Beginner end words: "Ignore neighbours" and "Follow closely".
- **What they watch:**
  - **On screen:** the flock at each setting.
  - **On the compass:** the arrow's length at each setting. Just below some strength it
    stays short; just above, it grows long.
- **The guide:**

  | Depth | ↑ | ↓ |
  |---|---|---|
  | Beginner | "You raised Move together, so each bird follows its neighbours harder." / "Order is spreading through the flock." | "You lowered Move together, so each bird follows its neighbours less." / "The order is breaking up." |
  | Intermediate | "…to 1.50, so…" / "Agreement 0.8 and rising." | "…to 0.80, so…" / "Agreement 0.3 and falling." |
  | Advanced | "…w_a = 1.50: …" / "Directional agreement 0.81 and rising. A steep rise over a small change of w_a marks a transition from disorder to order." | as Intermediate, named |
- **What if the flock were a quarter as dense?**
  - The right world runs with `worldWidth` and `worldHeight` at 64, double each side, with
    the same 72 birds.
  - Those are start-up variables, so the builder makes both worlds restart from the same
    seed, and the fork says "Both worlds restart".
  - **The effect to show:** the sparser flock needs a stronger Move together before order
    appears.
  - **The one measured difference:** directional agreement over time in both worlds, as the
    fork's chart.
  - **Measured (2026-10-09):**
    - On seed 5 at Move together 2, the sparser world's agreement is 0.09 at 20 s, 0.57 at
      40 s and 0.73 at 60 s. It is disordered at 20 s for every strength tried.
    - In the default world, agreement at 20 s rises from 0.17 at 0.8 to 0.74 at 1 and 0.94
      at 1.5. Below that it is noisy, so "fairly suddenly" became "over a fairly small range".
- **What it needs:**
  - No passage from Reynolds.
  - The journal page is labelled a bonus page, and cites Vicsek et al. 1995 as further
    reading, as a teaching choice, with no quote.

## Settled by the owner (2026-10-09)

The questions this script raised were answered, and are recorded in ADR-0014 and ADR-0015:
- the source;
- level 6 as a bonus level;
- the group measure;
- the readouts;
- setup placements;
- derived restarts.

Still open, for the owner:
- whether level 4's groups counter is the readout the owner wants (my reading);
- levels 2 and 4, whose expected effects did not hold when measured (above).
