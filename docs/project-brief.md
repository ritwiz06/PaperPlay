# PaperPlay project brief

PaperPlay turns a research paper into a world you can play with. The paper is the
storyline. Each level lets you change one thing, fork into one "what if the authors
had…" alternative, and see the passage in the paper that every control came from.

It is built for papers in three domains: AI and machine learning, biomedicine, and the
sciences (ADR-0021). For each paper it makes the best honest experience it can, and says
which kind it made.

## Who it is for

- A curious beginner who has never read a research paper.
- A graduate student who has read this one and wants to poke at its mechanism.
- In particular, readers of:
  - AI/ML papers, such as an optimizer or a regulariser;
  - biomedical papers, such as an epidemic model, a gene circuit or a clinical trial;
  - scientific papers, such as pattern formation or a network.

## What it promises, and what it does not

- A learning sandbox: predict, intervene, observe, explain. A prediction is a prompt
  for thinking, never a graded answer.
- Not a simulation of the study. There are no scores, badges or win conditions, and no
  claim that a world reproduces the authors' results.
- Every displayed statement says where it comes from: paper-derived (with an anchor
  into the source), teaching choice, computed observation, or generated inference.
- **Every world says which of three kinds it is (ADR-0021):**
  - **A verified world.** A trusted, tested model family covers the paper's mechanism,
    and every check passed.
  - **A world on a new model, not yet verified.** A model was drafted for this paper and
    is waiting for the owner's review. It is never shown as verified.
  - **An interactive explainer.** The paper has no mechanism that can be played honestly,
    so it gets something lighter, labelled as such.
- **Two labels are never left off:**
  - a learning toy is labelled "miniature: the idea at toy scale";
  - a study-design world is labelled "a model of how the study was designed, not its
    data".

## How a world gets made

1. **Ingest.** The pipeline reads the paper from its best available source:
   - arXiv LaTeX source, which holds the exact equations;
   - then PubMed Central open-access XML;
   - then the PDF.

   The source's licence goes into the source register.
2. **Route.** A router decides whether a known family of models covers the paper's
   mechanism.
3. **Plan.** Agents read the paper and propose a `WorldSpec`: structured data, never code.
   - A model can be an expression tree of the paper's own equations, run by one trusted
     solver.
   - A designer picks a scene kit to draw the world in.
4. **Build and check.** A deterministic builder assembles the world from a registry of
   tested scientific primitives. Independent checks decide what is released:
   - schema, bindings, oracles, replay and render invariance;
   - every What-if swept across seeds.
5. **Review and repair.** A semantic reviewer may suggest scoped repairs but cannot
   overturn a failed check. The controller allows at most two repairs per change before
   keeping the last working world.

## Month one

One mechanism, done properly, as the reference every later world is measured against:
- local collective motion (flocking), through the primitive `flock.planar.weighted`;
- the Murmuration Valley prototype (`reference/murmuration-valley.html`) as the visual
  direction for the world;
- Outbreak Island (`reference/outbreak-island.html`) for its game-first HUD (ADR-0008).

Then the generalization the plan in `docs/design/every-paper.md` sets out: the first
family beyond flocking, and the pipeline on it.

Out of scope for month one:
- universal paper coverage: some papers get an explainer, and say so;
- running generated code outside the sandboxed widget tier;
- reproducing original experiments;
- billing and teams;
- more than one model provider;
- photorealism, VR or multiplayer;
- the productization stack, which is planned for after G5 (see ADR-0001).

## What success looks like at the end of month one

- **G2:** a hand-authored flocking world, playable end to end with evidence, depth levels,
  forks and replay.
- **G3:** the architecture generalized beyond flocking, with a second family of models and
  its scene kit, and generated worlds that are honest when they fail.
- **G4:** a frozen evaluation protocol on a fixed set of papers from all three domains,
  with every raw attempt kept and an honest comparison with a single-pass baseline. A clean
  negative result counts.
- **G5:** a clean-checkout reproduction, and a report that separates what is generated,
  what is trusted and what is decorative.

## Where things live

- Build brief: `docs/BUILD_PROMPT.md`
- Standing instructions: `CLAUDE.md`
- Gates, tags and effort: `docs/roadmap.md`
- Requirements and their evidence: `docs/requirements.md`
- Current state: `docs/status.md`
- Decisions: `docs/decisions/`
- The plan for every paper: `docs/design/every-paper.md` (for the owner's review)
- Session notes: `docs/sessions/`
