# ADR-0008: A game-first interface

- Status: accepted
- Date: 2026-10-09
- Decided by: the owner, on 2026-10-09, before G2's interface work. The mapping of each
  guarantee to its new element, and the readings marked "my reading" below, were written
  while recording the decision. They are for the owner to review.
- Supersedes: parts of the build brief (§1.3, §6.1, §6.2, §6.4 and §7 G2.4, listed below)
  and item 8 of ADR-0007.

## Context

The brief's §6.1 surrounds the stage with permanent regions:
- the evidence rail and navigation on the left;
- the path ribbon on top;
- the lab bench on the right;
- the caption strip below.

G1 built part of it at `/world/local`: the stage with a bench column beside it and the
legend in a masthead. Played, it reads as a dashboard. The world is one panel among several,
and a learner reads before they play.

PaperPlay should feel like a game. The world fills the screen, the HUD is minimal, and
understanding comes from playing. The owner's visual reference for this is
`reference/outbreak-island.html`, with its chunky HUD cards, playful type and world-first
layout. It was copied there from the owner's Downloads folder on 2026-10-09.

The reference shows the feel. It is not a spec, and it is not to be copied.

## Decision

Every guarantee stays. Only how each one appears changes.

### The elements

1. **The stage is full-screen at all times,** on every world screen. There are no permanent
   side columns; everything else lies over the stage or slides over it on demand.
2. **The level card,** at the bottom, holds four things and no more:
   - the level's title;
   - a one-sentence goal;
   - the level's one control, with its origin chip and its "From the paper" tap;
   - a "What if" button, which opens the level's counterfactual.

   The depth toggle sits in it too. The level's observable shows there as a live readout,
   labelled as a computed observation (my reading: the owner's list leaves readouts out,
   and the guide needs a number to point at).
3. **The guide** replaces the caption strip. It says one or two sentences about what the
   learner just did. The sentences are built from the level's caption and observable, which
   are WorldSpec data, so nothing is free text written at runtime. Each sentence carries
   its own origin chip.
