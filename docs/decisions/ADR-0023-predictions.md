# ADR-0023: A prediction before every What-if, saved in the run record

- Status: accepted. The owner asked for it; the details are mine, for the owner to confirm.
- Date: 2026-10-09
- Decided by: the owner asked, in the day's sixth session, for "a prediction before every
  What-if, not only level 2: two choices, never scored, the guide reports the measured result
  afterwards, saved in the run record".

## Context

Until now only level 2 asked for a prediction (ADR-0018). The other five levels opened their
What-if card straight away. A prediction lived only in the page's state, so nothing kept it
once the page closed. The run record, `runrecord/2`, held events that shape a run, and
nothing else.

## Decision

1. **Every level of the flocking world asks before its What-if.**
   - **Two choices.** The first is the outcome the level states, and the second is its
     opposite, as the guide already reads them.
   - **Never scored.** No line calls a choice right or wrong. A test reads every line for
     scoring words.
   - **The guide reports what was measured** at the level's time:
     - on this sky, by the choice the result bears out;
     - across 20 skies, as the level rule holds it;
     - then the paper's point, and a question.
   - **The bonus level's explanation is a teaching choice,** because it claims nothing from
     the paper.
2. **`runrecord/3` adds `predictions`:** each with its step, level, prompt, choice and the
   words chosen. They are ordered by step, and none comes after the run's last step.
   - **A prediction is a note in the run, not an event.** It shapes nothing, so replay
     ignores it. A test replays a record with and without predictions, and gets the same
     state.
   - **A new version, not an optional field,** because the contract is strict: a
     `runrecord/2` reader must not meet a key it does not know.
3. **The session records a prediction at the step it is made,** and builds the whole
   `runrecord/3` itself with `record(identity)`. The identity is the run's id, hashes and
   runtime, which the session cannot know. The export button waits until after G3's first
   generated world (owner, this session).
4. **The contract still allows a level without a prediction.** The flocking world's test
   requires one on every level. Whether `worldspec/3` makes it required is left to the plan
   (`docs/design/every-paper.md`).

## Consequences

- **The What-if card now appears only after a level's prediction,** from the second time What
  if is pressed. The browser tests that opened it directly answer the prediction first.
- **`runrecord/2` records no longer parse.** None was ever saved outside the tests.
- **A run's predictions reset with the run:** on the next seed, and on entering a level.
