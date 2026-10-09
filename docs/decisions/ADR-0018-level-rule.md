# ADR-0018: The level rule

- Status: accepted. Interpretations 2–5 and the reworks of levels 4 and 5 are mine, for the
  owner to confirm.
- Date: 2026-10-09
- Decided by: the owner, on 2026-10-09:

  > A level's stated effect must hold in its stated direction on at least 16 of 20 seeds and
  > show within about 20 s (or within the level's time at 4x speed). Measure before writing it
  > into a fixture; record the table in eval/sweeps/levels.md, and make a test re-run it. A
  > level that fails the rule is reworked or cut, never softened in wording.

  The owner also decided on two levels:
  - **Level 2:** keep "What if each bird saw the whole flock?" as a prediction, with its
    surprise stated honestly and with exact numbers.
  - **Level 4:** measure two candidates, compactness and rejoining. Pick whichever meets the
    rule, or cut the level.

## Context

Session 4 found that two of the level script's expected effects did not hold on the model:
level 2's and level 4's. They had been written from intuition, then checked on one seed.

## Decision

1. **The rule, as the owner wrote it.**
2. **How "stated effect" is made checkable.**
   - Each counterfactual in `worldspec/2` carries its **measured difference**: a metric the
     primitive measures, a summary, the level's time, a label and a unit.
   - The summary is one of four:
     - the value at a time;
     - the time a threshold is first reached;
     - the lowest value from a time on;
     - the total over the level's time.
   - It also carries a **claim**: the other world's summary is higher or lower than this
     world's, by more than a margin, and optionally by a ratio.
   - The level's words must say only what the claim checks. The fork view (next) shows the
     same difference.
3. **The skies, sampling and time.**
   - Skies are seeds 1 to 20, the defaults sweep's own.
   - Both worlds of a fork run from the same seed, with the level's setup, sampled every
     0.1 s, as often as a readout updates.
   - "Within the level's time at 4x speed" is read as at most 80 simulated seconds: 20 s of
     watching at 4x.
4. **Two kinds of claim.**
   - **"each"** must hold on at least 16 of 20 skies.
   - **"count"** states a result whose surprise is the point, as an exact count, and must be
     exactly right. It is allowed only on a level that asks the learner to predict first, so
     it cannot become a way round the rule.
   - Level 2 is the only count. Seeing the whole flock brings agreement 0.9 sooner by more
     than a second on 6 of 20 skies, and is about the same or slower on 14. My reading of the
     owner's "a null-ish result stated honestly" is this: the intuitive claim ("faster") fails
     the rule, and that failure is what the level reports.
5. **The test runs the sweep in its own Node process.** Under Vitest's module transform, the
   primitive runs about 2.4 times slower (188 µs a step against 79 µs). The full sweep would
   take 128 s there, against 38 s in Node.

## Applying it (`eval/sweeps/levels.md`)

| Level | What if | Measured difference | Claim | Holds |
|---|---|---|---|---|
| 1 | Birds ignore neighbours' headings | Agreement after 20 s | lower by more than 0.5 | 19 of 20 |
| 2 | Every bird sees the whole flock | Seconds until agreement first reaches 0.9, within 40 s | lower by more than 1 s, on exactly 6 (a count) | 6 of 20 |
| 3 | Birds never keep their distance | Spacing after 20 s | lower by more than 0.5 | 20 of 20 |
| 4 | No urge to stay together | Spread of the largest group after 40 s | higher by more than 3 world units | 20 of 20 |
| 5 | No rule for rocks | Bird-seconds inside rocks over 20 s | higher, and more than 3 times | 20 of 20 |
| 6 | The flock a quarter as dense | Seconds until agreement first reaches 0.8, within 40 s | higher by more than 10 s | 20 of 20 |

- **Level 4: compactness (a) adopted; rejoining (b) failed.**
  - Without cohesion, the largest group spreads to fill the valley (about 12 world units
    against about 5).
  - The rejoining candidate held on 5 of 20, because without cohesion the flock is usually one
    group again.
  - The spread needed a new observable, E19, and the ring on the ground a read-only query, Q3.
    The owner asked for a query; the number had to be an observable too, so the fork and the
    sweep can measure it like any other.
- **Level 5 failed the rule, and was reworked.** The owner was not asked first, since the rule
  says to rework.
  - With one rock at (15, 8.5), the strongest push lowered agreement on only 10 of 20 skies.
    The rock lies in seed 5's path, not in the others'.
  - **Measured and rejected:**
    - "no rule for rocks" with the one rock: 15 of 20 at 80 s;
    - the strongest push with four rocks: 15 of 20.
  - **Adopted:** four rocks across the valley, at x and y of 8 and 24, and "What if birds had
    no rule for rocks?". It holds on 20 of 20.
  - This needed a second new observable, E20: birds closer than 1 world unit to a rock.
  - The level's lesson stands: judge a model by how it behaves. A real flock never flies
    through a rock.
  - The level's readout stays the compass. The fork's chart shows birds at rocks.
- **The primitive becomes 3.1.0,** a minor version. E19 and E20 are new observables. Nothing
  else changes: every sweep record differs only in the version it names.

## Consequences

- **A level's words can no longer outrun the model.** Changing a claim, a threshold, a
  setting or the primitive re-runs the sweep through its test, and a failing level fails the
  gate.
- **The rule's cost:** the sweep test takes about 38 s of the gate's test step.
- **Still for the owner:**
  - level 5's rework;
  - level 4's lesson as a level about spread;
  - whether level 5's readout should become the birds at rocks.
