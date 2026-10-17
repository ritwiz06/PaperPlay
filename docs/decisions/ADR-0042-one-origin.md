# ADR-0042: One origin a sentence, and every number in the chart's unit

- Status: accepted. The owner's fixes (2026-10-17): a claim is always written in the unit its
  chart shows; each sentence carries exactly one origin, and a fork's closing line that mixes
  measured results with a paper quote is split. The mechanisms are mine.
- Date: 2026-10-17
- Decided by: the owner, the rules; me, how they are held.

## Context

The hepatitis C world's level 1 charted the recovered as people in a town of 10,000 while its
claim, the planner's own sentence, said "higher by more than 0.004", a share. Its guide read
"Recovered is above 0.01". And a fork's closing line was the explainer's words with the paper's
quote folded in, labelled paper-derived whenever the quote was found, so the world's narration of
its own result read as the paper's.

## Decision

1. **A closing line is split.** The explainer's words are a teaching choice, with any sentence that
   quotes the paper taken out (`narrationOf`); the quote, when the source holds it, becomes its own
   statement, `guidedExploration.paperSays`, paper-derived and anchored, shown on its own line as
   "The paper: “…”". A quote the source does not hold is dropped, as before.
2. **A share world's numbers are people,** wherever the shell writes one: its claim is written from
   the level's data, "Highest recovered within 200 years: the other world higher by more than 40
   people", rather than the planner's sentence; its guide's reading shows people, and a share in a
   reading's words is written as people (`apps/web/src/hook/units.ts`). A world with no display
   scale keeps its own words.
3. **The contract:** `GuidedExploration.paperSays`, optional, a statement with its origin.

## Consequences

- The two worlds of 2026-10-17 were assembled again by replaying their jobs; their closing lines
  now end with the world's own question, and the paper's words stand apart.
- The first generated world, kept as made, has no `paperSays`; its closing lines stay as they were.
- The explainer may still write a share in its narration; the next explainer prompt asks it to
  write numbers in the chart's unit (ADR-0044's regeneration).
