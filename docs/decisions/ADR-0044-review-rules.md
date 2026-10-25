# ADR-0044: What counts as definitional, held by code

- Status: accepted, amended 2026-10-18 by the owner (below): definitional corrected, the earlier
  exemption of a peak withdrawn; an unsupported block standing from one reviewer, checked by code
  where the model can check it; a reviewer never the model that planned or wrote what it reviews.
  Accepted at first, the owner's rules of 2026-10-17: a deterministic direct-effect tag given to
  reviewers as evidence; a definitional block naming the equation term it follows from, checked by
  code, ignored and recorded when it names none; a block standing only when a second reviewer from
  another vendor agrees; a direct effect on an emergent summary never definitional; hepatitis C's
  level 5 a true fault and the tuberculosis findings levels true non-faults in the reviewers'
  bake-off, with every reviewer mistake a live run reveals kept there; a reviewer's "unsupported"
  sent back to the explainer as a scoped wording repair, the level dropped if it survives. The
  mechanisms are mine.
- Date: 2026-10-17; the regenerations and the amendment 2026-10-18
- Decided by: the owner, the rules; me, how they are held.

## Context

On 2026-10-17 one reviewer blocked most levels of two worlds as definitional, among them levels
testing what the papers themselves report, and another blocked none. Nothing but the reviewer's
word stood behind a block, and a block decided a job (ADR-0041's consequences).

## Decision

1. **The direct-effect tag** (`packages/pipeline/src/rule/direct.ts`): for each level, whether its
   control appears in the measured compartment's own equation, read from that equation's exact
   expansion, and with which sign: the sign of the equation's derivative in the control at the
   paper's values, for each product of compartments it multiplies (δ(1 − θ)c adds to cQ while θ is
   below one, though its expansion holds −δθc). The reviewers are given the model's equations in
   its ids and every level's tag.
2. **A definitional block names its term.** The reviewer's finding gains `term`, written in the
   model's ids as the equations are. Code parses it with the transcriber's formula grammar and
   expands it: every monomial must be one of the measured compartment's equation, and one must
   hold the control. A block naming no such term is ignored, its reason recorded.
3. **Emergent summaries are never definitional:** a level measuring a peak, a lowest value, a time
   to a level or a final size (a value at the end of its run). A block there is ignored and
   recorded, whatever its term.
4. **Two reviewers of different vendors,** a stage of its own, `second-reviewer`, run beside the
   first on the same prompt. A block stands only where both make a valid block of the same kind
   on the same level. A job with no second reviewer chosen lets a lone reviewer's valid block
   stand, so the rule degrades to one reviewer rather than to none.
5. **What a standing block does:**
   - definitional: as before, the planner changes the level (a scoped repair), and after the
     repairs the level is dropped, the hook never (ADR-0041);
   - unsupported, the level's words misdescribing the model: the explainer writes that level's
     words, goal and effect again, once, given the reviewers' findings and the equations; if the
     block stands again, the level is dropped;
   - overstated and other: advice only, as before; the checks decide.
6. **Every decision kept:** the job's `review-decisions` artifact lists each finding of each
   review pass, whether it was valid, whether it stood, and why; the job's events say each block
   that did not stand.
7. **The reviewers' bake-off reads cases from data,** `eval/bakeoff/review-cases.json`: the planted
   tuberculosis world; the tuberculosis world of 2026-10-17, whose levels on the paper's findings
   are clean; the hepatitis C world of 2026-10-17, whose level 5 is a definitional fault. Each case
   says where it came from. A reviewer is given each world as a job gives it, with the equations
   and the tags; a definitional fault counts as found only with a valid term. Every reviewer
   mistake a live run reveals is added there and kept.

## The bake-off, on these rules

Eleven reviewers read the three case worlds (`eval/models.md`). Six tie at the top: three of the four
faults blocked, no clean level blocked, every definitional term they named valid, no failed check
called acceptable. All six miss hepatitis C's level 5, as the tag tells them to (below). glm-5-3
(Z.ai) stays the reviewer; kimi-k2-7-code (Moonshot AI), the best from another vendor, is the second.
All six also block the tuberculosis world's level 2 as unsupported: its goal says raising the contact
rate makes people "leave the protected vaccinated group", which no term of dv/dt does. That level is
unscored in the cases; if the owner agrees it is a fault, it becomes one.

