# ADR-0036: Several value sets in one paper, picked by rule

- Status: accepted. The owner's rule (2026-10-16): both transcriptions extract every value set,
  each with its label and anchor; the match compares sets; a deterministic rule picks one (the set
  the paper uses for its main results, values fitted to data before illustrative ones, then the
  set behind its first results figure or table); only if still ambiguous does the job stop as
  `needs_information`; other sets are kept as named alternatives, unused for now. The shapes are
  mine.
- Date: 2026-10-16
- Decided by: the owner, the rule; me, its form.

## Context

The tuberculosis paper states two sets of values: a synthetic example that illustrates its
estimation method, and values fitted to Ethiopian data from 2011 to 2021, which its results
section uses. The transcriber was told to use "the first scenario it gives in full"; one
transcriber took the synthetic set and the other the Ethiopian, so the job stopped. The tumour
paper has scenarios too: tBregs absent or present, two values of one rate.

## Decision

1. **A transcription may list value sets** (`ValueSet`, in `TranscriptionWithSets`): an id, the
   paper's label, a quote where the paper states it, whether the paper fits its values to data,
   whether its main results use it, a quote saying what it is used for, the first results figure
   or table it is behind, and every value it states, each with its quote. A paper with one set
   lists none.
2. **The rule** (`pickValueSet`), on each transcription's sets: the sets behind the main results,
   or all when none says so; among several, those fitted to data before those that illustrate;
   among several still, the set whose first results figure or table appears first in the paper.
   A tie stops the job as `needs_information`, saying which sets and why, before anything is
   planned. The rule's reason is in the job's events.
3. **The match compares sets by the values they share,** never by their labels
   (`compareValueSets`): a set pairs with the other transcription's set that shares at least half
   its values. Different numbers of sets, an unpaired set, or picks that are not the same set are
   disagreements, repaired like any other.
4. **The picked set is the model's values;** the others become `ModelSpec.alternatives`, each with
   its label, its values by the model's ids (a starting value by its compartment's parameter) and
   its anchor. The contract refuses an alternative that sets something not in the model.
5. **The gold answers name the set the rule should pick** (`picked`). The tuberculosis gold lists
   both sets, every value quoted from the paper's table, and picks the Ethiopian; the bake-off
   scores whether each transcriber's rule picks the gold's set, and how many of the gold's sets it
   lists.
6. **In stages.** The transcriber stage keeps requesting the schema it has, so the recorded calls
   still replay; it asks for value sets when the stages' prompts change together with the next
   bake-off run (ADR-0037), and the controller's test of a job with two sets arrives then.

## Consequences

- A paper with an illustrative and a fitted set becomes a world on the fitted set, the other kept
  by name.
- A paper whose sets the rule cannot tell apart goes to the owner, naming the sets.
- `npm run pipeline:live -- rescore` replays the recorded bake-off under new scoring or gold,
  calling nothing; a prompt change still needs a new run.
