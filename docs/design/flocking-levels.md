# The flocking world: the level script

Status: **reviewed by the owner** on 2026-10-09, updated to the owner's decisions (ADR-0014),
then to the level rule (ADR-0018) the same day. The fixture holds each level's exact words. It becomes `fixtures/worldspecs/flocking-reference.json`. Nothing here is quoted
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
- **The primitive:** `flock.planar.weighted@3.1.0`, a two-dimensional teaching adaptation.
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
  - for the cohesion level (4), the flock's spread: a ring on the ground around the flock
    and a dial on the card (ADR-0018). It replaces the groups counter.

  The chart of the measured difference over time appears inside the fork, never on the level
  card.
- **Setup:**
  - A level may hold setup placements, such as level 5's rocks. They are applied at step 0 as
    ordinary place events, each with its origin, so replay keeps working.
  - A What if stays parameter overrides only.
- **The level rule (owner, ADR-0018).**
  - A level's stated effect must hold in its stated direction on at least 16 of 20 skies
    (seeds 1–20), within the level's time (at most 80 s, 20 s of watching at 4x).
  - Each What if names its measured difference and its claim. `npm run sweep:levels` checks
    them and records `eval/sweeps/levels.md`, and a test re-runs it.
  - A level that fails is reworked or cut, never softened in wording. Level 2's surprise is a
    count stated exactly, after a prediction.
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
  - **The effect, as the level states it:** "Within 20 seconds this world's flock agrees on
    a heading far more than the other world's: its agreement is higher by more than half the
    scale."
  - **The measured difference:** directional agreement after 20 s. The claim is that the
    right world's is lower by more than 0.5. It holds on **19 of 20 skies**; seed 5 gives
    0.93 against 0.08.
  - The first draft measured at 10 s, when the flock has not ordered yet. The rule moved it to
    20 s.
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
- **What if every bird could see the whole flock?** Kept as a surprise, with a prediction
  first (owner).
  - The right world runs with "How far a bird sees" at 50, past the field's size.
  - **Before the fork opens, the guide asks:** "If every bird could see the whole flock, would
    the flock come to agree faster?", with two choices: "Faster" and "About the same, or
    slower". Neither is marked right.
  - **The measured difference:** the seconds until agreement first reaches 0.9, within
    40 s. The fork shows it for this sky.
  - **The surprise, a count stated exactly:** across 20 skies, seeing the whole flock is faster
    by more than a second on **6**, and about the same or slower on **14**.
    - Afterwards the guide reports those numbers as a computed observation.
    - It then connects them to the paper's local-perception idea. That anchor is a
      placeholder until the source map exists.
  - **Why:** with every bird seeing every other, each matches the whole flock's mean
    velocity, which starts near zero.
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
  - **The effect, as the level states it:** "Without personal space the other world's flock bunches
    far tighter: after 20 seconds its birds sit more than half a world unit closer to their
    nearest neighbours."
  - **The measured difference:** the mean nearest-neighbour distance after 20 s. It holds on
    **20 of 20 skies**; seed 5 gives 1.46 against 0.43.
- **The passage it needs:** the paper's statement of its three behaviours, and its
  description of collision avoidance.

## Level 4 · Method · Stay with the flock

- **Afterwards, the learner understands that** the third urge, steering toward the middle of
  the birds you see, keeps a flock compact. Without it, the flock spreads out across the
  valley.