4. **The paper journal** replaces the evidence rail.
   - It is a slide-over, opened on demand.
   - A level's passage unlocks when the learner reaches that level.
   - Every control has a "From the paper" tap that opens the journal at its passage,
     highlighted. Tapping a passage closes the journal, on a narrow screen, and focuses its
     control.
   - A control with no anchor says so instead ("Not from the paper: chosen to help you
     learn"). It never points at a passage it does not have.
   - The origin legend lives here, with the depth toggle.
5. **The level map** replaces the path ribbon. It is compact and sits at the top.
   - Visited levels can be entered again.
   - The next level opens once the learner has moved the level's control through its
     range, as in §6.2: having touched, not having succeeded.
6. **Depth** is a small Beginner / Intermediate / Advanced toggle, in the level card and in
   the journal. There are still three variants, and the choice still persists per learner.
   At Advanced, equations appear in the journal and the level card, rather than sliding in
   from the caption strip.
7. **The fork is split-screen:** two synchronized worlds, with the same seed and the same
   events, and the counterfactual's parameters on one side. One measured difference sits
   between them. Closing the fork returns to one world.
8. **Origin labels are small colour chips.**
   - Each chip names its origin in words, never by colour alone.
   - Each chip's full meaning is its tooltip and its accessible description.
   - The legend lives in the journal.

### What carries each guarantee now

| Guarantee | Before (brief §6) | Now |
|---|---|---|
| Every displayed statement has an origin label (R05) | Chips, with one legend always on screen | Chips that name their origin in words; the legend in the journal, one tap away |
| Paper-derived statements carry an anchor (R05) | Passages in the evidence rail | Passages in the journal, unlocked level by level |
| Two-way provenance (R05) | Focusing a control highlights its passage in the rail; clicking a passage focuses its control; tethers drawn between them | "From the paper" on every anchored control opens the journal at its passage, highlighted. While the journal is open, focusing a control highlights its passage. Tapping a passage focuses its control |
| Hook first (R06) | Path ribbon | Level map, which starts at the hook |
| One manipulable and one counterfactual per level (R06) | Lab bench and fork button | The level card's one control and its "What if" button |
| Three depth variants (R06) | Depth dial in the caption strip | Depth toggle in the level card and the journal |
| Fork with synchronized worlds (R06) | ForkView splits the stage | Split-screen, two synchronized worlds, one measured difference between them |
| Guided exploration that never scores (R06) | A side sheet | Inside the guide: predict, intervene, observe, explain (my reading: the owner's list does not place it, and there are no side columns) |
| No scoring | No scores or badges | Still none. Game feel comes from the world, the HUD's look and the level map. There are no points, stars, streaks, timers, win screens or congratulations for a "right" answer |

### What it supersedes

- **Brief §1, non-negotiable 3:** "one legend, always visible". The legend is in the
  journal now. Chips carry their origin in words, so none depends on the legend to be read.
- **Brief §6.1, "The world is the interface":**
  - the lab bench beside the stage;
  - the evidence rail;
  - the path ribbon across the top;
  - the tethers as the one bold moment;
  - the layout diagram;
  - "on mobile the rail and bench become bottom sheets".

  The tethers' link survives as the two taps in the table above. Where the boldness goes
  instead is left to the G2 build. The spike tries the moment a passage unlocks in the
  journal.
- **Brief §6.2:**
  - PathRibbon becomes the level map;
  - LabBench becomes the level card, and "Rules of this world" leaves level screens, since a
    level shows its one control;
  - EvidenceRail becomes the paper journal;
  - CaptionStrip becomes the guide;
  - DepthDial becomes the depth toggle;
  - ForkView becomes split-screen;
  - GuidedExploration moves into the guide.
- **Brief §6.4:** "`prefers-reduced-motion` disables tethers/pulses" now covers the
  journal's slide, the unlock moment and any pulse. R12's wording still says "tethers", and
  this is what it means now.
- **Brief §7, G2 step 4:** renamed in the roadmap to the elements above.
- **ADR-0007, item 8:** the legend leaves the masthead on world screens.
  - `/world/local` keeps its G1 layout until the shell exists.
  - Then it moves into the shell as the free sandbox, with its four rules in a sheet.

### What stays as it was

- The palette and its roles.
- ADR-0002's type:
  - Fredoka 400 and 600 for the interface. The reference's 700 is not adopted; adding it
    would change ADR-0002.
  - Literata 400 for passages, which now appear in the journal.
- §6.3's anti-patterns, including "text over the canvas that blocks interaction". The HUD
  now lies over the stage, so this matters more:
  - HUD cards stay compact;
  - only the cards catch the pointer;
  - the field stays reachable around them.
- §6.4's floor: 360 px, visible focus, AA contrast, labelled controls and an axe scan.
- The create flow, library and runs pages. They are pages, not world screens.

### What is taken from the reference, and what is not

- **Taken:**
  - cards with a 2 px ink edge, generous corners and a hard offset shadow with no blur;
  - chunky buttons that press in;
  - a world name and its source in a card at the top left;
  - a compact level map at the top;
  - the level card at the bottom centre.
- **Not taken:**
  - Fredoka 700;
  - fonts and scripts from CDNs, since self-hosting stays (ADR-0002);
  - colours outside the palette;
  - toasts that congratulate an outcome ("You found the threshold"), which read as success
    conditions;
  - a "Next level" button that waits for an outcome.

The HUD cards share an edge and a shadow, but differ in shape, size and role, so they never
form a grid of identical cards (§6.3).

## Consequences

- **The roadmap:** G2's interface items are renamed to the level card, the guide, the paper
  journal, the level map, the depth toggle and the split-screen fork.
- **R05 and R06** are reworded to these elements. R05 gains a rule for controls with no
  passage. Neither says less than before.
- **The spike:** a design spike at `/world/hook` tests the look and the layout with
  hard-coded content before the shell is built properly.
- **The stage's camera fit** must allow for the HUD: the field has to stay visible between
  the level map and the level card on a phone.
- **The masthead and its legend stay on `/world/local`** until that page moves into the
  shell. Its R04 tests are unaffected.
