# ADR-0021: PaperPlay builds for AI/ML, biomedical and scientific papers

- Status: accepted (direction). The interfaces it needs are proposed in
  `docs/design/every-paper.md`, for the owner's review; no pipeline code until then.
- Date: 2026-10-09
- Decided by: the owner, at the start of the day's sixth session.

## Context

Month one was planned as one mechanism done properly: flocking, on one primitive, with one
hand-authored world and one generated world from a new section of the same paper (G3). The
architecture was called domain-agnostic, but only flocking has ever run through it. The
audit in `docs/design/every-paper.md` finds 69 places in the code that assume flocking (birds,
headings, the torus, the valley, seconds as the only time unit), and three that are already
general.

The owner wants an agentic application that turns papers in three domains into the best
honest experience it can: AI and machine learning, biomedicine, and the sciences. One
flocking world does not reach that goal on its own.

## Decision

1. **The goal is papers in three domains: AI/ML, biomedical and scientific.** The flocking
   world stays as the reference example. The generator imitates it, and is evaluated
   against it.
2. **Primitive families, in the domains' order of need.** Each family is a small set of
   trusted, deterministic, tested primitives with its own checks:
   - **Compartment models, equations as data.** A validated expression tree, never code, run
     by one trusted solver. Every equation is anchored to the paper's own. Generic checks
     cover units, positivity, and any conservation law the paper states. For biomedicine and
     the sciences.
   - **Learning toys, labelled "miniature: the idea at toy scale".** A loss landscape with an
     optimizer, a tiny trainable network, an attention toy, a 2D diffusion toy, a bandit or a
     gridworld. Small pure-JavaScript models only, so training stays deterministic. For AI/ML.
   - **Study design, labelled "a model of how the study was designed, not its data".**
     Randomisation, sample size, effect size and confounding. For empirical biomedical
     papers.
   - **Grids, networks and agents.** Grids cover diffusion and reaction-diffusion; agents
     include flocking, which exists. For the sciences.
3. **Scene kits, chosen by the designer agent from data.** For example: the loss surface as
   the valley's terrain, a town, a bloodstream, a cell, a clinic, a petri dish, an ecosystem.
   A kit declares the entities it draws, their visual forms, its terrain and its readout
   widgets. The renderer still only displays state.
4. **Routing, with three honest tiers:**
   - **A. A family covers the mechanism:** a full, verified world.
   - **B. A new mechanism:** a primitive-builder agent drafts a primitive in a sandbox:
     - a MODEL.md with the equations;
     - oracle fixtures, derived by a separate agent from the paper's equations, not from the
       code;
     - determinism tests.

     It opens a pull request; the owner reviews and merges it. A world on an unmerged
     primitive is never shown as verified.
   - **C. No playable mechanism:** a lighter interactive explainer, clearly labelled as one.
5. **The level rule becomes a pipeline stage** (ADR-0018). Every generated What-if is swept
   across seeds, and repaired or dropped if it fails, before any learner sees it.
6. **Ingest, best source first:**
   - arXiv LaTeX source, for exact equations, in ML and the sciences;
   - PubMed Central open-access XML, for biomedicine;
   - PDF parsing, as the fallback.

   Each source's licence goes into the source register. Paywalled PDFs stay in
   `reference/private/`, quoted only in short passages (ADR-0006).

## Consequences

- **The brief's promise widens,** and so does its audience. The month-one scope changes, and
  "universal paper coverage" stays out of scope: tier C exists because many papers have no
  playable mechanism, and the app says so.
- **The roadmap is re-planned** in `docs/design/every-paper.md` (for the owner's review), then
  in `roadmap.md`:
  - G3 becomes a sequence of steps: generalize, the compartment family and its kit, the
    pipeline on a known family, routing and tier C, the learning family, then the
    primitive-builder agent.
  - G4 evaluates on a fixed set of papers from all three domains, against a single-pass
    baseline.
- **The source map for the Reynolds paper stays G2's blocker.** The flocking world is the
  reference only once its anchors are real.
- **New boundaries need enforcing,** each by a test, not by prose:
  - an expression tree is data and never code;
  - a scene kit draws only state;
  - a world on an unmerged primitive is never labelled verified.
- **Each new family, kit and agent role still needs the owner's approval and an ADR**
  (CLAUDE.md). This ADR sets the direction; it approves no particular family's code.
