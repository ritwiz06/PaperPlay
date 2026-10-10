# ADR-0022: When the browser takes the world's graphics away

- Status: accepted. The owner asked for it; the details are mine, for the owner to confirm.
- Date: 2026-10-09
- Decided by: the owner asked, in the day's sixth session, for "WebGL context loss in
  mountStage (restore, or 'Tap to reload the world')".

## Context

A browser can take a page's WebGL context away at any time. Phones do it to background tabs,
and drivers do it after a GPU reset. Until now `mountStage` ignored this: the canvas froze or
went blank, with no word to the learner, and nothing brought it back. The status file had listed
it as a risk since G1.

## Decision

1. **On a loss,** the stage lays a notice over the canvas:
   - "The world stopped drawing";
   - why, in a sentence, saying that only the drawing stopped and the run carries on;
   - a button, "Tap to reload the world".

   The stage's container records `data-context="lost"`. Rendering pauses; the run does not.
2. **If the browser restores the context,** Three.js rebuilds its GL state and drawing resumes
   by itself. The notice goes, and the container records `restored`.
3. **"Tap to reload the world"** builds a new renderer and canvas for the same scene, and puts
   keyboard focus back on the stage. The container records `reloaded`. It never reloads the
   page, so the level, the run, its events and its predictions all stay.
4. **A tap on the notice never reaches the world.** It cannot place, pick or orbit anything.
5. **A stage being disposed ignores its own loss,** since `dispose` forces one to free the
   context at once (2026-10-09).

## Consequences

- **Tests** in `tests/e2e/context.spec.ts` take the context away with `WEBGL_lose_context`.
  The first test checks the notice and its axe scan. The second restores the context and the
  third reloads the stage; each checks that drawing resumes with non-blank pixels and that the
  run's step has not moved.
- **Real phones are not tested.** The tests lose the context on desktop Chromium with
  SwiftShader. A phone's loss may differ, and should be tried once the deploy is live.
- **The scene is kept across a reload,** so a context lost while a fork is open recovers each
  of its stages separately.
