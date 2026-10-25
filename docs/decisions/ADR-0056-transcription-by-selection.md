# ADR-0056: Fresh transcriptions within R13: code extracts, the model selects

- Status: accepted. The owner, 2026-10-25. Implemented in a later session, before biomedical work;
  every new family's extraction follows it from the start, attention's included. The world-naming
  rule is implemented now.
- Date: 2026-10-25
- Decided by: the owner.

## Context

Tuberculosis, fresh, twice stopped at R13's 15 minutes in its transcriptions (ADR-0055's results):
each transcriber read the whole paper and wrote the model out, about 6.5k tokens at 16 to 18 tokens
a second, 6 to 7 minutes; then the two disagreed, once on quotes the source does not hold and once
on which of the paper's value sets to use, and the repair, the same model asked again, ran past its
7 minutes. A longer budget would only move the deadline.

## Decision

1. **Code extracts, the model selects.** Ingest parses every display equation from LaTeX or JATS into
   an expression tree, and pulls every table value out with its location. A transcriber chooses
   from what code found, with short answers: which equations form the model, which symbol is which
   compartment, which found value is which parameter. A value code did not find in the text cannot
   be chosen, so a transcription can no longer quote what the source does not hold.
2. **Value sets by code.** Code lists the paper's value sets and applies the rule that picks one
   (ADR-0036); transcribers never pick a set.
3. **Disagreement:** one short reconciliation call on only the items that differ; if it does not
   settle them, the owner decides, as now when a repair fails.
4. **Optimistic pipelining:** the levels are built from the first transcription while the second
   runs; the world is verified, and released levels marked so, only when the second agrees.
5. **Every new family's extraction follows this pattern from the start**, attention's included:
   code finds the architecture's choices and numbers, the model only selects among them.
6. **A world's generated name names the paper's subject,** such as "Tuberculosis in Ethiopia", never
   a generic place such as "Compartment Crossing" (now, in the explainer's world call).

## Consequences

- The transcriber bake-off is re-run on the selection prompts when they exist; its recordings of
  whole-paper transcriptions stay for the recorded jobs.
- R13 for an unseen paper is measured again once this is built.
