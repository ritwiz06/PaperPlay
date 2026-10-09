# ADR-0020: The speed control

- Status: accepted
- Date: 2026-10-09
- Decided by: the owner asked for "a speed control (1x, 2x, 4x): more fixed steps per frame,
  results identical", with a test that a run at 4x replays bit for bit against the same run
  at 1x. I chose the details below.

## Context

A level's time is up to 40 simulated seconds (ADR-0018). At 1x, a learner waits that long
for the fork's result. The simulation takes only fixed steps (ADR-0007), so going faster must
mean more of them per frame, never a longer one.

## Decision

1. **The clock takes a speed.**
   - At speed s, `advance` offers s times a frame's wall time, and its two per-frame caps
     scale with it: the longest frame, and the most steps.
   - At 4x a stalled frame is cut to four times 1x's cap, not to 1x's.
2. **What runs at the chosen speed:**
   - the one world, through the session's `setSpeed`;
   - the fork's two worlds, through the fork's `setSpeed`. A fork opens at the speed in use.
3. **Speed is not part of a run.** It changes no step and is not recorded as an event, so a run
   at 4x is the same run as at 1x.
   - A test plays one run at 1x and at 4x, moving the control at step 120. The states at step
     480 match bit for bit, and so do the recorded events.
   - The 4x run replays from its record.
   - The test fails if speed lengthens the step instead.
4. **The control is one small button** showing the speed, and stepping through 1x, 2x and 4x.
   - It sits beside Play in the HUD, and in the fork.
   - Its accessible name says what a press does: "Speed 4×. Change to 1×".

## Consequences

- **At 4x a level's time takes at most 10 s to watch.**
- **The fork's browser tests run to the end of a level's time at 4x,** and check what the sweep
  recorded for that sky.
- **On a slow device, 4x can still drop frames' worth of time**, as 1x can. Dropped time is never
  simulated, so the run stays exact; it is only slower to watch.
