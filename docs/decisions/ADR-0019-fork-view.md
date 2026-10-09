# ADR-0019: The fork view

- Status: accepted. My choices within the owner's brief, for the owner to confirm.
- Date: 2026-10-09
- Decided by: the owner asked, on 2026-10-09, for:
  - two synchronized worlds on the same seed;
  - the one measured difference, as an agreement-over-time chart (or the level's readout);
  - "Both worlds restart" where the builder derives it;
  - on phones, the worlds stacked, not side by side;
  - axe on both sizes.

## Decision

1. **When the two worlds start.**
   - A What-if that changes only live variables branches both worlds from the moment the
     fork opens, from the one world's state.
   - A What-if that changes a start-up variable restarts both from the seed, with the level's
     setup. The fork then says "Both worlds restart from the same seed". The builder derives
     which (ADR-0014).
2. **What each world runs with.**
   - The left world keeps the learner's own settings.
   - The right world has the What-if applied on top.
3. **One clock.**
   - The fork advances both worlds with `stepBy`, so they are step for step together.
   - The left stage's loop drives that clock, and the right stage only draws.
   - The one world pauses while the fork is open, and plays again on closing if it was
     playing.
4. **The measured difference is the level's own (ADR-0018).** The chart draws its metric for
   both worlds over the level's time.
   - **Sampling:** both are sampled every 0.1 s, as the levels sweep samples them.
   - **Summary:** the same functions summarise them.
   - **The check:** a fork opened at a level's start on seed 5 measures exactly what
     `eval/sweeps/levels.md` records for that sky, which a test checks for all six levels.
   - **At the level's time,** the fork stops and reports two things:
     - whether the level's statement holds on this sky;
     - how it fares across 20 skies.
5. **The level's stated effect moves from the What-if card into the fork,** as "The level
   states: …", beside what was measured.
   - The card keeps the question and what the other world changes, and offers "Run both
     worlds".
   - Level 2's effect waits for its prediction (slice 3).
6. **The chart:**
   - this world is a solid ink line, the other a dashed one, so the two differ without
     colour;
   - a first-reach summary draws its threshold.
7. **On a phone** the worlds stack, each at least 200 px tall, and the fork scrolls if the
   screen is too short for the chart.
8. **A stage takes an accessible name and makes its own key-hint id,** so two stages on one
   page are told apart, and no id repeats.

## Consequences

- **Three WebGL contexts would be too many on a phone,** so the one world's stage is unmounted
  while the fork is open, and mounted again on closing.
- **The one world's stage, when mounted again, starts its camera afresh.**
- **At 1x a level's time takes up to 40 s to watch.** The speed control (slice 4) shortens it.
