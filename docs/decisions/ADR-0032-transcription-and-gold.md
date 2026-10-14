# ADR-0032: Transcriptions, their structural match, and three gold answers

- Status: accepted. The owner asked for gold ModelSpecs by hand for three CC BY compartment-model
  papers, and two independent transcriptions matched structurally (2026-10-14). The format, the
  match and the choice of papers are mine, for the owner to confirm.
- Date: 2026-10-14
- Decided by: me, within ADR-0024, item 2, and the owner's G3a.3 request.

## Context

ADR-0024 makes a world verified only when two transcriptions of the paper's model, by models from
different vendors, agree structurally. A model writing a `ModelSpec` directly would have to emit
the expression tree as nested JSON, which models get wrong in ways that are hard to name, and its
ids must be camelCase while papers write `\beta`, `S_0` and `N`. The bake-off needs answers to
score against, made by hand from the same extracted text the pipeline reads.

## Decision

1. **A transcription is a model's own form, not the `ModelSpec`.** `Transcription`
   (`packages/pipeline/src/transcribe/schema.ts`): the time unit, compartments, parameters and
   equations, each with the paper's symbol, a name, a unit as powers of the family's dimensions,
   a value or null, and a short verbatim quote. Rates are formulas written as text, `beta*S*I/N`.
   A value the paper does not state is null and is reported as unstated, never filled in.
2. **Formulas are parsed by a closed grammar of our own** (`formula.ts`): numbers, names,
   `+ − × ÷`, powers, brackets, unary minus, `exp` and `log`, the compartment family's tree and no
   more. A name that is not a compartment or a parameter is refused, with where. Nothing is
   evaluated.
3. **Converting to a `ModelSpec`** (`convert.ts`): each quote must be found in the source's text,
   exactly or with only its whitespace differing, and becomes a real anchor with its section and
   offsets; one that is not found is a problem, never an anchor. Each paper name gets a distinct
   camelCase id. A starting value becomes a parameter, `<id>0`, so a world can vary it and its
   anchor survives.
4. **Two transcriptions match structurally up to renaming** (`match.ts`). Names are paired by
   symbol, then by stated value, then by trying the few pairings left; a pairing holds only when
   every rate and starting value agrees at twelve seeded random points. Stated values are compared
   apart, so a model can be transcribed right with a value read wrong, and the report says which.
5. **Gold answers** (`eval/gold/<sourceId>.json`, `gold/1`): a transcription by hand in the same
   form, with the source's equation ids that define the model, other values the paper states for
   another scenario (each counted right), and the qualitative result with its quote. A test holds
   each: every quote in the source, every formula parsing, units agreeing, the model running.
6. **The three papers,** each CC BY, each stating every starting value, chosen from six
   candidates a research agent checked (three others state no starting values):
   - arXiv 2506.19869v1, tuberculosis: six compartments, in years; the synthetic example's values,
     with the Ethiopian estimates as alternatives;
   - arXiv 2203.01434v2, breast-cancer tumour cells and regulatory B cells: four compartments,
     in days; the scenario the paper simulates;
   - PMC12334037, hepatitis C with treatment adherence: five compartments, in years, as shares
     of the population.

   Kermack and McKendrick's 1927 paper is not among them: its PDF is not in the repository, and
   it is not under CC BY.

## Consequences

- The bake-off scores transcriptions, readings and their quotes against the gold
  (`score.ts`), deterministically, so recorded calls replay to the same table.
- A transcriber that mislabels a symbol but writes the same equations still matches; one that
  writes a different equation does not, whatever it names things.
- Gold answers are mine, made by hand; a reader may disagree with one. Each states its choices
  in its `notes`.
