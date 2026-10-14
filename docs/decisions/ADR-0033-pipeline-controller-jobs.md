# ADR-0033: The pipeline's stages, its controller, and the API's jobs

- Status: accepted. The owner asked for the pipeline on the compartment family, the API's jobs
  with honest states, and a controller with at most two scoped repairs (2026-10-14). The stages'
  shapes, the repairs' scope and the reviewer's place are mine, for the owner to confirm.
- Date: 2026-10-14
- Decided by: me, within every-paper.md §3, ADR-0024 and ADR-0030.

## Context

G3a.3 turns a paper's identifier into a playable world through real states (R11), with checks no
model can overturn (R10). The stages are model calls through the vendor-neutral client
(ADR-0030); everything between them must be deterministic, so a recorded job replays exactly.

## Decision

1. **Stages are bounded model calls with schemas** (`packages/pipeline/src/stages/`), each a
   Zod schema, instructions and a message builder, through `completeStructured`:
   - **the router** names the paper's family and tier; only the compartment family goes on;
   - **the reader** names the equations that define the model, the paper's result and its claims,
     each with a quote;
   - **two transcribers,** different vendors, never seeing each other's work, write the model as a
     `Transcription` (ADR-0032);
   - **the planner** writes at least three levels: the parameter the learner controls, the What-if
     values, and the measured difference with its claim; told the model's behaviour in numbers
     computed beforehand, and Threshold Town's levels as its worked example;
   - **the explainer** writes each level's words at the three depths, the guide's lines and the
     afterwards, quotes from the source;
   - **the reviewer** reads the world in words, the checks' results and the source.

   The paper reaches every prompt sanitised and fenced as data (R09); the sanitiser's log is the
   job's `sanitiser` artifact.
2. **Everything between the stages is deterministic** (`assemble/`, `rule/`, `checks/`): the
   step the solver's accuracy check accepts, the world assembled as `worldspec/3` with anchors
   found in the source, the builder with the family's checks, the level rule swept over 20 starts
   (moved from `scripts/` into the pipeline, its records byte-identical), and provenance.
3. **The controller** (`controller/run.ts`) moves only along the contract's `JOB_TRANSITIONS`;
   `ready` follows only `checking`. It reaches `ready` only when the builder, the family's checks,
   the level rule and provenance have all passed. Repairs, at most two per job, are scoped:
   - the two transcriptions disagree: the first transcriber is shown what differs and transcribes
     again; still disagreeing, the job goes to the owner as `needs_information`, never verified;
   - a level does not build or fails the level rule: the planner is asked to change that level
     alone, given the measurement; a level still failing is dropped, and the world goes on only
     with three or more levels that pass;
   - otherwise the job ends with the reason, and nothing half-made is kept as the world.
4. **The reviewer runs after every check has passed, and advises.** It cannot turn a failure into
   a pass, because it is never asked while a check is failing; its blocking findings are recorded
   and shown, and do not stop a world whose checks pass. The bake-off ranks reviewers by the
   planted faults they find, so its advice is worth reading.
5. **The API's jobs** (`apps/api`): `POST /jobs` takes `{"source": "arxiv:<id>v<n>"}` or
   `{"source": "pmc:PMC<n>"}`, nothing else, in a body of at most 16 KB; `GET /jobs/:id/events`
   streams every event as server-sent events, each with its sequence number, and a client that
   reconnects with `Last-Event-ID` is sent only what it missed; `GET /jobs/:id/world` answers 409
   until the job is `ready`; `DELETE` cancels. Events and artifacts are kept as JSON under
   `apps/api/data/`, which git ignores. Nothing is timed.
6. **Which client the API holds depends on how it was started:** `npm run dev:api` replays
   recordings and calls no gateway; `npm run pipeline:live -- serve` calls the gateway, recording
   each call, and listens on 127.0.0.1 only. A job's token budget and its trace wrap the client
   for each job (ADR-0030).

## Consequences

- A job recorded live replays under `dev:api` and in tests to the same states and world.
- A paper whose model the two vendors read differently never becomes a world on its own: the
  owner decides.
- A blocking finding from the reviewer on a world that passes is shown to the owner, who can
  refuse the world; a later decision may give it a scoped repair.
- Upload of a PDF from the learner's files arrives with PDF ingest; until then a body holds only
  an identifier.
