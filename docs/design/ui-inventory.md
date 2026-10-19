# UI inventory

Every screen PaperPlay shows and every element on it: what it is for, and where it is built. The
atlas (`npm run atlas`, ADR-0050) photographs each of these in the states a learner reaches; the
owner's notes on them go in [owner-review.md](owner-review.md). Paths are from the repository's
root. Styles: the HUD's in `packages/ui/src/react/hud.css`, the tokens in `packages/ui/src/tokens.ts`,
the fonts in `packages/ui/src/fonts/fonts.css`.

## Screens

| Route | Screen | What it is for | Built in |
|---|---|---|---|
| `/world/hook` | Murmuration Valley on the game-first shell | The reference world: Reynolds's flocking, six levels | `apps/web/src/hook/HookWorld.tsx`, played as `apps/web/src/worlds/flocking.tsx` |
| `/world/epidemic` | Threshold Town | Kermack and McKendrick's epidemic, five levels, a draft until its source map | `HookWorld.tsx`, `apps/web/src/worlds/epidemic.tsx`, `town-world.tsx` |
| `/world/momentum` | Momentum Valley | The learning family's reference: Sutskever et al.'s momentum, five levels | `HookWorld.tsx`, `apps/web/src/worlds/momentum.tsx`, `landscape-world.tsx` |
| `/world/generated/<id>` | A generated world | A world the pipeline made from a paper, built beforehand, in the public build too | `apps/web/src/worlds/GeneratedWorld.tsx`, the worlds in `fixtures/worldspecs/generated/` |
| `/world/job/<id>` | A job's world | The world a job on this machine just made; development server only | `GeneratedWorld.tsx`, from `GET /api/jobs/<id>/world` |
| `/library` | Library | Every world with its paper, kind, status, levels and picture; linked from every world's title card | `apps/web/src/library/LibraryPage.tsx`, `ThisMachine.tsx`, `library.css`; its index written by `scripts/library.ts`, its pictures by `scripts/library-thumbnails.ts` |
| `/create` | Make a world from a paper | Starts a job from an arXiv id, a PMCID or a PDF and shows its real states as a storyboard; development server only (ADR-0030, ADR-0034) | `apps/web/src/create/CreatePage.tsx`, `create.css` |
| `/world/local` | The lab bench | The flocking primitive with every rule on sliders, a bird to pick and beacons to place: the first slice's page | `apps/web/src/world/LocalWorld.tsx`, `packages/ui/src/react/LabBench.tsx` |
| any other path | Nothing here | Says there is no page at the path and links to the lab bench | `apps/web/src/App.tsx` |
| `/capture.html` | The capture page | What `npm run capture:demo` films, frame by frame; development server only | `apps/web/src/capture/capture.tsx` |

## A world on the game-first shell

The stage fills the screen at all times; everything else sits over it (ADR-0008). Every world above
but the lab bench uses this shell.

