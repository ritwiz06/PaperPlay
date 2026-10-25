# ADR-0053: Fast generation, against a deadline (R13)

- Status: accepted. The owner, 2026-10-24: a new requirement, R13, and its means; all of it in one
  session. The budgets and the measurement are mine.
- Date: 2026-10-24
- Decided by: the owner.

## Context

A world from a paper took far too long. `npm run timing` read the 9 jobs with live calls since
2026-10-18 (two planners and two reviewers): wall clock p50 33.5 min, p90 84.9 min, 4 ready. Both
regenerations of 2026-10-20 failed, tuberculosis at 33.5 min (the explainer's reply unreadable
twice), hepatitis C at 38.5 min (a planner repair out of room at 32k tokens after 17 min, its retry
21.5 min more, then too few levels).

| Stage (model) | Live calls | p50 min | p90 min | Prompt | Reply | Thinking ≈ | Tokens/s | Out of room |
|---|---|---|---|---|---|---|---|---|
| planner (kimi-k2-7-code) | 9 | 11.2 | 21.5 | 7.2k | 20.9k | 19.7k | 35 | 2 |
| second-planner (glm-5-3) | 3 | 15.5 | 20.1 | 6.5k | 15.1k | 13.4k | 20 | 0 |
| explainer (kimi-k2-7-code) | 56 | 4.7 | 6.5 | 19.1k | 8.9k | 8.1k | 31 | 1 |
| reviewer | 10 | 2.8 | 5.1 | 17.2k | 6.5k | 6.3k | 28 | 0 |
| second-reviewer | 10 | 3.4 | 5.5 | 16.7k | 7.5k | 7.3k | 32 | 0 |

The critical path is model calls alone (about 0.1 min with no call in flight in 7 of 9 jobs): route
0.3 → reader ‖ transcriptions about 3 → planners 11–20 → every level's explainer about 8 → each
repair a planner 5–21 and every level's explainer again 6–8 → reviewers 3–8 → a reword and the
reviewers again about 6. Thinking is about 90% of every reply. After each repair every level was
explained again, the changed or not, each call carrying 60,000 characters of the paper.

## Decision

1. **R13.** A paper the system has not seen: p90 under 15 minutes wall clock on the gateway, the
   first level playable within about 5. A paper already generated: at once. Past the deadline, ship
   what passed (at least three levels) or fall back to the explainer page, saying so; never run on.
