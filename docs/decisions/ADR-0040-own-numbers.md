# ADR-0040: Running the paper's own numbers before the hook bends

- Status: accepted. The owner's rule (2026-10-16): when a paper's headline does not show at its
  own values, level 1 tests the headline's direction, saying so neutrally as a computed
  observation, with the first anchored finding the model shows as the fallback; but only after an
  independent, deterministic check confirms the mismatch. The check's parts are the owner's; how
  each is done is mine.
- Date: 2026-10-16
- Decided by: the owner, the rule and the check's parts; me, their form.

## Context

The hepatitis C paper's headline, "an adherence level exceeding 52% causes the reproduction number
to drop below 1", did not appear in the world built from its Table 1. By hand, its equation (7) at
those values gives R0 = 0.76 for every adherence, below 1 throughout (ADR-0037's amendment). Before
a world says so, the fault must be shown not to be ours: a misread value, a rate in the wrong time
unit, a transcription that differs from the paper's own formula, or a figure drawn from values the
paper states elsewhere.

## Decision

1. **A deterministic stage, with no model call** (`packages/pipeline/src/reproduce/`), after the
   transcriptions agree and the value set is picked, before anything is planned. Its result is the
   job's `own-numbers` artifact and one line in its events.
2. **R0 from the model's own equations** (`ngm.ts`): the next-generation matrix of van den
   Driessche and Watmough, built through our own code. Each rate is expanded exactly by the
   solver's polynomial expansion; a transmission term enters one compartment, is a product of
   compartments, and leaves another unchanged; the disease-free rest is found by Newton's method,
   or by running the model there first; the infected compartments are those empty at that rest that
   new infections reach and that lead back to infecting; R0 is the spectral radius of F·V⁻¹. A
   model it cannot read (no polynomial rate, no transmission, no rest) is refused, saying why.
3. **The paper's own formula** (`formula.ts`): every display equation whose left side is a
   reproduction number (R0, Rv, Rc, Re) is read from its LaTeX into an expression over the model's
   parameters, by their symbols, with the symbols defined beside it in the same section ("where
   $m_{1} = μ + r$"), and evaluated at the same values. A formula restated in other words is
   counted once. A basic reproduction number leaves a control out: where the two disagree, the
   model's parameters the formula leaves out are set to none, and compared again.
4. **Every value against its quote** (`values.ts`): as written; a percentage read as a fraction;
   or converted from the time unit its passage, or its table's header, names. A rate given per day
   and read as written into a model in years, a proportion above 1, and a value in no quote are
   flagged.
5. **Other values behind the headline** (`scan.ts`): the passages that state the headline or its
   numbers, the figures they cite, every caption, and the sections on methods, simulation,
   estimation and supporting information, for each value they state and each table they say they
   use.
6. **The verdict,** for a headline about the reproduction number with a threshold: the parameter
   it names (by the words of its name) is swept over the range the paper states for it, through the
   model's own equations. The headline **holds** if R0 crosses 1 near the threshold. The mismatch
   is **confirmed** only when the model's equations and the paper's formula agree, every value is
   as its quote states it, nothing else stands behind the headline, and still R0 does not cross 1
   there. Otherwise it is **unresolved**, and a likely mistake of ours (a value, or our equations
   apart from the paper's formula) stops the job for the owner. A headline with no threshold is
   left to the usual rules.
7. **What a world says.** A confirmed mismatch gives level 1 a computed observation, built from
   the check's numbers, never wording the paper as wrong: "At the values the paper lists in
   Table 1, R0 stays between 0.65 and 0.78 for every adherence from 0 to 1, so the 52% threshold
   doesn't appear here; the paper's figure may use values it doesn't list." Every world the check ran
   on carries a journal page, "Running the paper's own numbers", each statement with its origin:
   the paper's words paper-derived and anchored, the check's computed observations.
8. **The contract:** `worldspec/3` gains an optional `ownNumbers` (a verdict and its statements)
   and an optional `observation` on a level, both statements with an origin, a paper-derived one
   anchored.

## Findings, on the two papers

- **Hepatitis C:** R0 from the model's own equations is 0.7622553 at Table 1's values, the same as
  equation (7) to every digit the check compares; all 19 values are as written; no other value
  stands behind the headline, and Figure 7's caption says its other values are "held constant as
  displayed in Table 1". Across adherence from 0 to 1, the range its table states, R0 runs between
  0.648 and 0.776 and never crosses 1. The mismatch is confirmed: ours and the paper's formula
  agree, and neither shows the threshold at the values the paper lists.
- **Tuberculosis:** the model's own equations give 33.7 at the Ethiopian values, the same as the
  paper's Rv, equation (9); its R0, equation (10), gives 80.4, the same as the model's own equations
  with vaccination and the other controls it leaves out set to none. All 17 values are as written.
  The paper states "R0 = 2.67 for the estimated model parameters", which neither formula gives at
  the values it lists; the page says so, as a computed observation. Its headline states no
  threshold, so level 1 follows the usual rules.

## Consequences

- A world never says a paper's headline does not appear until our own equations, the paper's own
  formula and every value agree.
- A paper whose formula the reader cannot parse, or whose model has no polynomial rates, gets no
  confirmed mismatch: its headline follows the usual rules.
- The check reads the reproduction number only. A headline about another quantity is left to the
  rules that already hold every level to what the model measures.
