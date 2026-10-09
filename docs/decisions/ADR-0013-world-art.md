# ADR-0013: The world art pass

- Status: accepted
- Date: 2026-10-09
- Decided by: the owner asked for a world art pass, render-only, with R02 still passing:
  - birds with a body and two wings, about twice the size, flapping with speed and keeping
    their bank, still instanced;
  - colour by heading from the palette, on in the hook and a toggle on `/world/local`;
  - short fading trails;
  - low-poly terrain with hills, a lake, trees, rocks, a sky gradient and a sun, and a soft
    meadow edge instead of the wireframe border;
  - a closer camera that gently follows the flock and drifts when idle, respecting the
    HUD-aware fit and reduced motion;
  - frame times measured and recorded.

  The choices below were made while building it, for review.

## Context

The stage looked like a debug view: ink triangles over a flat plane in haze, inside an aqua
outline with four posts. People will judge PaperPlay by what the world looks like, and
learners should see agreement in the flock rather than read it off a number.

## Decision

1. **Birds.**
   - A body, about 1.4 units long, and two wings hinged at its sides, spanning about 2.2.
     They are three instanced meshes drawn from one material, so 400 birds still take three
     draw calls.
   - A wing swings about the bird's own nose by the frame's flap angle. Each wingbeat is
     3 Hz in the world's own time, so a beat repeats with the run, never with the frame rate.
   - The swing widens with speed, from 0.12 to 0.62 radians, up to the default top speed of
     3.6. Each bird is out of step with the next by the golden angle.
2. **Colour by heading.**
   - A wheel of three palette colours, at 0, ⅓ and ⅔ of a turn, blended in between. By day
     it is teal (aqua 40% toward ink), olive (lime 55% toward ink) and ink. At dusk it is
     aqua, lime and cream.
   - A test holds every colour on the wheel at 3:1 or better against the meadow (WCAG's
     non-text contrast).
   - Hues inside the palette are close together. So the wheel trades hue for contrast:
     neighbouring stops differ by a perceptual distance (ΔE) of 29 to 47.
   - Birds flying one way share a colour, so an agreeing flock turns one colour. A picked
     bird's focus and context still override it.
3. **Trails.**
   - Flat ribbons at flight height that taper and fade toward their oldest point. The width
     and opacity grow as the square root, so the part just behind the bird reads.
   - The session hands the stage three seconds of history: one state in eighteen, ten states
     in all.
   - A trail is cut where its bird wrapped round the world, and capped at 3.5 world units.
   - **Why three seconds:** measured on seed 4, the flock cruises near its minimum speed
     (0.55 units a second five seconds in). A one-second history hid under each bird's body.
   - Trails are presentation only, and R02 runs with them.
4. **The valley.**
   - A flat meadow under the field and 5 units beyond it, then hills rising all round, with
     a ridge pattern.
   - A lake beside the field, in a basin carved out of the hills.
   - About 150 trees in groves and 46 rocks, placed by a fixed hash outside the meadow and
     the lake, on gentle ground.
   - A sky dome from the palette's horizon to its zenith, outside the fog, and a sun disc.
   - The field's edge is a soft band in the meadow's colours, blended per vertex so it is not
     a sawtooth. Birds still fade out before the edge they wrap across.
5. **The camera.**
   - `framing="follow"` stands at 0.75 of the overview's distance, looking down at 0.68
     radians.
   - It eases toward the flock's centre, measured the short way round the world, closing
     most of the gap in about 1.6 s. It stays within 5 units of the field's edges.
   - After 6 s without a touch, it drifts round at 0.035 radians a second.
   - Under reduced motion it is the still overview.
   - It stays centred in the HUD's free window. So ADR-0012's fit still frames the whole
     field at the overview, and the browser test checks that the following camera keeps the
     flock's centre inside the free rectangle.
6. **`/world/local`** keeps the plain look. A "Colour birds by heading" toggle sits in Rules
   of this world. It records no event, and a browser test checks the run against Node bit
   for bit with it on.

## Consequences

- **Frame times at 72 birds on `/world/hook`,** measured over 10 s after a 2 s warm-up:

  | Renderer | Size | Frames a second | p50 | p95 | p99 | Over 20 ms |
  |---|---|---|---|---|---|---|
  | Apple M3 Pro GPU (Metal) | 1440 × 900 | 60 | 16.7 ms | 16.7 ms | 16.8 ms | 0% |
  | Apple M3 Pro GPU (Metal) | 390 × 844 at 2× | 60 | 16.7 ms | 16.7 ms | 16.8 ms | 0% |
  | SwiftShader (software) | 1440 × 900 | 21 | 50 ms | 50.1 ms | 66.7 ms | 100% |
  | SwiftShader (software) | 390 × 844 at 2× | 21 | 50 ms | 66.6 ms | 66.7 ms | 100% |

  On a GPU the frame rate is held at vsync. Software rendering is the tests' path, not a
  learner's.
- **The demo capture's bytes change** with the new world. Slice 3 re-films it, with a scripted
  camera.
- **Untested:** a phone's GPU, and agent counts above 72.