## The worlds regenerated under these rules (2026-10-18)

- **Hepatitis C** (`fixtures/worldspecs/generated/pmc-PMC12334037-2026-10-18.json`): on the first
  plans glm-5-3 had 4 of 5 levels meeting the rules and kimi-k2-7-code none, so every slot is glm-5-3's;
  kimi-k2-7-code repaired level 1. Every level differs from the world of 2026-10-17. kimi-k2-7-code
  blocked level 3, whose words call the share η a rate; glm-5-3 made it advice, so the block did not
  stand, and the world is ready with those words. Its level 5, fewer quitters giving a lower
  quitters' peak, is the ruled fault turned round, and no reviewer blocked it. Both are now cases.
- **Tuberculosis** (`fixtures/worldspecs/generated/arxiv-2506.19869v1-2026-10-18.json`): the plans
  tied at 4 of 5, so kimi-k2-7-code's was kept, the same plan as on 2026-10-17, with the same repair to
  level 5. Both reviewers blocked level 2 as unsupported: "how fast people leave the protected
  vaccinated group", which no term of dv/dt does. The explainer wrote its words again, "watch the
  vaccinated peak fall because more susceptibles are infected before they can be vaccinated", and
  nothing blocked on the second reading. Every other level is as it was.
- **Two fixes the runs needed:** an explainer reply that ran out of room before it wrote anything
  is now asked again with twice the room (`moreRoom`, for the explainer only, so calls recorded
  without it replay as they were); and a rewritten goal and effect are bounded in words and must end
  a sentence, after a character limit in the schema let a constrained reply stop mid-word ("The
  vaccinated group's o"). The two failed runs are not kept as records.
- After the hepatitis C world's misses joined the cases, the bake-off ran again: glm-5-3 and
  kimi-k2-7-code stay the reviewers, each now blocking 4 of 6 faults; in the bake-off glm-5-3 does
  block hepatitis C's level 3.

## Consequences

- A job makes one more reviewer call, beside the first.
- The reviewer's prompt changed, so the jobs recorded before this no longer replay their reviews:
  they are kept as records, and the regenerated jobs replay instead.
- **A conflict to settle:** hepatitis C's level 5 measures the quitters' peak, an emergent summary.
  Rule 3 says a block there is never definitional, and the controller ignores it; the bake-off
  scores it as a fault, as the owner ruled, so a reviewer that obeys the tag misses it, and the
  regenerated world ships its mirror image. Which rule gives way is the owner's.
- **A cost of agreement:** a block stands only where both reviewers make it, so one reviewer's
  right block is lost when the other errs, as hepatitis C's level 3 shows. Whether an unsupported
  block, which only rewrites words, should need one reviewer is the owner's.
- kimi-k2-7-code is the planner, the explainer and the second reviewer: it reviews words it wrote.

## Amendment, 2026-10-18: definitional corrected, one reviewer's unsupported block, independent reviewers

The owner's corrections, of 2026-10-18; the mechanisms are mine.

1. **Definitional, corrected.** A level is definitional when its control appears directly in the
   measured compartment's own equation and the level measures that same compartment's level or
   peak. It is not definitional when the effect travels through other compartments, or when the
   level measures a system-wide summary: a final size, a total ever infected, a threshold crossing,
   a time to a level. Rule 3's exemption of a peak, the owner's earlier ruling, was wrong and is
   withdrawn. In code (`rule/direct.ts`): `isSystemWide` holds for a first reach, a total, and a
   value at the end of the run; a peak, a lowest value, a mean and a value before the end are the
   compartment's own level; `definitional` is direct and not system-wide.
2. **Found by code, before any reviewer.** The controller asks of every level whether the rule
   makes it definitional (`definitionalProblem`), and a definitional level is a problem the planner
   is asked to repair, as a level failing the level rule is, before the world reaches a reviewer.
   A reviewer's definitional block counts only where the code finds the level definitional and the
   block's term is valid; any other is ignored, and recorded with the reason.
3. **The hook measures the spread a spread headline speaks of** (`rule/spread.ts`). Where the
   paper's headline is about spread, transmission, incidence, curtailing or eliminating, level 1
   must measure an infected compartment, as the next-generation matrix names them. A model whose
   next-generation matrix cannot be found, such as one with frequency-dependent incidence, is not
   held to it. The hepatitis C paper's headline is about adherence slowing spread, so its hook now
   measures infections.
4. **An unsupported block stands from one reviewer.** No agreement is needed: one reviewer's block
   sends the level's words to the explainer, once, and the level is dropped if a block stands
   again. Where the block says something the model can check, the reviewer gives it as a `claim`
   (a parameter is a share or a rate, a parameter does or does not appear in a compartment's
   equation), and code checks it against the ModelSpec (`checkClaim`): a block whose claim the
   model refutes does not stand, its reason recorded ("theta is a share, with no unit"). Overstated
   and other blocks stay advice.
5. **A reviewer is never the model that planned or wrote what it reviews.** `models.json` fails
   validation when the reviewer or the second reviewer is the planner, the second planner or the
   explainer (`apps/api/src/models/config.ts`, tested in `apps/api/test/voyager.test.ts`), and the
   bake-off's report picks reviewers under the same rule (`reviewerPair` in
   `scripts/bakeoff/report.ts`). A transcriber may review: a transcription is held by its match with
   the other, and the reviewer takes the model as given.
