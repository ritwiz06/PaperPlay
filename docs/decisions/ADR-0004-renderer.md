# ADR-0004: A Three.js renderer from G1

- Status: accepted
- Date: 2026-09-30
- Decided by: the project owner, on 2026-09-30. This supersedes the "Canvas 2D renderer at
  G1" line of ADR-0001.

## Context

The brief planned a Canvas 2D renderer at G1 and Three.js after G5. The owner moved
Three.js to G1, keeping the model/render boundary intact and leaving react-three-fiber for
later.

## Decision

- **Library:** `three` 0.186 with `@types/three`, both approved by the owner. It requires
  WebGL2, as Three.js has since r163. There is no react-three-fiber.
- **`packages/ui/src/stage-core`** is pure and framework-free. It turns (the two latest
  simulation states, the interpolation fraction, the timestep, a camera, a palette) into a
  `FrameDescription`:
  - each bird's position, yaw, bank from turn rate, colour and edge fade;
  - beacons and obstacles by entity id;
  - the camera's pose and its view and projection matrices;
  - the palette.

  Its tsconfig has no DOM library, and lint forbids Three.js, React and DOM imports. It
  may import simulation types but never simulation code.
- **`packages/ui/src/three-adapter`** applies a `FrameDescription` to a Three.js scene:
  - a low-poly valley, with the torus drawn as a bounded flight field (an outline on the
    ground and four corner posts);
  - birds as one `InstancedMesh` holding 400, the primitive's maximum;
  - hemisphere daylight, a shadowed sun, and fog into the sky colour.

  It cannot import `@paperplay/primitives` or `@paperplay/contracts`; lint and a test both
  enforce this. So it can only draw what the description says.
- **The web app owns the loop.** It takes fixed 1/60 s steps from `advance`, then calls
  `describeFrame`, then `render`. The simulation only ever moves by whole steps.

## Why the stage reads two states

The bank angle comes from the turn rate, which needs consecutive velocities. Drawing
between steps also needs both states. Both uses are presentation only; nothing flows back
into the simulation.

## Presentation choices

- **Edge fade:** birds shrink and blend into the sky within 2 world units of the field's
  edge, so a wrap never reads as a teleport.
- **Palette:** only the accepted tokens.
  - By day: ink birds against a cream sky, starling-style.
  - At dusk (dark mode): cream birds on dark.
  - Beacons are aqua, obstacles are sub, and the ground mixes line, lime and aqua.

  These aren't the prototype's coral birds: coral isn't a token, and the brief rules out a
  terracotta look. A test pins bird-on-sky contrast at 7:1 or better.
- **Framing:** on screens narrower than 1.2:1, the camera backs off (up to twice as far) so
  the field still fits across a phone.
- **Shadows:** `PCFShadowMap` with a radius, because three 0.186 removed `PCFSoftShadowMap`.
- **Reduced motion:** the flock is drawn still, and redrawn only when the stage changes
  size.
- **No WebGL2:** the stage shows "This world needs WebGL" and what to try instead. The
  simulation does not depend on drawing.

## Testing

- **[R02], in Node, on frame descriptions.** A 600-step run is drawn under two cameras and
  two palettes, and run again without drawing. The observables must be bit-identical, the
  frames must differ, and the frozen states must never be written.
- **The adapter, in Node, with no GPU.** These tests cover instances, orientation, fade,
  markers by key, and palette repaints. They also check that the camera matrices match the
  stage core's, which independently checks the projection maths.
- **In the browser.** Playwright launches Chromium with
  `--use-angle=swiftshader --enable-unsafe-swiftshader`, so WebGL is rendered in software,
  the same way on any machine.
  - The stage test asserts the renderer really is SwiftShader and waits for 30 real frames.
  - It then requires the canvas screenshot to have a luminance variance above 64 and more
    than 16 distinct colours.
  - A second test blocks WebGL and requires the fallback message.

## Consequences

- **Bundle size:** the production bundle is 878 KB of JavaScript (239 KB gzipped), almost
  all of it Three.js. Vite warns about the size, and the warning is left visible. Loading
  the stage as a separate chunk is a later option if first paint matters.
- **Machines without WebGL2** see the fallback, not the world.
- **Software WebGL in tests** is slower than a GPU, but its output is the same on every
  machine.
- **Future renderers:** a move to react-three-fiber or WebGPU replaces only
  `three-adapter`. `stage-core`, the primitives and the R02 test stay as they are.
