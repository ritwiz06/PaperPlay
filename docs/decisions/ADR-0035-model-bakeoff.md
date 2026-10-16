# ADR-0035: The model bake-off, and each stage's model

- Status: proposed. The owner asked for a bake-off per stage against the gold answers, recorded
  in `eval/models.md`, with each stage's model picked from it, skipping any model the Voyager
  portal marks "Testing in progress" (2026-10-14). The method and the picks are mine. The picks
  are provisional until the owner names the models marked "Testing in progress", which the
  gateway's API does not show.
- Date: 2026-10-15
- Decided by: me, for the owner to confirm.

## Context

The gateway offers 39 chat models; the capability probe found 36 that hold a reply to a JSON
Schema (ADR-0030). The pipeline has seven stages (ADR-0033), and the two transcriptions must come
from different vendors (ADR-0024). Usage is free, but each call takes seconds to minutes.

## Decision

1. **Ten candidates, one per vendor,** each one the probe found honouring a schema:
   qwen35-397b-a17b (Qwen), glm-5-3 (Z.ai), deepseek-v4-1-flash (DeepSeek), gpt-oss-120b (OpenAI),
   llama4-maverick-17b (Meta), kimi-k2-7-code (Moonshot AI), gemma4-31b-it (Google), minimax-m2-7
   (MiniMax), granite41-30b (IBM), mimo-v2-6-flash (Xiaomi).
2. **Each stage is scored on what the pipeline uses of it,** against the three gold answers
   (ADR-0032), deterministically, so the recorded calls replay to the same table
   (`scripts/test/bakeoff.test.ts`):
   - **transcription:** equations matching the gold's up to renaming, then values read right,
     then quotes the source holds;
   - **reading:** the result's quote found in the source, then the claims' quotes found; these
     become the world's anchors. The overlap of the equations it lists with the gold's comes
     last, since the pipeline does not use that list. The first ranking put it first, measuring
     something the pipeline never reads, and was changed before any reader was chosen;
   - **routing:** family and tier right on eight papers, three of them compartment models;
   - **planning:** each planned level assembled and built alone from the gold model and the best
     reader's reading, then swept by the level rule over 20 starts;
   - **reviewing:** a tuberculosis world in words with faults planted at levels 2 and 3 and a
     failed level-rule check at level 4: blocks of the planted faults, less any block of level 1,
     which has none; a reviewer that calls the failed check acceptable ranks last.

   Ties go to the model with fewer failed calls across the bake-off, then to the earlier
   candidate.
3. **The explainer takes the planner's model.** Its words are held by the schema and by quotes
   found in the source, and the provenance check refuses a world whose anchors are not there;
   the bake-off does not rank it apart.
4. **Fixes the bake-off found, applied to every model alike** before the picks were made:
   - quotes are found through LaTeX notation (`β = 0.05` finds `\beta = 0.05`), and the anchor
     holds the source's own whole LaTeX;
   - a reply's JSON is mended inside its strings: a one-backslash LaTeX command stays a backslash,
     where JSON read `\beta` as a backspace and `eta`, and raw control characters are escaped;
   - the live client no longer gives up on a reply after 300 seconds (ADR-0030's amendment), which
     had failed every long call by the slower models;
   - a plan's names are read as the model's ids, from the id, its camelCase form or the paper's
     symbol in any notation (`theta_N` is `thetaN`);
   - the solver's step is the finest any level's two worlds need, not only the paper's values'.
   - a control character in a reply where a LaTeX command began, as a gateway that decoded the
     reply once leaves `\frac` (a form feed, then `rac`), is the command again;
   - the time unit is part of a model's structure: the same equations per day and per year do not
     match. Counting it moved the first transcriber from mimo-v2-6-flash, which wrote "day" for all
     three papers, two of them in years, to eighth;
   - replies are streamed, past the gateway's proxy, which ended any reply that sent nothing for
     too long (ADR-0030's amendment), and a call may take up to 30 minutes;
   - the planner and explainer, whose schemas are large, always ask for plain JSON, validated by
     Zod: held to the schema, models looped on whitespace or thought until their limit and wrote
     nothing. Each may write 32,000 tokens; a schema-held reply that runs out or comes back empty
     is asked for again as plain JSON.
5. **A run cut short resumes:** `npm run pipeline:live` answers from a recording when there is
   one, so only the calls that failed are made again. A failed call is never recorded.
6. **The second transcription checks structure only.** Its quotes are never anchors, so it is
   compared with its quotes set aside; the first, whose quotes become the world's anchors, must
   have every one found.
7. **The picks** (`eval/models.md`), in `apps/api/models.json`: reader, planner and explainer
   kimi-k2-7-code (Moonshot AI); first transcriber glm-5-3 (Z.ai); second transcriber, router and
   reviewer qwen35-397b-a17b (Qwen). The router's and reviewer's tables are ties at the top, broken
   by the declared rule.
8. **The first generated world is the hepatitis C paper,** PMC12334037, the one gold paper on
   which the two picked transcriptions agree in values as well as equations. On the tuberculosis
   paper each took a different one of the paper's two value sets; on the tumour paper they read
   two starting values differently. Each of those jobs goes to the owner, as it should.

## Consequences

- The picked pair agrees in equations on all three gold papers and in values on one.
- If the owner names a picked model as "Testing in progress", its stage takes the next in its
  table, and the recordings of the first generated world are made again.
- Calls that failed because the Mac slept, or the gateway dropped the connection, count against
  their model as failed calls; the resumed run made each again once.