6. **The cases, under the corrected rule.** `eval/bakeoff/review-cases.json`'s definitional
   expectations are recomputed by code: 11 definitional faults, 3 unsupported, 1 overstated, 6
   clean levels and 1 unscored. The tuberculosis world of 2026-10-17's level 2 is a fault, unsupported,
   by the owner's ruling; hepatitis C's level 5 of 2026-10-17, measuring the quitters' peak with
   their own rate δ, stays a definitional fault.

### The reviewers, picked again

The bake-off ran again on the corrected rule and the new prompt (`eval/models.md`). Five models block
all 15 faults and no clean level, with every term valid and no failed check called acceptable:
kimi-k2-7-code, inkling-small, qwen38-27b, qwen36-27b and muse-glimmer-30b. kimi-k2-7-code is the
planner and the explainer, so it cannot review. The reviewer is **inkling-small** (Thinking
Machines) and the second reviewer, the best from another vendor, **qwen38-27b** (Qwen).
inkling-small is also the second transcriber, which rule 5 allows.

### Both generated worlds of 2026-10-18, re-checked

- **Tuberculosis** (`arxiv-2506.19869v1-2026-10-18`): levels 1 (γ, the infected peak) and 3 (δ, the
  infected peak) are definitional; levels 2, 4 and 5 are not. Not regenerated: the owner asked for
  hepatitis C. The library notes the two levels under the world.
- **Hepatitis C** (`pmc-PMC12334037-2026-10-18`): levels 1 (θ, the quitters' peak), 3 (η, the
  recovered peak), 4 (ρ, the quitters' peak) and 5 (δ, the quitters' peak) are definitional; level 2
  (β3) is not. Regenerated, below.
- Both jobs are kept as records, with `replays: false`: the reviewer's prompt changed.

### The hepatitis C world regenerated

`fixtures/worldspecs/generated/pmc-PMC12334037-2026-10-18-2.json`, its job recorded as
`fixtures/jobs/pmc-PMC12334037-2026-10-18-2.json`, which replays to the same world. Three runs were
needed; the two fixes below came from the first two.

- **The plans:** glm-5-3's plan was kept for every slot, kimi-k2-7-code's having no level meeting the
  rules. The code found levels 3 (η, the recovered peak), 4 (ρ, the quitters' peak) and 5 (δ, the
  quitters' peak) definitional and level 1 short of the level rule (θ on the infected peak, 14 of
  20), and sent them to the planner before any reviewer read the world.
- **The adherence hook, dropped.** The first repair moved level 1 onto the recovered peak, which the
  spread rule refuses; the second onto the quitters' peak, which θ, in dcQ/dt, makes definitional.
  With no repair left the level was dropped and, as the paper's own numbers confirm that its 52%
  threshold does not appear at Table 1's values (ADR-0040), level 1 now tests finding 1.
