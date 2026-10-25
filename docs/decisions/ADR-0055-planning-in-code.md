# ADR-0055: Planning in code, a compact planner, and the router's real families

- Status: accepted. The owner, 2026-10-24: move planning work from the model to code, a timed
  planner bake-off, levels reviewed as they are written, the router told what each family can play,
  R13's job budget 15 minutes. The design and the measurements are mine.
- Date: 2026-10-25
- Decided by: the owner.

## Context

The two speed runs of 2026-10-24 (ADR-0053's amendment) stopped at their deadlines: the planner,
asked to write a whole plan, took 11.2 minutes at p50 and 21.5 at p90, its replies 20.9k tokens on
average, mostly thinking, and still produced levels the rules refused and repairs that cost a
planner's call and the explainer again. The rules that judge a level (the builder, the level rule,
the visibility rule, the definitional rule) need no model: they can judge every level the model
could have proposed before any model is asked.

## Decision

1. **Candidates in code, a family's hook.** `packages/pipeline/src/candidates/`: a family supplies a
   `CandidateGenerator` (model, horizon) → candidate levels. The compartment family's takes each rate,
   halved and doubled, as the level's control and its What-if, measured on every compartment the rate
   does not feed directly (never definitional), by its peak or its value at the run's end, where that
   moves by 15% or more; the claim's margin is half the difference at the paper's values. Every
   candidate is judged by the level and visibility rules in worlds of up to nine levels, in worker
   threads (tuberculosis: 33 candidates, 14 passing, 4.6 s against 11.5 s on one thread). Attention,
   formulas and diffusion supply their own generators when they exist.
2. **A compact planner.** It reads the passing candidates (at most 30, a few per control, those that
   can be the hook listed apart) and the reader's anchored findings, and answers with ids and finding
   numbers: five levels, the hook first, no prose. Code validates the picks with the controller's own
   checks (findings, the hook on the headline, the spread rule); refused picks get one scoped repair.
   Both planners are asked at once; the first whose picks pass is used and the other is ended.
3. **The explainer writes every word**, one level at a time, in parallel: the level's own sentences
   (title, goal, the control's label and ends, the What-if's question, the effect, the prediction,
   the passage's title, what carries forward) and its words at three depths; and the world's name and
   limits in one more call. The facts stay as code chose them; a level's passage is its finding's quote.
4. **Reviewed as written.** Each level goes to both reviewers as soon as its words are written; a
   level read once is not read again unless its words or facts change.
5. **The timed planner bake-off** (`pipeline:live -- planner-bakeoff`, `eval/bakeoff/planner.json`,
   `eval/models.md`): kimi-k2-7-code and glm-5-3 both honour the thinking switch. On the compact
   prompt, three calls each: glm-5-3 3 of 3 valid, p50 3.6 s, p90 8.7 s, 50 reply tokens;
   muse-glimmer-30b 3 of 3, p50 106.5 s, p90 122.9 s, 4.4k tokens (it thinks); kimi-k2-7-code,
   glm-5-3-flash and qwen36-27b 2 of 3, each failing hepatitis C's hook; qwen36-35b-a3b 1 of 3, naming
   a candidate it was not shown. The planners are glm-5-3 and muse-glimmer-30b, of different vendors,
   neither a reviewer. The planner's reply fell from 20.9k tokens to 50.
6. **The router's real families.** It is told what each family plays today and what it does not; a
   mechanism no existing family covers is tier C until its family exists. Only a job's router reads
   this; the router bake-off keeps the instructions its recordings hold. On the corpus, all 34 papers
   are now none, tier C (before: 18 to learning, 7 to agents), and RoBERTa and Agentless, which ingest
   refused, are read: a LaTeX heading with no words once its commands are dropped now gets a name in
   the section list alone.
7. **A value at the run's end** reads the run's last sample. The last sample can fall up to an
   interval short of the end, so a time at the end rounded one past it and read nothing: every such
   claim held on 0 of 20 starts. The design bake-off, rescored, calling nothing: kimi-k2-7-code's
   levels meeting the rule rise from 9 of 15 to 12; its second planner would now be
   qwen3-235b-a22b-thinking-2507, but jobs plan in code and the compact bake-off decides.
8. **R13's job budget is 15 minutes**, its p90 target; first playable by about 5 to 7.

## Results, 2026-10-25

Tuberculosis, run live three times under these settings: twice fresh, as for an unseen paper, and
once as the job of 2026-10-20 ran, its transcriptions replayed.

| Stage | Before: 9 jobs since 2026-10-18, p50 / p90 | Speed runs of 2026-10-24 | Now, fresh, two runs | Now, transcriptions replayed |
|---|---|---|---|---|
| Router | about 0.3 min | 5.7 s; 3.8 s | 8.4 s; 3.5 s | 3.4 s, 123 tokens |
| Reader | replayed; its reply 4,697 tokens | 64 s; 69 s | 50 s; 60 s, 700 tokens, none thinking | replayed |
| Transcriptions | 2.3 / 3.2 min (2026-10-16) | over 5 min, ended; replayed | 6.9 and 6.0 min (6.5k tokens at 16 to 18 a second, about 4k thinking), then disagreeing, a repair ended at 7 min | replayed |
| Candidates, in code | none | none | not reached | 3.5 s: 33 made, 27 pass |
| Planner | 11.2 / 21.5 min, 20.9k tokens | over 4 min, ended | not reached | 2.1 s, 50 tokens (glm-5-3) |
| Explainer | 4.7 / 6.5 min a level | not reached | not reached | 57 to 67 s a level, 770 to 890 tokens, none thinking; the world's name 13 s |
| Reviewers | 2.8–3.4 / 5.1–5.5 min | not reached | not reached | 75 to 184 s a level, 1.7k to 5.1k tokens, mostly thinking; one past its 4 min |
| First playable | none | none | none | 1.3 min, five levels |
| Whole job | 33.5 / 84.9 min | stopped at 5.1 and 5.2 min | stopped at 14.1 and 13.0 min | ready at 7.9 min, four levels |

Neither fresh run made a world within 15 minutes: both stopped in the transcriptions. The first
transcriber, a model that only thinks, took 6.0 and 6.9 minutes at 16 to 18 tokens a second; then
the two transcriptions disagreed (quotes the source does not hold, then two value sets), and the
repair, the same model asked again, ran past its 7 minutes. With its transcriptions replayed, the
job was ready in 7.9 minutes, its first five levels playable at 1.3: the planner chose in 2.1 s and
50 tokens where it took 5 to 6 minutes before. The 2026-10-20 job, run the same way, failed at
33.5 minutes. Its levels were on contact, vaccination, latency and R0 (level 5 failing the rule);
today's four are on recruitment (the hook, the infectious at year 38), treatment, infection and the
death rate, each holding on 20 of 20 starts; a fifth, on contact and the vaccinated peak, was dropped
after the reviewers found its words, written twice, still claimed what the paper does not report.

## Consequences

- The old path, a planner writing the whole plan, stays for recorded jobs and the controller's tests
  of the rules; jobs from the API and `pipeline:live` plan in code.
- For a paper never seen, the transcriptions (a model that only thinks) remain the longest stage.
- R13 is met for a paper whose model is already transcribed (7.9 minutes), not yet for an unseen
  one: its two transcriptions, and their repair when they disagree, take 13 minutes or more.
