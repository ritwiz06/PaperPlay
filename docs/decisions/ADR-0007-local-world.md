# ADR-0007: The local world: a recorded session, a React stage and bench

- Status: accepted
- Date: 2026-10-01
- Decided by: the owner set the slice (WorldStage, LabBench, `/world/local` and the [R04]
  smoke test, on the hook seed). The design below was made while building it, and is
  recorded here for review.

## Context

G1's last slice makes the flock playable. R04 asks for:
- live rule controls, and a control that moves the engine parameter and the live readout;
- beacon and obstacle placement;
- a selected-neighbour view;
- next seed and replay same seed.

The brief adds:
- **WorldStage:** a fixed-step loop, with React updating readouts at most ten times a
  second and never once per frame.
- **LabBench:** the level's one control, with an origin chip and "Restore balanced rules",
  and the other rules collapsed under "Rules of this world".
- **The quality floor:** keyboard use, visible focus and reduced motion.

## Decision

1. **The run is a framework-free session** (`apps/web/src/world/session.ts`).
   - It records each action as a RunRecord event at the current step, and applies it
     before that step is taken, exactly as `runEvents` does.
   - So `runEvents` on the session's own plan reaches the session's state bit for bit,
     and a test holds this.
   - Repeated changes to one control at one step collapse into one event, so dragging a
     slider while paused records a single change.
2. **Replay and next seed.**
   - **Replay same seed** restarts from the seed and the run's starting rules, and applies
     the recorded events again at their steps.
   - **Acting during a replay** drops the events not yet replayed: from that step, the
     run is a new one.
   - **Next seed** starts afresh on seed + 1, wrapping at 2³², with the current rules and
     no events.
3. **React components live in `packages/ui/src/react`,** where the brief places them:
   WorldStage, LabBench, Readout, and the origin chip and legend.
   - They receive a driver and callbacks, and lint forbids them from importing simulation
     code; only types are allowed.
   - The app owns the run and hands it over.
4. **The stage keeps its loop out of React state.**
   - It draws when the run or the view changes.
   - It reports readouts at most ten times a second, through `readoutDue`.
   - Under reduced motion, the world opens paused and moves only when the learner presses
     Play.
5. **Every pointer action has a keyboard path.** The stage is a focusable application
   region:
   - arrows orbit the view, or move a cursor across the ground when a placement or pick
     tool is on;
   - Enter acts at the cursor;
   - + and − zoom;
   - Space plays and pauses;
   - Escape releases a picked bird.
6. **The selected-neighbour view shows the primitive's answer.**
   - A read-only query, `flockNeighbours` (MODEL.md, Q1), names the birds the picked bird
     sees and the ones crowding it.
   - The stage core only colours, sizes and rings what it is given: the picked bird is
     enlarged, its neighbours stay in full colour, and the rest are dimmed (focus and
     context).
   - A query changes no equation, state, default or range, so it does not change the
     model's version.
7. **Readouts keep their exact value in `data-value`,** and show it rounded, so a browser
   test can compare them with Node bit for bit.
8. **Origins use one legend, always on screen,** in the masthead.
   - Chips are filled with the origin's colour and carry ink text. Ink on aqua is about
     7.6:1 and ink on lime about 12:1, while aqua or lime as text on cream would fail AA.
   - On narrow screens the legend's explanations are hidden from view but kept for
     screen readers.
9. **The camera fits the whole field on any stage.**
   - On stages narrower than 1.32:1 it backs off in inverse proportion to the aspect, up
     to three times as far. This replaces ADR-0004's square-root fit below 1.2:1, which
     cropped a field corner even at 1.2:1.
   - The fog now keeps its distance beyond the field's centre, so backing off or zooming
     out never hides the field.

## Consequences

- **R04 has evidence:** 11 session tests and 5 browser tests.
- **Planted bugs, twenty of twenty caught:**
  - 6 in the session;
  - 3 in the neighbourhood query;
  - 8 in the stage core and adapter;
  - 3 in the page.
- **The bundle** is 896 KB (245 KB gzipped). The owner chose to keep its size warning.
- **Still to come at G2:** the caption strip, status chips, tethers and the evidence rail.
  The axe scan needs `@axe-core/playwright`, a dependency that waits for the owner's
  approval.
- **The session is the seed of G2's builder runtime:** a WorldSpec level will hand the
  same session its controls, seed and events.