- **The new hook, "Fewer quitters, smaller outbreak":** its control is δ, the rate at which people
  quit treatment; it measures when the untreated chronically infected, the quitters, first reach 1%
  of the town, a threshold crossing, so it is not definitional, and an infected compartment, so it
  measures spread. "What if only half as many people quit treatment, with delta at 0.3? … the other
  world first reaches 1% quitters more than 4 years later." It holds on 20 of 20 starts.
- **One reviewer's blocks, three times.** inkling-small blocked "Two levers work together" for calling
  η a rate; written again, it still did, and the level was dropped. It blocked "A faster chronic
  recovery rate", whose goal asked for the rate that brings the reproduction number below 1 while
  the level measures when the quitters reach 1%; written again, it stood. It blocked the hook's
  words; written again, they stood.
- **Three levels,** each holding on 20 of 20 starts: the hook, "Quitters spread the virus most" (β3,
  the quitters' peak, β3 not in dcQ/dt) and "A faster chronic recovery rate" (ρ, when the quitters
  reach 1%). The world of 2026-10-18 before it is kept as made.

### Two fixes the regeneration needed

- **A planner's repair given room, and one that cannot be read changing nothing.** The first run's
  repair thought until its 32,000 tokens and wrote nothing; asked to correct that, it wrote two goals
  over 160 characters, and the job failed. A repair that runs out of room before it writes anything is
  now asked again with twice the room, as the explainer's is; one that still cannot be read leaves
  the plan as it was, the repair spent, and the rules drop what it was to mend, as CLAUDE.md's
  boundary 5 says. The bake-off makes no repairs, so its recordings replay as before.
- **The reword mends every sentence a learner reads.** The second run's reviewer blocked level 3's
  What-if question twice, "the paper's 0.19" for a threshold the paper derives; the reword could
  change only the goal and the effect, so the block could not be met. It now writes the goal, the
  What-if's question, the prediction's question and the effect; the What-if's value, what the level
  measures and its claim stay the planner's.

### Consequences of the amendment

- The two conflicts in the consequences above are settled: a peak is the compartment's own level,
  and an unsupported block needs one reviewer. So is the third: the planner can no longer review.
- The controller's rule problems come before review, so a job's level loop repairs definitional
  levels and the spread hook as it repairs the level rule's.

## Second amendment, 2026-10-20: judged by compartment

The owner closed the loophole of the first amendment: a level is definitional by the compartment it
measures, not by its summary.

1. **The rule.** A level whose control appears directly in the measured compartment's own equation
   is definitional whatever it measures of that compartment: its level, peak, time to a level, total
   over time, or value at the end. Only a system-wide measure escapes, one across compartments (a
   final size or a total ever infected over several compartments) or of a quantity derived from them
   (a threshold crossing such as R0 = 1). A level of a generated world measures one compartment, so
   the tag alone decides; one compartment's value at the run's end is that compartment's level, not
   a final size. The owner confirmed this reading on 2026-10-24: only a measure across
   compartments counts as a final size.
2. **The words.** A level or a peak keeps the words reviewers have read since 2026-10-18, so their
   recorded reviews replay; any other summary is named ("by its time to a level"). The planner is
   told to measure a compartment the effect must travel through others to reach.
3. **The cases.** The planted tuberculosis world's level 4 (α on the recovered at the run's end) is
   now a definitional fault, and hepatitis C's regenerated world joins, its hook (δ, time until the
   quitters reach 1%) and level 3 (ρ, the same) definitional faults, level 2 (β3) clean. Both worlds'
   prompts are new, so each `awaitsRun`: replays and rescoring leave them out until the next live
   `design` run reads them and clears it. Rescored without them, the reviewers rank as before:
   inkling-small and qwen38-27b stay.
4. **The worlds.** Hepatitis C's regenerated world has levels 1 and 3 definitional, the tuberculosis
   worlds levels 1 and 3, as the library now says; none is regenerated in this session, two jobs run
   in the background after the land. The job that made the hepatitis C world no longer replays, and
   no recorded job does until one is run again under this rule; the recorded jobs' test now holds
   that each record replays or says why, and that one names the rule that ended the replays.

