# ADR-0043: Plans from two planners

- Status: accepted. The owner's decision (2026-10-17): the planner stage asks two planners from
  different vendors for a plan each; the deterministic rules choose between them, or take the
  better level for each slot; which planner each kept level came from is recorded. The mechanism is
  mine.
- Date: 2026-10-17
- Decided by: the owner, the rule; me, its form.

## Context

The planner is the stage a world most depends on, and the least steady: its pick changed three
times in two days as its prompt changed (ADR-0035's amendments), and one model's plan can fail
where another's holds.

## Decision

1. **A second planner,** a stage of its own, `second-planner`, picked by the bake-off as the best
   planner from another vendor than the first: glm-5-3 (Z.ai) beside kimi-k2-7-code (Moonshot AI).
   Both are asked at once, on the same prompt.
2. **The rules judge both plans before any words are written.** Each plan is assembled with no
   explainer words and built; the builder, the level rule, the visibility rule and the findings
   check give each level its problems; a level that does not build is judged by that, and the rest
   built without it.
3. **Each slot keeps the better level:** one with no problem over one with problems, then fewer
   problems, then more of the 20 starts holding, and the first planner's on a tie. If the kept levels
   together test too few of the paper's findings, the better whole plan is kept instead. The
   choice, slot by slot with both levels' problems, is the job's `plan-choice` artifact, and its
   event names each level's planner.
4. **Each kept level's planner is recorded,** through repairs (a level the repairing planner changes
   is its own, "in repair") and drops: the job's `plan-sources` artifact.
5. **Optional, and replayable:** a job with no second planner chosen plans as before, so the jobs
   recorded before this replay unchanged. A second planner whose reply the schema cannot read is
   said in the job's events, and the first planner's plan is used alone.
6. **The repairs stay the first planner's,** given the kept plan as its own.

## Consequences

- A job makes one more planner call, run beside the first; the explainer still writes words for one
  plan only.
- A world may hold levels from two models; the job says whose each is.
