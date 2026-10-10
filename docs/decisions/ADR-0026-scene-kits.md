# ADR-0026: Scene kits, a generic FrameDescription, and a generic session

- Status: accepted. The owner asked for the audit to be carried out (ADR-0024); the shapes are
  mine, for the owner to confirm.
- Date: 2026-10-10
- Decided by: the owner set G3a.1; I chose the shapes, under its condition that every existing
  test passes with only its imports and paths changed.

## Context

The audit (`docs/design/every-paper.md` §1) found the stage, the adapter, the React layer and
the app's session all drawing birds: `FrameDescription` held birds, trails, beacons and
obstacles; the adapter built one hard-wired valley; WorldStage followed the flock's centre and
picked birds; the session asked the flock's queries by name. A compartment model in a town
needs none of that, and must reuse everything else.

Three constraints shaped the answer:
- **The UI tests read the flock's frame and scene directly:** `frame.birds`, `stage.birds`,
  `stage.shown.ground`, `stage.obstacleMaterial`. They may change only their imports.
- **The capture's frame hash must not move,** so every Three.js object, material and draw must
  come in the same order.
- **The stage loads as one chunk,** named `three-adapter-*` (the bundle test, ADR-0017).

## Decision

1. **A scene kit has three halves, each in the layer it belongs to,** under `kits/<id>/`, so each
   layer's lint rules and tsconfig cover its kits as they cover the layer:
   - **its pure half** (`StageKit`, in the stage core): describe a frame from a state; the
     ground's extent; where a following camera looks; picking; the look's name; marks for tests;
     its palette, default target, and whether its world wraps;
   - **its Three.js half** (`ThreeKit`, in the adapter): create its meshes and materials, draw a
     frame's layers, free what it made, and say what carries on when WebGL is missing or lost;
   - **its React half:** its mark, its tools, and its readouts.
2. **The generic FrameDescription is the stage's part plus the kit's own layers,**
   `FrameDescription<Layers, Palette>`: a camera, the field's box, a palette and rings, which the
   base adapter draws, and typed layers beside them, which the kit's Three.js half draws.
   - **Not the plan's closed list of layer kinds** (instances, terrain, segments, markers). A
     bird's bank and wingbeat fit no shared form, and a closed list would push one kit's details
     into every kit. Typed layers let each Three.js half be checked against exactly what its pure
     half emits.
   - **Revisit when a third kit shows what kits share.**
3. **Palettes:** a base palette (the sky at the horizon and overhead, the sun's disc, its light,
   the shade below, the keyboard cursor), which each kit's palette extends.
4. **The valley kit is the first,** id `valley`, as a WorldSpec's design already names it: the
   flock over its valley, its birds, trails, beacons and rocks, moved unchanged.
5. **The base adapter keeps the creation order.** It makes the scene and camera, then calls the
   kit's `create` where today's code made the birds, then the lights, the sky and the rings.
   - Every Three.js object keeps its place in the order Three.js breaks drawing ties by.
   - Material ids change order only between the sky's two materials and the valley's eight.
     Those never tie in Three.js's sort, because the sky draws first by its render order.
   - The capture's frame hashes are the proof.
6. **Every kit's Three.js half registers in the adapter** (`THREE_KITS`), so all of them load
   with Three.js, as the stage's one chunk.
7. **The React layer takes the kit:**
   - WorldStage takes a kit, and tools by name, each one to place or to pick, with its hint;
   - the guide wears the kit's mark;
   - ForkView takes the kit;
   - DifferenceChart takes the world's time unit.
8. **The app's session is generic:** `createSession(primitive, view, options)`.
   - A kit's `SessionView` adds its readings from the primitive's queries, what the stage
     emphasises, and the history its stage draws.
   - The emphasis follows the observable the level watches, so the valley rings the flock's
     spread on the spread level, as before.
   - A fork spawns its two worlds from the session it opens from, on the level's own primitive.
   - A record's samples come once a second of watching at 1x: every 60 steps for the flock, as
     before.

## Consequences

- **A new kit is three halves and a view,** with no change to the stage, the adapter, the
  session or the fork.
- **The UI tests changed only their imports.** Two of them name the flock's frame and the
  valley's palette by their old names, `FrameDescription` and `StagePalette`, so their imports
  alias the kit's types to those names.
- **The adapter's own test still reads only the base adapter's files for simulation imports.**
  The lint rule covers every kit's Three.js half, and a new test reads every kit's files too.
