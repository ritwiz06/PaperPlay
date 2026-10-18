# ADR-0046: G3b's decisions, and the learning family's reference world

- Status: accepted. The owner's decisions (2026-10-17) on the seven questions of
  `docs/design/g3b.md`, and the reference pattern kept for the learning family. How each is held is
  mine.
- Date: 2026-10-17
- Decided by: the owner.

## Context

`docs/design/g3b.md` planned G3b, routing across families, the explainer tier and a learning family,
and left seven decisions to the owner.

## Decision

1. **Update rules as data.** A paper's algorithm becomes an `OptimizerSpec`: its state, its update
   equations in the expression grammar `ModelSpec` uses, its hyperparameters with their anchors;
   one trusted interpreter runs any of them.
2. **The attention toy waits until after G4.**
3. **Adam** from arXiv 1412.6980's LaTeX source (anchors and short quotes only). Reddi, Kale and
   Kumar 2018 ("On the convergence of Adam and beyond") is a possible bonus level, beyond the paper,
   labelled as such.
4. **Dropout** from Srivastava et al. 2014, JMLR. The world shows the paper's own p, the
   keep-probability: "share of units kept" at Beginner; the journal notes that today's libraries
   set the drop rate instead.
5. **G3b's gate is Adam alone,** through the pipeline; Dropout follows.
6. **Tier C now, minimal:** the explainer page in G3b, at its smallest.
7. **The level rule for learning toys:** 20 starts, at least 16 holding. Where a toy has real
   randomness the starts are seeds; where it has none, the starts move the hyperparameters and the
   starting point by up to ±10%, as compartment worlds move their parameters.
8. **The reference pattern is kept.** A momentum world is authored by hand as the learning family's
   reference, from Sutskever, Martens, Dahl and Hinton 2013 ("On the importance of initialization
   and momentum in deep learning", ICML, open access), as the flocking world is the reference for
   the generator. Adam is the first generated world, and held out: it is not shown to the planner or
   the explainer as an example.

## Consequences

- G3b's first step, the learning family, the landscape kit and the momentum world, is ADR-0047.
- **How decision 7 is held:** a family whose toys may or may not draw on chance names its
  variation without chance, `FAMILIES.learning.variationWithoutChance`, "neighbourhood"; a primitive
  says whether it draws on its seed (`chance`); the built world carries the variation the level rule
  uses (`BuiltWorld.variation`). learning.landscape has no chance in it, so the momentum world's 20
  starts move its hyperparameters and its starting point within a tenth, and a level's statement is
  checked as a compartment world's is. A toy with noise in its gradient, or dropout's masks, will
  run on seeds 1 to 20.
- G3b's effort is the smaller plan's, 29–43 h, plus tier C's minimal page and the momentum world.
