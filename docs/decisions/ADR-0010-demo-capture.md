# ADR-0010: A deterministic demo capture

- Status: accepted
- Date: 2026-10-09
- Decided by: the owner asked for `npm run capture:demo`:
  - a deterministic Playwright video of seed 4 forming a murmuration while a scripted
    beacon is dragged through it;
  - at 1080 × 1350 and 1920 × 1080;
  - about 15 s long;
  - written to a git-ignored `captures/`.

  How it is made deterministic, the beacon's path and the encoder were chosen while
  building it, and are recorded here for review.

## Context

Playwright can record a video of any page, but that video is filmed in wall-clock time.
Playwright takes screencast frames as the browser paints them and pads them to 25 frames a
second. Meanwhile, the page's own loop turns elapsed time into simulation steps. So the
video depends on how fast the machine draws:
- a slow frame skips part of the world;
- a stalled frame repeats.

Under software WebGL at 1920 × 1080, frames are slow. A beacon dragged by timed pointer
events would also land on different steps from run to run, which changes the run itself.

## Decision

1. **The video is filmed a frame at a time, never in real time.**
   - A dev-only page, `apps/web/capture.html`, holds the stage alone, edge to edge, with
     nothing over it.
   - Its stage never advances the world by itself.
   - For each video frame, the script (`apps/web/src/capture/demo-script.ts`) moves the
     beacon and takes exactly two 60 Hz steps. So a frame is 1/30 s of the world.
   - The capture command waits for the stage to draw, then takes a screenshot.
   - 450 frames are encoded at a fixed 30 frames a second: 15.0 s.
2. **The page never ships.** Only the dev server serves it. The production build's one
   entry is `index.html`.
3. **The beacon is dragged as recorded events.**
   - Each frame removes the beacon and places it again a little further on, at the same
     step.
   - The session records both events, as it does for a learner. So the run replays from its
     own record, and a test holds this bit for bit.
4. **The path.**
   - A straight 12-unit drag through the flock's starting centre (25, 21), heading
     4.5 radians, eased in and out, from 2 s to 8 s.
   - Of 432 straight drags tried (starts 2–4 s, 4–7 s long, 12 headings, 12–24 units), 251
     left one group for the last 3 s. This one ended with the highest agreement: 0.99.
     Without a beacon, seed 4 becomes one group at 10 s and ends at agreement 0.57.
   - A test re-runs the path and fails if the flock is not one group on every frame of the
     last 3 s, or ends below 0.95 agreement. So a change to the primitive cannot quietly
     spoil the video.
   - The path is a presentation choice, not a claim from the paper.
5. **Pixels and encoder.**
   - The same software WebGL as the browser tests (SwiftShader), so any machine draws the
     same pixels.
   - Frames are JPEGs at quality 95, piped to the ffmpeg that Playwright installs for its own
     videos. It is found by Playwright's cache rules and the revision in playwright-core's
     `browsers.json`, so the capture adds no dependency.
   - That build reads only JPEG and writes only VP8 in WebM. The encode is single-threaded
     and bit-exact, with no metadata, capped at 12 Mbit/s with crf 4.
   - Stdin is `pipe:0`. The build has no `-` protocol.
6. **Output.** `captures/murmuration-1080x1350.webm`, `captures/murmuration-1920x1080.webm`
   and `captures/murmuration.json`. With `-- --frames`, each format is also written as a
   lossless PNG sequence, `captures/murmuration-WxH/frame-0001.png` onwards (the owner
   decided on 2026-10-09 to encode MP4 elsewhere, with no new dependency here).
   - Each PNG is a second screenshot of the same drawn frame. The stage draws only when the
     script asks, so the frame cannot change between the two screenshots.
   - The manifest adds each sequence's pattern, count and SHA-256. The JSON records:
   - the primitive's version;
   - the seed, the frame rate and the steps per frame;
   - the runtime and the browser;
   - two SHA-256 hashes per file: one of the frame stream and one of the video.

## The new world and a scripted camera (owner, 2026-10-09)

After the world art pass (ADR-0013), the owner asked for a scripted camera path: open close
on the flock, orbit slowly, then ease out to the valley as the murmuration forms and the
colours converge. Kept deterministic.
- **The capture uses the new world,** with colour by heading, wingbeats and trails, and the
  same seed, beacon drag and two steps a frame.
- **The camera is a pure function** of the video's second and a focus on the flock's centre.
  - The focus is eased once per video frame, closing most of the gap in 1.2 s, the short
    way round the world, and kept over the field.
  - 0 to 3 s: 22 units from the flock, pitch 0.5.
  - 3 to 10 s: an eased orbit of 0.9 radians, pulling back to 30 units.
  - 10 to 15 s: easing out to 74 units over the field's centre, with a last drift of 0.25
    radians.
- **The stage asks its driver for the scripted camera just before each frame,** rather than
  taking a React prop. A prop could arrive a frame late, and that frame would be drawn with
  the camera of the frame before.
- **Tests:**
  - the path opens close and ends wide on the field's centre;
  - no frame jumps by more than 0.02 radians, 0.6 units of distance or 0.35 units of target;
  - two runs give the same path.
- **On this Mac,** two runs gave byte-identical frames and videos:
  - 1080 × 1350: frames `5134ce27e32b…`, video `85bee87719af…`;
  - 1920 × 1080: frames `85b886b88a05…`, video `fd24374d0495…`.

  The videos are now about 22 MB each, and a run takes about 2.5 minutes.

## The canonical runtime (owner, 2026-10-09)

CI found that a capture's bytes hold per runtime: macOS arm64 and Linux x86-64 each repeat
themselves exactly, but differ from each other by rendering noise. The owner chose option a:
- **Published videos come from one runtime:** CI's capture job, on a pinned `ubuntu-24.04`
  image rather than `ubuntu-latest`, which moves to Ubuntu 26 from 2026-10-19.
- **The job runs on `main` and on demand.** A manual run can also write the lossless PNG
  sequences, through the workflow's `frames` input.
- **Its artifact is the published capture.** A capture made on a Mac is a preview.
- **A cross-runtime check stays a follow-up** (option b, in the roadmap): Mac and Linux frames
  would have to agree within a stated pixel tolerance, with bird pixels overlapping. It
  would be a new test, not a loosened one.

## Consequences

- **Two runs on one runtime give byte-identical videos,** on macOS arm64 and on Linux x86-64
  alike. **The two runtimes give different bytes:** their frames differ by rendering noise,
  while the run itself agrees. So the capture's byte-identity is a per-runtime claim
  (architecture.md, Claims per runtime; found 2026-10-09).
- **The capture is a WebM, and with `--frames` a PNG sequence too.**
  - Browsers, YouTube and most players take the WebM.
  - For MP4 (H.264), the owner encodes the PNG sequence elsewhere. The sequences are large:
    118 MB at 1080 × 1350 and 158 MB at 1920 × 1080. A run with `--frames` takes about 3
    minutes instead of 1.5.
- **The pixels depend on the browser and ffmpeg revisions.** A Playwright upgrade can change
  them; the manifest says which revision made a file.
- **It takes about 90 s on this Mac,** because every frame is drawn in software.
- **The default camera frames the whole valley,** so the flock is small in the frame. A closer
  or following camera would need the stage to accept a scripted camera. That is a
  presentation change, and R02 keeps it from touching the run.
