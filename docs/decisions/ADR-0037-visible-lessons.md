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
   rule, three need a lens, and level 5 shows nothing. The regeneration's job, which fails (see the
   amendment), takes its place in the replay tests.

## Amendment, 2026-10-16: what regenerating the hepatitis C world needed

Running the hepatitis C paper through the job under these rules failed at each step in turn; each
fix is deterministic, or tells a model what the solver measures:

1. **The explainer writes one level per call,** held by the schema where the model honours one.
   gemma4-31b-it, writing a whole world in plain JSON, nested a level's guide inside another
   field; held by the schema for a whole world, it once wrote whitespace until its limit. One level
   at a time it wrote every level whole. A guide line that writes the What-if's value where `{to}`
   belongs ("raised to 0.6") has its value put back as `{to}` (`mendTo`), since the value is shown
   by the shell.
2. **The assembler fills what a plan leaves out:** a difference read `at` no time is read at the
   level's own time; a What-if outside its parameter's range widens the range to hold it (a
   parameter's range is a teaching choice); and when a level's time would take longer than 20
   seconds at the fastest speed, the world's pace is raised to fit, said in its notes. Before, the
   planner traded one level's time against the watching bound and the visibility rule, repair
   after repair.
3. **The planner sees how the model responds** (`describeResponse`): each rate halved and
   doubled, solved, and every compartment whose peak, or whose end where it is visible, moves by
   15% or more. A repair message says what the world measures at its own values, so a claim can
   be aimed. Without them the planner chose What-ifs the model barely notices.
4. **Recorded jobs replay** (`apps/api/test/recorded-jobs.test.ts`): a job record in
   `fixtures/jobs/` marked `replays` runs again from its recordings to the same world, or the same
   ending, in the gate.
5. **A guide line's value, wherever the model put it:** the shell reads a "to" written before
   `{to}` as the one the value brings, so "adherence to {to}, so" reads "adherence to 0.61, so", and
   "adherence, so" at Beginner, where it read "to , so" in the first generated world too; the
   explainer's mend also reads a value named in at most four words before the clause's comma ("to
   fast treatment, so"), which qwen36-27b wrote twice and failed a job on.

### The outcome: neither paper makes a world under these rules

Both jobs are recorded and replay to their endings (`fixtures/jobs/`):

- **Hepatitis C fails on its headline.** The paper's headline is that "an adherence level
  exceeding 52% causes the reproduction number to drop below 1". At the values of its own Table 1,
  its equation (7) gives a reproduction number of 0.76 at the table's adherence of 0.5, and between
  0.65 and 0.78 for every adherence from none to all: below 1 throughout, and barely moved by
  adherence. The 52% threshold of its Figure 7 must come from values the paper does not state. So at
  the world's values adherence moves nothing visibly but the quit-treatment compartment, whose
  emptying at full adherence is definitional. The planner tried 0.6 on the quitters (too small to
  see), full adherence on the quitters (the reviewer blocks it as definitional), and 0.6 on the
  acutely infected (too small), and the repairs ran out. Full adherence on the acutely infected,
  a peak lower by a fifth, would meet every rule; no round tried it. The first generated world is
  kept as made, at its path.
- **Tuberculosis picks its set and fails in planning.** Both transcriptions list the synthetic and
  the Ethiopian sets, the rule picks the Ethiopian fit, and they agree on it, values included
  (ADR-0036). The planner gives three levels, the fewest a world keeps; the reviewer sends level 2
  back as repeating level 1, and its repair no longer meets the level rule, so no level can be
  dropped.

Whether the hook may test the headline's direction where its threshold does not hold at the
paper's values, or fall to another anchored finding with the reason said on screen, is the
owner's; so is whether a plan should hold more levels than the fewest a world keeps.

## Consequences

- Threshold Town shows every difference as it is, with no lens; its fork's axis is now fitted to
  the measured compartment instead of the whole town.
- A level whose lesson is that something barely matters cannot pass; such a lesson belongs in a
  level's words, not its What-if.
- The lens is drawn per level: a world's levels can differ in what their towns show.
