# ADR-0044: What counts as definitional, held by code

- Status: accepted. The owner's rules (2026-10-17): a deterministic direct-effect tag given to
  reviewers as evidence; a definitional block naming the equation term it follows from, checked by
  code, ignored and recorded when it names none; a block standing only when a second reviewer from
  another vendor agrees; a direct effect on an emergent summary never definitional; hepatitis C's
  level 5 a true fault and the tuberculosis findings levels true non-faults in the reviewers'
  bake-off, with every reviewer mistake a live run reveals kept there; a reviewer's "unsupported"
  sent back to the explainer as a scoped wording repair, the level dropped if it survives. The
  mechanisms are mine.
- Date: 2026-10-17; the regenerations 2026-10-18
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
