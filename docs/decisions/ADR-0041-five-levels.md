# ADR-0041: Five levels, and the hook never dropped

- Status: accepted. The owner's decisions (2026-10-16): the planner asks for five levels; a world
  keeps at least three; the hook is never dropped, and follows ADR-0040's rule; any other level
  that fails its repair is dropped, the reason recorded in the job; and in a repair the planner
  sees its control's row of the response table. The mechanisms are mine.
- Date: 2026-10-16
- Decided by: the owner.

## Context

The tuberculosis job planned three levels, the fewest a world keeps, so one level that failed its
repair ended a job that was otherwise sound (ADR-0037's amendment). The hepatitis C planner, told
only a level's measurement, chose a What-if the model barely notices, round after round.

## Decision

1. **The planner asks for five levels.** Its schema still reads three to six, so a plan of four is
   read, not refused; the prompt asks for five.
2. **The hook is never dropped.** When level 1 still fails after the job's two repairs, through the
   builder, the level rule, the visibility rule, the findings check or the reviewer:
   - if running the paper's own numbers confirmed that the headline does not appear at the paper's
     values (ADR-0040), the first passing level on an anchored finding takes its place, the one on
     the lowest-numbered finding, and level 1 says why, as a computed observation: "The paper's
     headline does not appear in this world at the values it lists, and its direction does not
     show here either, so this level tests another of its findings: …". The page of the paper's
     own numbers says it too, and the findings check holds level 1 to that finding;
   - otherwise the job stops, naming the hook and why.
3. **Any other failing level is dropped,** when no repair is left, if three levels remain. Each
   dropped level is kept in the job's `dropped` artifact, with its place, its title and its reasons,
   and the job's event names them.
4. **A repair shows the planner its level's response:** each failing level's control, and its
   What-if's parameter when another, halved and doubled, as solved, from the same table the
   planner's first prompt holds.
5. **The planner is told the paper's own numbers:** their summary in every plan, and, when the
   mismatch is confirmed, that level 1 tests the headline's direction and must never claim its
   threshold, with the observation the world will state.
6. **The bake-off plans on the picked set:** the tuberculosis paper on its Ethiopian fit, as a job
   does, where it had planned on the synthetic example; and with the paper's own numbers, as a job
   is given them.

## Consequences

- A prompt change voids the planners' recordings, so the planning bake-off ran again on these
  prompts, and the jobs recorded under the old ones are kept as records, not replayed.
- A world can have three, four or five levels; level 1 is always the headline's, or, after a
  confirmed mismatch, the paper's first finding the model shows.
- **A job's token budget is 1,200,000** (`apps/api/models.json`), where it was 600,000 for three
  levels. Five levels mean five explainer calls a round, each carrying the paper's passages: the
  tuberculosis job spent 429,258 tokens on 14 explainer calls and stopped at 604,060 before its
  last round; a whole five-level job with its two repairs takes about 750,000.
- **What the jobs showed** (`fixtures/jobs/*-2026-10-17-*.json`): on five levels, with the paper's
  own numbers and the response in every repair, both papers' worlds had every level meet the level
  rule, the visibility rule and the findings check within one repair.
  - With gemma4-31b-it reviewing, both went to the owner: it found levels definitional, rightly
    once (hepatitis C's level 5: raising the quitting rate fills the quit compartment) and often
    not (on tuberculosis, every level left, the paper's own finding that faster treatment lowers
    the infectious among them). Kept as records.
  - With glm-5-3 reviewing, the pick once the reviewers' world held levels with no fault, both are
    ready (`fixtures/worldspecs/generated/pmc-PMC12334037-2026-10-17.json`, `arxiv-2506.19869v1.json`):
    hepatitis C's level 1 tests the headline's direction and says why its threshold does not
    appear; glm-5-3 blocked nothing there, and let through the level gemma4-31b-it rightly called
    definitional; on tuberculosis its one blocking finding, that level 2's words imply a mechanism
    the model lacks, is advice, as the checks decide.
  - So whether a level is definitional rests on which model reviews it. What counts as
    definitional, and whether a reviewer's "unsupported" should send a level back, are the owner's
    to settle.
