# ADR-0047: The learning family, the landscape kit, and Momentum Valley

- Status: accepted. The owner's instruction (2026-10-17): G3b's first step is the learning family
  (update rules as data, pure deterministic JS, oracles by hand first: plain gradient descent on a
  quadratic, momentum's known behaviour), the landscape kit (the loss surface as terrain, two balls
  in the fork, the miniature label at every depth), and a hand-authored momentum world meeting the
  level and visibility rules. The forms are mine.
- Date: 2026-10-17
- Decided by: the owner, the step; me, its forms.

## Context

ADR-0046 records the owner's G3b decisions: update rules as data, the level rule's variation for a
toy without chance, and a momentum world from Sutskever et al. 2013 as the family's reference.

## Decision

1. **Update rules as data,** `OptimizerSpec` (`packages/contracts/src/learning.ts`): the state the
   rule keeps for each coordinate, the position among it; its hyperparameters, as a model's
   parameters are written; where the gradient is taken, an expression of the state, so Nesterov's
   lookahead is data, not code; and the update's lines in order, each reading what the lines before
   it gave in the same step, as an algorithm is written. `g` and `t`, the gradient and the step's
   number, are reserved. Names must resolve, a state is updated at most once a step, and the position
   must move.
2. **One trusted primitive,** `learning.landscape@1.0.0` (`packages/primitives/src/learning/`, specified
   in its `MODEL.md`), registered as a solver, as compartments.ode is: it binds any `DescentSpec`, an
   update rule on a surface. The surface is a quadratic over the plane, from a closed list the
   primitive differentiates exactly. Float64, fixed order, no chance, no clock; a non-finite value is
   refused at its step. Each solver refuses the other's kind of model with a RangeError, as a model
   that cannot run is refused.
3. **Time in steps:** `TimeUnit` gains "step"; a compartment model keeps the six units it had
   (`ModelTimeUnit`), so the transcriber's schema, and every recording made with it, is unchanged.
4. **Its oracles, derived by hand** (`fixtures/oracles/learning.landscape/`): plain descent's closed
   form on f = ½(x² + 10y²) and its stability limit ε·h < 2; the first four steps of classical
   momentum and of Nesterov's method on f = ½x²; momentum's terminal velocity on an incline, ε·c/(1 −
   μ), ten times a plain step at μ = 0.9; momentum's stability limit ε·h < 2(1 + μ); and bit-for-bit
   replay. Every one passed on its first run.
5. **The family's check:** a run stays finite over its level's time, or the world does not build.
6. **The landscape kit,** in three halves (`packages/ui/src/*/kits/landscape/`): the surface as
   terrain, its height the square root of the loss's rise, so a steep wall and a gentle floor both
   show, said in the kit's disclosures; a ball where the optimizer stands and its trail; in a fork,
   both worlds' balls on the one surface in each pane, this world's cream and the What-if's orange
   with a dark ring, each 3:1 against all of the terrain. A world's `forkInput` gives a pane both
   worlds' inputs. The visibility rule's scene measure for the kit: the two balls at least a
   twentieth of the surface's width apart at some moment.
7. **The miniature label at every depth:** the family's label, "miniature: the idea at toy scale", is
   on the world card and on the level card, on a row of its own at every depth and on a phone, as
   well as first on the journal's page of what the world cannot show.
8. **Momentum Valley** (`scripts/fixtures/momentum.ts`, written to
   `fixtures/worldspecs/sutskever-2013-momentum.json`, at `/world/momentum`): one rule, momentum with
   a lookahead λ, classical at 0 and Nesterov's at 1, as the paper's equations 1 to 4 write them, on
   an oblong bowl like the paper's own two-dimensional example. Five levels: momentum crosses the
   valley (no momentum is slower); speed builds up (halving the momentum shortens the longest step);
   ringing on the steep walls (Nesterov's lookahead shortens the path); too much momentum (0.99
   settles later); momentum must be tuned (momentum added to a big step raises the mean loss). Each
   holds on 19 or 20 of its 20 starts, its chart's curves part by 19% to 60%, and its balls by 9% to
   41% of the surface's width (`eval/sweeps/levels-sutskever-2013.md`). Its anchors come from its
   source map, `fixtures/papers/momentum/source-map.json`, 11 claims located in the paper's open copy
   on PMLR (copyright the authors and PMLR, free to read; anchors and short quotes only, its text not
   kept) by ADR-0045's `sources:map`, and the world is reviewed. The PDF's equations come out of its
   fonts garbled (θ as "✓"), so the update rule is anchored to the prose that states it, not to
   equations 1 to 4 themselves.

## Consequences

- A second family, and a second kind of world in the shell: `HookWorld` takes the world's variation,
  the family's label and a kit's fork input from the world, not from the compartment family.
- Adam's world can be generated on this family once the pipeline's transcriber reads algorithms.
- A unit that is a pure number, as a loss is, is written as none, not as "dimensionless".
