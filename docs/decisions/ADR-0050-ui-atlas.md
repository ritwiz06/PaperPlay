# ADR-0050: The UI atlas, for the owner's review

- Status: accepted. The owner asked for `npm run atlas` on 2026-10-18: every route, world and level in
  every state, at 1440 × 900 and 390 × 844, with screenshots and a 6-second clip per level, one
  gallery compared against the previous atlas and published as a private artifact; a UI inventory;
  and `docs/design/owner-review.md` for the owner's notes, read at the start of every session from
  then on. How it is built is mine.
- Date: 2026-10-18
- Decided by: the owner, what the atlas shows; me, how it is made.

## Context

The owner reviews the UI before G3b continues. Until now the screenshots for a review were taken by
hand for one world at a time and kept in a temporary folder, so nothing showed every world side by
side, nothing said what changed since the last review, and the shots were lost with the folder.

## Decision

1. **`npm run atlas`** (`scripts/atlas.ts`) serves the app on a development server of its own and
   visits, at both sizes:
   - the pages that are not worlds: `/library`, `/create`, `/world/local` and a path with nothing on
     it;
   - every world the library's index lists, and every level of each in seven states: opened, after
     moving the control through its range, with What if's prediction asked, with the fork running
     and finished (at 4×), with the journal open, and with the depth switched to Advanced (a phone's
     card expanded first);
   - for each generated world, the storyboard of the job that made it: its own events, played back to
     `/create`, from this machine's API data folders where the world is still as that job made it,
     or else the states its job record kept; never another job's, since worlds of one paper share a
     title.
2. **Shots compare; clips play.** Every shot is taken with reduced motion, so a world opens still and
   the same commit gives the same picture, drawn in software as the tests draw it (ADR-0010). Each
   level's clip is played, with its control moved to the top of its range and back, and filmed by a
   browser of its own with the machine's GPU, one world at a time: in software a town at 1440 × 900
   films at three or four frames a second, with the GPU at about 28. Its frames are encoded by
   Playwright's own ffmpeg at the rate they were taken, to a small VP8 WebM. `--redo clips` and
   `--redo storyboards` take that part of an atlas again and keep the rest.
3. **Each shot captioned** with its route, its level's title, its control and value as a screen
   reader hears them, its readout or the fork's measured result, and its issues: the known ones,
   kept by hand in `scripts/atlas/known-issues.ts` and removed when fixed, the levels the
   definitional rule finds definitional, and what the atlas finds itself: console errors, a page
   wider than its window, an axe violation on a level as it opens, a fork that has not finished.
4. **Compared with the atlas before it.** The newest atlas of another date is the one compared: a
   shot whose bytes match is the same; one whose bytes differ is changed when more than 0.2% of its
   pixels differ by more than 24 in a channel, and the gallery says by how much; a shot with no
   earlier one is new; a fork's running shot, taken mid-run, is not compared.
5. **Kept in `captures/atlas/<date>/`,** which git ignores as it ignores the demo's captures: the
   shots, the clips, `manifest.json`, the gallery `index.html` that opens from the folder, and
   `artifact.html`, the same gallery with each level's shots joined into one strip, so the artifact
   holds a few hundred files rather than a thousand. Shots from before the atlas sit under
   `earlier/<world>/<set>/` and show under their world.
6. **`docs/design/ui-inventory.md`** names every screen and HUD element, what it is for and where it
   is built; **`docs/design/owner-review.md`** holds the owner's notes under a heading per world, and
   the session protocol reads it first and turns each new note into a task.

## Consequences

- An atlas takes an hour or more: a fork runs to its horizon, and in a learning world its 20 starts
  run in the browser. It runs three worlds at a time (`--workers`), and never during a land's gate.
- The storyboards of the generated worlds are as true as this machine's job folder: on another
  machine they fall back to the job records' states, and the caption says which.
- The atlas is not a test: nothing in it fails the gate. What it writes is tested
  (`scripts/test/atlas.test.ts`).