- **The control:** `cohesionWeight`, called "Stay close".
  - Range 0 to 2 per second (the primitive's own), starting at 0.4.
  - Beginner end words: "Drift apart" and "Huddle together".
- **What they watch:**
  - **On screen:** a ring on the ground around the flock, as wide as its spread. At 0 the ring
    grows to cover most of the valley; raised, it draws in.
  - **On the readout:** the spread dial, the same spread as the ring. Its number is E19, the
    root-mean-square distance of the largest group's birds from its centre, the short way
    round. The ring is drawn from the read-only query Q3 and changes no measurement (R02).
- **The guide** reads the spread in words: packed tight, holding together, loose and wide,
  spread across the valley.
- **What if birds had no urge to stay together?**
  - The right world runs with "Stay close" at 0.
  - **The effect, as the level states it:** "Without the pull toward the middle, the other
    world's flock spreads out across the valley: after 40 seconds its spread is more than 3 world
    units wider."
  - **The measured difference:** the spread after 40 s. It holds on **20 of 20 skies**,
    typically about 5 world units against about 12.
- **Rework (ADR-0018).** Two candidates were measured, and the owner said to take whichever
  met the rule:
  - **The groups count** stayed at one group without cohesion: more groups on only 2 of 20
    skies.
  - **Candidate (a), compactness:** holds on 20 of 20. Adopted.
  - **Candidate (b), rejoining after a rock:** holds on 5 of 20. Rejected; without cohesion
    the flock is usually one group again by 60 s.
- **The passage it needs:** the paper's description of flock centering.

## Level 5 · Evaluation · Does it behave like a flock?

- **Afterwards, the learner understands how a model like this is judged.** The paper judged
  its flock by how it behaves. A real flock never flies through a rock: it parts round it
  and closes up again. Here the rocks are in the way, and the learner can take away the
  model's rule for rocks to see what that rule is for.
- **The control:** `obstacleRadius`, called "How early birds swerve".
  - Range 1 to 6 world units, a teaching choice inside the primitive's 0.1 to 10. Starting
    at 3.4.
  - Beginner end words: "At the last moment" and "From far away".
  - The level's `setup` places **four rocks across the valley**, at x and y of 8 and 24, so
    every sky's flock meets one. A teaching choice, applied as place events at step 0.
- **What they watch:**
  - **On screen:** the flock reaching the rocks, parting round them and rejoining. A rock
    lights up while a bird is inside it (Q4).
  - **On the rocks counter,** the level's readout (owner, session 6): the birds inside rocks
    right now (E20), and each of the four rocks, lit while a bird is at it. With the rule, it
    mostly reads 0; in the What-if world the rocks light up again and again.
- **What if birds had no rule for rocks?**
  - The right world runs with `obstacleWeight` at 0: a parameter override, as a counterfactual
    must be.
  - **The effect, as the level states it:** "Without the rule, birds fly straight through the
    rocks: together they spend more than three times as long inside them as this world's
    birds."
  - **The measured difference:** bird-seconds inside a rock (closer than 1 world unit, E20)
    over 20 s. It holds on **20 of 20 skies**; seed 5 gives 0.3 against 21.4.
- **Rework (ADR-0018).** The first draft failed the rule:
  - **One rock with "the strongest push"** lowered agreement on only 10 of 20 skies. The rock
    sat in seed 5's path only.
  - **Measured and rejected:**
    - "no rule for rocks" with the one rock: 15 of 20 by 80 s;
    - the strongest push with four rocks: 15 of 20.
  - **Adopted:** four rocks, and no rule.
- **The passage it needs:** the paper's discussion of avoiding environmental obstacles, and
  its observation that flocks split around obstacles and re-form.
- **A teaching choice to state on screen:** the primitive's rocks push like a force field,
  and do not steer birds away. The level's Advanced text says so.

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
  - **The effect, as the level states it:** "The sparser flock takes far longer to agree: at
    least 10 seconds longer to reach agreement 0.8, if it gets there within 40 seconds at
    all."
  - **The measured difference:** the seconds until agreement first reaches 0.8, within 40 s.
    It holds on **20 of 20 skies**; on most of them, the sparse flock never gets there within
    40 s.
- **What it needs:**
  - No passage from Reynolds.
  - The journal page is labelled a bonus page, and cites Vicsek et al. 1995 as further
    reading, as a teaching choice, with no quote.

## Predictions (owner, session 6; ADR-0023)

Every level asks for a prediction before its What-if: two choices, the stated outcome first,
never scored. At the level's time the guide reports this sky's result by the choice it bears
out, then the rule across 20 skies, the paper's point and a question.

| Level | The question | The two choices |
|---|---|---|
| 1 | If birds ignored their neighbours' headings, would the flock still come to fly one way? | It stays scattered · It still lines up |
| 2 | If every bird could see the whole flock, would the flock come to agree faster? | Faster · About the same, or slower |
| 3 | If birds never kept their distance, what would happen to the space between them? | They bunch up much tighter · They keep about the same spacing |
| 4 | If birds had no urge to stay together, would the flock still hold together? | It spreads out across the valley · It stays about as tight |
| 5 | If birds had no rule for rocks, would they still steer round them? | They fly straight through · They still find a way round |
| 6 | If the flock were a quarter as dense, would it come to agree as quickly? | It takes far longer · About as quickly |

## Settled by the owner (2026-10-09)

The questions this script raised were answered, and are recorded in ADR-0014 and ADR-0015:
- the source;
- level 6 as a bonus level;
- the group measure;
- the readouts;
- setup placements;
- derived restarts.

Then, the same day, the level rule (ADR-0018), with level 2 kept as a prediction and level 4
measured on two candidates.

Then, in the day's sixth session, the owner accepted:
- level 5's rework: four rocks, and no rule for rocks;
- level 4 as a level about spread, with the ring and the dial;
- the birds at rocks as level 5's readout, rather than the compass (ADR-0018).
