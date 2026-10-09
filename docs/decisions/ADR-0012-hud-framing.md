# ADR-0012: Framing the field in the room the HUD leaves

- Status: accepted
- Date: 2026-10-09
- Decided by: the owner asked for a HUD-aware camera fit. The stage receives the screen
  rectangle the HUD leaves free and frames the field inside it, render-only (R02), tested at
  1440 × 900 and 390 × 844. The owner also asked for a heading compass whose arrow is the
  directional agreement. How both are built is this ADR's, for review.

## Context

The game-first shell lays its HUD over a full-screen stage (ADR-0008). The camera used to
centre the field on the whole canvas. On a phone, the level card then hid the lower half of
the field, and the spike's flock flew under the cards.

## Decision

1. **The view window.** An orbit camera may carry a window: a rectangle of the canvas, as
   fractions.
   - The projection is built for the window's aspect, then scaled and shifted into the
     window: an off-centre frustum. So the canvas still draws the world edge to edge, while
     the view is centred and fitted in the window.
   - With the whole canvas as the window, it is the old projection, entry for entry.
   - The adapter draws the frame's own projection matrix, instead of rebuilding one from
     the field of view, so the window reaches the screen.
   - Picking maps a screen point into the window before unprojecting it, so a click still
     lands where it should.
2. **The free rectangle.**
   - Of the rectangles bounded by the screen's and the HUD's edges, kept 12 px from every
     HUD box, the stage takes the one the field would look largest in.
   - Its worth is min(height, width / 1.32), the aspect below which the field would overflow
     its width. Ties go to the larger area.
   - On a desktop, it chooses the room beside the bottom-left stack. On a phone, it chooses
     the band between the top bar and the level card.
3. **What counts as HUD.**
   - The resting HUD is the elements marked `data-hud-frame`: the top cards, the level card
     and the guide's icon. Overlays never reframe the world: the guide's bubble, the What-if
     card and the journal.
   - The free rectangle is measured again whenever one of those elements changes size, so
     opening the phone's card reframes the field.
   - Coverage counts every visible `data-hud` box, overlays included when they show.
4. **R02.** The window is presentation only, and the render-invariance run now draws through
   one.
5. **The compass.**
   - Its arrow's direction comes from the primitive, through the read-only query Q2. Its
     length is E12's directional agreement. The ticks are Q2's per-bird headings.
   - It shows the field from above, turned with the camera's yaw, so a heading points where
     those birds fly on screen. It ignores the camera's tilt. A test bounds the perspective
     error at under 0.08 rad from the projected direction.
6. **The browser tests read the fit from the stage itself.** The stage publishes the free
   rectangle and the field's projected bounds as data attributes, so a test checks what was
   drawn, not a copy of the arithmetic.

## Consequences

- At rest, the HUD covers 15.1% of 1440 × 900 and 21.3% of 390 × 844 (on SwiftShader). The
  field lies inside the free rectangle at both sizes.
- **Slice 2's closer, following camera is checked differently.** It frames the flock rather
  than the whole field. Three claims are kept:
  - the fit at the overview distance still frames the whole field in the free rectangle;
  - the closer view stays centred in that rectangle;
  - the flock's centre lies inside it.
- A HUD that changes size reframes the world without animation. Easing that is a possible
  polish.