| Element | What it is for | Built in |
|---|---|---|
| Stage | Draws the world's states; displays, never computes (CLAUDE.md, boundary 1). Its scene comes from the world's kit: valley (flocking), town (compartments), landscape (learning) | `packages/ui/src/react/WorldStage.tsx`, `packages/ui/src/stage-core/`, `packages/ui/src/three-adapter/kits/` |
| World card | The world's title, a link to the library, the paper it is about, and the family's label where it has one ("miniature: the idea at toy scale") | `HookWorld.tsx` (`.world-card`) |
| Level map | A dot per level, the current one marked; a level opens once the one before has had its control moved through its range | `packages/ui/src/react/LevelMap.tsx` |
| Play, Start again | Run or pause the world; start the level's run again | `HookWorld.tsx` (`.hud-buttons`) |
| Speed | 1×, 2× or 4×; a run stays the same bit for bit at any speed (ADR-0020) | `packages/ui/src/react/SpeedButton.tsx` |
| Journal button | Opens the paper journal | `HookWorld.tsx` |
| Guide | Says what to try and what happened; asks the prediction before a What-if, never scored (ADR-0023); hides and shows again | `packages/ui/src/react/Guide.tsx` |
| Level card | The level: its place ("Level 2 of 5"), title, goal, the one control with its origin chip and "From the paper", its readout, the What if button, the depth toggle, and at Advanced its equation. On a phone it rests collapsed to title, control and readout | `packages/ui/src/react/LevelCard.tsx` |
| Readout | The level's one measured value, its digits in a fixed-width slot | `packages/ui/src/react/Readout.tsx` |
| Depth toggle | Beginner, Intermediate or Advanced: which of the level's elements show (control value, range numbers or words, readout number, equation, analogy) | `packages/ui/src/react/hud-parts.tsx` (`DepthToggle`) |
| What-if card | Says what the other world changes, with buttons to open the fork or put it away | `HookWorld.tsx` (`#what-if`) |
| Fork view | Two worlds from the same moment, one with the What-if: played side by side, the measured difference charted, the result and whether the level's statement held, across 20 starts (ADR-0019) | `packages/ui/src/react/ForkView.tsx`, `DifferenceChart.tsx` |
| Paper journal | Slides over on demand: each level's passage with its section and page, what the world calls it, the depth's words and analogy, further reading; for a generated world, the paper's own numbers run; what the world cannot show; and the legend of origins | `packages/ui/src/react/PaperJournal.tsx` |
| Origin chips | Name where each statement comes from, in words: from the paper (with its anchor), a teaching choice, measured here, or generated (CLAUDE.md, boundary 3) | `packages/ui/src/react/origin.tsx`, `hud-parts.tsx` (`OriginTag`), `OriginLegend` |
| Observation | A generated world's note on what its paper's own numbers show, such as the hepatitis C threshold not appearing at the paper's values | `LevelCard.tsx` (`data-observation`) |

## The lab bench

| Element | What it is for | Built in |
|---|---|---|
| Masthead | The brand, the page's title and the origin legend | `apps/web/src/App.tsx` |
| Stage and its tools | The world, with "Pick a bird" and "Place a beacon" | `LocalWorld.tsx` (`.stage-area`, `.stage-tools`) |
| Playback | Play, step, reset | `LocalWorld.tsx` (`.transport`) |
| This world, Rules of this world | What the world is, and every rule's weight on a slider | `LocalWorld.tsx`, `LabBench.tsx` |
| Measured live state | The primitive's measurements as they change | `LocalWorld.tsx`, `Readout.tsx` |
| Picked bird, Placed in this world, Seed | The picked bird's state, the beacons placed with a way to remove each, and the run's seed | `LocalWorld.tsx` |

## Make a world from a paper

| Element | What it is for | Built in |
|---|---|---|
| Form | An arXiv id with its version, a PMCID, or a PDF from this machine | `CreatePage.tsx` (`.create-form`) |
| Storyboard | The job's seven stages in order, each done, now or waiting, with the job's own messages under each and a repair where it happened; never a timed bar (CLAUDE.md, boundary 6) | `CreatePage.tsx` (`.storyboard`) |
| Ending | Why a job stopped, in its own words, or a link to play the world | `CreatePage.tsx` |

## Library

| Element | What it is for | Built in |
|---|---|---|
| A paper's group | The paper's title, authors, year and venue, with every world made from it | `LibraryPage.tsx` (`.library-paper`) |
| A world's row | Its picture, title linking to it, status chip (Verified, Draft, Generated, each with its meaning), who made it and when, its family, its levels in order, and, for a generated world made before the rule of 2026-10-18, which levels that rule finds definitional | `LibraryPage.tsx` (`.library-world`) |
| Made on this machine | On a development server only: the worlds this machine's API has made since it started | `ThisMachine.tsx`, from `GET /api/jobs` |
