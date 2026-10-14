# ADR-0029: The town kit, a shell for any world, and Threshold Town

- Status: accepted. The owner asked for the town kit and the Kermack and McKendrick world in
  G3a.2 (ADR-0024); the shapes below are mine, for the owner to confirm.
- Date: 2026-10-10
- Decided by: the owner asked for "a town scene kit in Outbreak Island's spirit: people whose
  colour shows their compartment, driven by the solver's fractions", which are "a picture of the
  model's fractions, not a second model", said so on the world's page of what it cannot show,
  with R02 holding; and for the Kermack and McKendrick world, hand-authored in worldspec/3, a
  draft until its anchors are real, every level meeting the level rule.

## Context

ADR-0026 split the stage into scene kits, but only the valley existed, and `/world/hook` was
written for the flock. ADR-0028 made a compartment model data, run by one solver. A compartment
world needs a kit that draws compartments, a shell that plays any world, and a level rule for a
model with no chance in it. Some of the flock's habits are wrong for an epidemic: a fork opened
after the epidemic has burned out shows nothing, and an epidemic has to be started again.

## Decision

1. **The town kit, in three halves** (`packages/ui/src/{stage-core,three-adapter,react}/kits/town/`):
   - its pure half turns each compartment's share of the whole into 120 figures, by largest
     remainder, so the counts always add up. Figures are counted out in one fixed order, the
     last compartment's first, so as people move from the first compartment to the last, each
     figure only ever moves forward. Where a figure walks is a fixed loop set by the model's time
     alone;
   - colours by compartment, every one a palette token: still well cream, ill lime, removed ink.
     An ill figure stands in a ring, so illness never shows by colour alone;
   - its React half is a mark and the shares bar, whose number is the solver's own measurement;
   - its manifest's disclosures say the figures are a picture of the shares, the walking plays
     no part in the model, and the houses and trees are scenery;
   - a kit's own Three.js parts may not take a name the stage's own fields take, checked by
     type: the town's first draft shadowed the stage's `rings` and broke at run time.
2. **The shell plays any world:** `HookWorld({ play })` takes a `PlayableWorld`, the world as
   built and its kit's halves, readout and words (`apps/web/src/worlds/`). The flocking world
   plays at `/world/hook` and Threshold Town at `/world/epidemic`. The town's view of a session
   (`apps/web/src/world/town.ts`) divides each compartment by their sum; nothing in it steps.
3. **Families say where a fork starts its worlds** (`FAMILIES[*].forkFrom`): from the moment it
   opens for agents, which keep going, and from the start for every other family, whose runs are
   stories with an end. The builder derives `restarts` from it, so a compartment fork always
   tells the epidemic from day 0 and shows the difference the level rule checked. The flock's
   forks are unchanged.
4. **Words follow the family:** a fork that restarts says "Both worlds start again from day 0"
   for a model with no chance in it, and the level rule's 20 runs read "Across 20 towns, this
   world's values and 19 within a tenth of them". A run with an end has a Start again button,
   which begins a new run from the control as it is (`WorldSession.startAgain`).
5. **A session and a fork pace their steps by the model's time a second shows** (`wallStepOf`):
   a step's share of a second of watching is the model's step over `perWatchSecond`. The
   flock's `perWatchSecond` is 1, so its pace is exactly what it was.
6. **The journal has a page of what the world cannot show,** for every world: the family's label
   when it has one, the spec's limits with their origins, then the kit's disclosures.
7. **The levels sweep runs any world** (`scripts/sweep/levels.ts`), over the family's variation:
   - seeds 1 to 20 for the flock, whose record, `eval/sweeps/levels.md`, is byte-identical;
   - for a model with no chance in it, the world's own values and 19 others, each parameter
     scaled by a factor between 0.9 and 1.1 drawn from `mulberry32(k)`, in the parameters'
     alphabetical order. The What-if sets its variables to their stated values in each;
   - every run of a compartment world is also held to the accuracy check, which now reports how
     close it came (`accuracyReport`), not only whether it failed.
8. **Threshold Town** (`fixtures/worldspecs/kermack-mckendrick-1927.json`), a draft:
   - the paper's special case of constant rates: `dx/dt = −κxy`, `dy/dt = κxy − ly`,
     `dz/dt = ly`, with `x + y + z` conserved and proved so symbolically;
   - five levels: an epidemic that ends by itself; still well, ill, removed; a threshold for the
     town; where it starts hardly matters (a count claim, holding on none of 20); a bigger town,
     a bigger epidemic;
   - every value is a teaching choice, and four days of the model show in a second at 1x;
   - every level meets the rule (`eval/sweeps/levels-kermack-mckendrick-1927.md`); the most any
     run moved when the step was halved is 7% of what the accuracy check allows.

## Consequences

- **A second kit cost no change to the flock:** its records replay bit for bit and its levels
  record is byte-identical.
- **The fixture repeats its model in each of its five levels,** because a binding belongs to a
  level. The app refuses a world whose levels bind different models, since one session plays
  them all. A world-level model binding would remove the repetition.
- **A paper-derived statement holds no teaching value:** where a level gives the threshold for
  this world's values, about 333 people, it says so at Intermediate, a teaching choice, never in
  the paper-derived Advanced text.
- **Claims to check against the PDF:** the anchors' needs name the passages expected, among them
  the threshold, the epidemic ending before everyone is infected, and the comparison with
  plague in Bombay. Any the source map cannot find are reworded or cut.

## Amendment, 2026-10-14: accepted, with five fixes

The owner accepted this decision, and as it stands: day-0 restarts for compartment forks, Start
again, four days a second, the ±10% starts from `mulberry32(k)` with the What-if's values exact,
and level 4's count claim. Five things changed, at the owner's request (`eac3826`):

1. **Colours:** ill figures warm orange (`ember`, `#f6ae66`), removed figures soft blue-grey
   (`mist`, `#b3c4d2`), two colours added to the tokens for them. Both are as light as cream is
   not, so the ground deepened (sub and lime, then 40% ink) and the plaza turned dark: every
   figure, and the ill figures' ring, keeps 3:1 against both, which a test holds. Orange and
   blue-grey are close in lightness; they differ in hue, warm against cool, and the ill also
   stand in a ring.
2. **Level 1's values:** an infection rate of 0.00017 a person a day, so about three in ten,
   306 of 1,000, are still well when the epidemic ends, by day 200. The level's time is 200
   days; its claim is that ill twice as long leaves more than 100 fewer still well. It holds on
   20 of 20 starts, the smallest gap 212 people.
3. **The readout:** a three-part bar, each part as wide as its compartment's share, labelled
   beneath with its count, or at Beginner with words ("most", "a few"). At Beginner the removed
   are "Recovered or removed". On a town's card the readout takes a full row.
4. **"You said":** the learner's own prediction reads "You said: …", with no origin chip, in
   every world. A guide line's origin may be "learner", for the learner's own words only.
5. **The fork chart and the phone:** a world may set its chart's top, and a town's is its
   population, the larger of the two towns'. On a narrow screen the town kit takes back most of
   the stage's back-off, which is sized for the flock's valley, so the town is framed close.

Threshold Town is now authored in `scripts/fixtures/threshold-town.ts`, and a test holds the
fixture to it.
