# ADR-0024: The plan for every paper, as the owner answered it

- Status: accepted.
- Date: 2026-10-10
- Decided by: the owner, answering the decisions at the top of `docs/design/every-paper.md`
  at the start of the day's first session.

## Context

The plan for every paper (`docs/design/every-paper.md`, ADR-0021) asked the owner eight
questions before any G3 code: the order of families, whether equations as data count as
verified, the level rule for models with no randomness, the gates re-cut, three new
dependencies, the licence policy, a PubMed Central test paper, and the sixth session's smaller
choices. This ADR records the answers. Where an answer changes the plan, the plan's own text
now points here.

## Decision

1. **The order of families is accepted:** compartment models first, then learning toys (Adam,
   Dropout), then study design, grids and networks.
   - **Kermack and McKendrick 1927 is hand-authored** as the compartment family's reference
     world, as the flocking world was for agents.
   - **Elowitz and Leibler 2000 is the first paper the pipeline generates,** held out from the
     reference.
2. **Equations as data count as verified (tier A),** with no pull request per model, when all
   of these hold:
   - every equation is anchored to the paper's own;
   - its units are consistent;
   - the family's checks pass;
   - the level rule passes;
   - **an independent second transcription agrees.** A separate model call re-extracts the
     equations from the source without seeing the first. The two expression trees must match
     structurally, up to renaming.

   If they disagree, the world is not verified: it goes to repair, then to the owner.
3. **The level rule for models with no randomness is accepted.** Twenty starts: the paper's
   values, and 19 starts within ±10% of each parameter and starting value. A stated effect
   holds on at least 16 of the 20.
4. **The gates are re-cut:**
   - **G3a:** generalize; the compartment family; the pipeline on it.
   - **G3b:** routing; the explainer tier; the learning family.
   - **The primitive-builder agent comes after G4.**

   The roadmap gives gates and effort, with no day ranges and no calendar promises.
5. **Three dependencies are approved:** a LaTeX parser, a PDF text extractor and the Anthropic
   SDK.
   - Each is pinned, maintained and licence-compatible, and comes with an ADR naming the
     alternatives considered.
   - The SDK runs only in `apps/api`, with its key in `apps/api/.env`. CI uses the mock
     adapter. Each job has a token and cost budget, recorded in the job's trace.
6. **The licence policy is accepted:** store anchors and short quotes, and never rehost a
   source. The owner will ask ASU's copyright office about Turing 1952, the MRC trial of 1948
   and Kermack and McKendrick 1927. Nothing waits on the answer.
7. **PubMed Central:** the OA Web Service API and the FTP article files are gone (owner
   confirmed). Ingest uses the supported routes: the PMC Cloud Service on AWS, OAI-PMH,
   E-utilities or the BioC API. One CC BY compartment-model paper from the open-access subset
   tests that route; it is chosen when PMC ingest is built (G3b).
8. **The sixth session's smaller choices are accepted:**
   - level 5's counter shows the birds inside rocks right now (ADR-0018);
   - rocks cast no shadow;
   - the context-loss notice (ADR-0022);
   - each level's prediction choices (ADR-0023).
9. **The source PDFs:** the owner will put the Reynolds, Kermack and McKendrick, and Elowitz
   and Leibler PDFs in `reference/private/`. Whenever one appears, its source register and
   source map come first.

## Consequences

- **G3a.1, generalize, comes next,** with no change in behaviour: every existing test passes
  with only imports and paths changed, the six levels on seed 5 replay bit for bit against
  records made before the refactor, and the Mac capture's frame hash matches its
  pre-refactor hash.
- **The second transcription is a family check from G3a.3,** where the pipeline first
  transcribes. A hand-authored world has no second transcription, so it cannot be verified
  by rule 2 alone: Kermack and McKendrick stays a draft until its anchors are real, and its
  verification is decided then.
- **"Starting value" is a value in the model's initial state.** The level rule varies every
  parameter, and every starting value the model's parameters do not already set (the
  compartment family's sweep says how, ADR to follow with G3a.2).
- **The roadmap's "Days" column is gone,** and G3 holds G3a and G3b. Their tags are chosen when
  each passes.