2. **Thinking only where it pays** (`models.json`'s `thinking`): on for the two transcriptions,
   which must agree on every value, and the two reviewers, whose judgment nothing else checks; off
   for the router, the reader, both planners and the explainer, whose output the deterministic rules
   judge in full, so a weaker plan costs a repair, never quality. Off is sent as
   `chat_template_kwargs` (`enable_thinking`, `thinking`); a gateway that refuses it (HTTP 400) is
   asked as before, for that model, from then on. The switch is part of a prompt's hash, so no
   recording made while a model thought is replayed for a call asked not to.
3. **A deadline** (`models.json`'s `deadline`): the job 12 minutes, each stage's longest call
   (router 1, reader 3, transcriptions 7, planners 4, explainer 2, reviewers 4 minutes), each call
   ended when its stage's time or the job's runs out. A repair is asked for only when a planner's
   call, the changed levels' words and the review after them, as long as they took in this job,
   still fit; otherwise the levels that pass ship, at least three with the hook, or the job stops. A
   job past its deadline stops and says what is left: the levels released, or the explainer page
   (tier C), which comes with the results explorer (ADR-0054). A job's token budget is halved to
   600,000, above every ready job's spend (at most 340,000).
4. **Progressive delivery.** Once the hook and two more levels pass every check, provenance
   included, they are released as a world of their own (`released`, `GET /jobs/:id/released`),
   playable from `/create` and the world page while the job goes on, which say the reviewers have
   not read them yet; each change to the passing set releases again. Three, because a world holds at
   least three levels by contract. A world no reviewer answered in time ships checked and says it
   was not reviewed; words written again since the last review are dropped if no reviewer reads them.
5. **Words only for what changed.** After a repair, only the levels it changed are explained again;
   the rest keep their words. A level whose words do not come, or come unreadable, is left out (never
   the hook), so one bad reply no longer ends a job, as it ended tuberculosis's.
6. **Read once.** The reader names the sections that state the model, its values and its findings;
   the explainer and the reviewers are given those and the abstract, not 60,000 characters. The two
   transcriptions still read the whole paper, beside the reader rather than after it: they are the
   independent check of the model and its values, and waiting for the reader would put it on the
   critical path.
7. **Calls at once** (ADR-0051, kept): the reader and both transcriptions, both planners, every
   level's explainer and both reviewers. Each planner within its stage's time: a plan in hand never
   waits on the other longer, and the second's plan alone is used when the first's does not come.
8. **Kept by paper and version** (`apps/api/src/cache.ts`): a ready world is kept under
   `apps/api/data/worlds/`; a request for the same paper and version is answered at once with no job
   (`GET /worlds/:key`, `/world/cached/<key>`), unless it asks for a fresh one. Only a world made
   under today's rules (`RULES_VERSION`, 2026-10-20) is served. Stage outputs are reused by
   regenerations through the recordings, by prompt, so the reading and the transcriptions replay
   exactly while the paper and their instructions are unchanged.
9. **Pre-built** (`pipeline:live -- prebuild <source>... | --corpus`): each paper in turn, one job at
   a time. Agent-experiment worlds are made only so, never on request.
10. **Measured.** `npm run timing` reads every job's events, trace and recordings; `pipeline:live --
    job <source> --fresh` asks every call anew, as for an unseen paper, recorded apart in
    `apps/api/data/recordings/` so the committed recordings the bake-offs replay never change.

## Consequences

- The tuberculosis speed run of 2026-10-24, fresh, measures the new settings; the next session
  compares its time and its levels with the job of 2026-10-20. The same rules judge it: quality may
  not drop silently.
- Whether the gateway honours the thinking switch is known only from that run: its replies' tokens
  say. If it is refused, the planners think as before, and the deadline alone holds the time.
- A released world can change under a learner when a repair changes the passing set; the world page
  offers the newest levels rather than swapping them in.

## Amendment, 2026-10-24: after the first speed run

The first speed run, tuberculosis fresh (every call asked anew), stopped at its deadline after 5.1
minutes: the first transcription, a model that only thinks, ran past the 5 minutes I had given the
transcriptions, and no level had passed. The router answered in 6 s and the reader in 64 s, asked
not to think: the reader's reply fell from 4,697 tokens to 707, so the gateway honours the switch.
The transcriptions now have 7 minutes, the job still 12. A job's trace now hashes each call after
its thinking switch is set, as its recording does, so `npm run timing` finds its tokens.

The second speed run ran as the job of 2026-10-20 ran, its transcriptions replayed: router 3.8 s,
reader 69 s, then neither planner, asked not to think, answered within its 4 minutes, and the job
stopped at 5.2 minutes with no level. Both calls were ended before they replied, so whether
kimi-k2-7-code and glm-5-3 honour the switch is not yet known. Before and after:

| Stage | Before: p50 / p90, 9 jobs since 2026-10-18 | After: the speed runs of 2026-10-24 |
|---|---|---|
| Router | about 0.3 min (2026-10-16) | 5.7 s and 3.8 s; 127 tokens, none thinking |
| Reader | replayed since 2026-10-16, its reply 4,697 tokens | 64 s and 69 s; 707 tokens, none thinking |
| Transcriptions | 2.3 / 3.2 min (2026-10-16) | first transcription past 5 min, fresh; replayed in the second |
| Planners | 11.2 / 21.5 min; second 15.5 / 20.1 | both past 4 min, asked not to think |
| Explainer, each level | 4.7 / 6.5 min | not reached |
| Reviewers | 2.8–3.4 / 5.1–5.5 min | not reached |
| Whole job | 33.5 / 84.9 min; tuberculosis failed at 33.5 | stopped at 5.1 and 5.2 min, saying so |

The deadline holds: neither run went on. R13 is not met: no world came within the budgets. Next,
one call to each planner's model asked not to think, to learn whether the switch reaches them, and
then the planners' budget or model.
