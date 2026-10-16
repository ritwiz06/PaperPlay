# ADR-0037: Lessons must be visible and worth learning

- Status: accepted. The owner asked (2026-10-16) for a visibility rule beside the level rule, a
  labelled lens when a quantity is too small for the scene, levels that test the paper's anchored
  findings with the hook on its headline result, a reviewer that flags levels following from a
  definition, shares of a population with their own unit, and summaries a person can feel. The
  thresholds and shapes are mine.
- Date: 2026-10-16
- Decided by: the owner, the rules; me, their numbers and form.

## Context

The first generated world met the level rule on every level, and taught little. Its level 1
measured a compartment near 0.01 of the population on a chart that ran to the whole population,
so the curves lay flat; its claim, that no adherence fills the quit-treatment compartment, follows
from the model's definitions; its readout called shares "people × years".

## Decision

1. **The visibility rule** (`packages/pipeline/src/rule/visibility.ts`), run with the level rule
   at the world's own values; a level that fails either is repaired the same way, at most twice,
   then dropped, and a world keeps at least three levels:
   - **the chart:** the fork's chart axis is fitted to the measured quantity (`chartTopOf`, a
     round number above everything drawn), and the two worlds' curves must part by at least a
     tenth of it (`VISIBLE_SHARE`);
   - **the scene,** for the town kit: at least three figures must differ between the two towns at
     some moment (`VISIBLE_FIGURES`), counted by the town kit's own rule of largest remainders;
   - **a lens,** when the 120 figures cannot show the quantity: only the measured compartment is
     drawn, each figure a round amount chosen so the largest amount is about 60 figures
     (`LENS_FIGURES`); a level the lens cannot show either fails. The lens is a teaching choice,
     said beside the readout and in the fork: "Through a lens: only … are drawn, each figure
     standing for …".

   The shell draws its chart's axis and the town's lens from the same functions, so what is
   checked is what is drawn. The town kit's figure count stays in the stage core, which may import
   no runtime code; the pipeline keeps a copy, and `scripts/test/town-figures.test.ts` holds the
   two equal.
2. **Shares of a population** (every compartment without a unit, each starting between none and
   all, together no more than the whole: the hepatitis C paper's start at 0.825) are shown as
   people in a town of 10,000 (`SHARE_TOWN`), a teaching choice said under the readout; the
   measurements stay the model's own.
3. **Summaries a person can feel:** `peak` and `mean` join `at`, `first-reach`, `lowest` and
   `total` in `worldspec/3`'s contract.
4. **Findings, not definitions,** landing with the prompts and the bake-off's run on them:
   - **the reader** gives the paper's headline result and its findings (results, thresholds,
     conclusions), each quoted;
   - **the planner** names, for each level, the finding it tests; the hook tests the headline. It
     is told the visibility rule, to prefer the peak, a value at a time, a time to a threshold or
     the mean, and what share values mean;
   - **the findings check** (`rule/findings.ts`), deterministic, beside the two rules: the hook on
     the headline result, at least three levels on findings whose quotes the source holds, and a
     total over time only where the level's finding is about a total; a level that fails is
     repaired like any other;
   - **the reviewer** names each finding's kind; a level it finds definitional, blocking, is sent
     back to the planner, within the job's two repairs, or dropped when three levels remain, or
     the job goes to the owner;
   - **the transcriber** gives share units for compartments that are shares of a population.
5. **The first generated world is kept as made, not replayed.** Under the visibility rule its
   job's level 5 fails, so the job takes a path its recordings never saw. Its world stays, at
   `/world/generated/pmc-PMC12334037`, and a test holds it as made: every level meets the level
   rule, three need a lens, and level 5 shows nothing. The regenerated world takes its place in the
   replay tests.

## Consequences

- Threshold Town shows every difference as it is, with no lens; its fork's axis is now fitted to
  the measured compartment instead of the whole town.
- A level whose lesson is that something barely matters cannot pass; such a lesson belongs in a
  level's words, not its What-if.
- The lens is drawn per level: a world's levels can differ in what their towns show.
