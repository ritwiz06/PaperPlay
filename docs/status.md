# Status

Updated 2026-10-25: planning in code, and R13 on tuberculosis ([log](sessions/2026-10-25.md)).
A snapshot, rewritten every session and kept under 80 lines; history is in
[progress.md](progress.md) and the session logs.

## Where we are

- **Gate:** G2 Verified authored world is current, tagged `v0.2.0` at `b37c7dc`; G1 is `v0.1.0`.
  Next: G3, whose gate is the attention family's first generated world, BERT (ADR-0052).
- **Working commit:** `70c20b8`, the branch's last code commit, landed on `main` with this status.
- **Purpose:** teaching the 34 AI and ML papers of `docs/papers/corpus.md`, the first set of 11
  chosen (ADR-0054); biomedical papers later, the compartment family kept.
- **R13, fast generation** (ADR-0053, ADR-0055): a job has 15 minutes. Planning is in code: candidate
  levels made and judged before any planner, glm-5-3 choosing in about 3 s. Tuberculosis was ready in
  7.9 min with its transcriptions replayed, first levels playable at 1.3 min; fresh, twice stopped at
  15 min in the transcriptions (6 to 7 min each, then a repair). Not yet met for an unseen paper.
- **The router** knows each family's reach: all 34 AI papers are tier C until their families exist.
- **Worktrees:** the main one, and `PaperPlay-land`, land's checkout for the gate (ADR-0051).
- **Model provider:** an OpenAI-compatible gateway, its address and key in `apps/api/.env` only;
  called only by `npm run pipeline:live`, in the background.

## What a learner can do

- `/world/hook`: Murmuration Valley, Reynolds 1987, six levels, verified.
- `/world/momentum`: Momentum Valley, Sutskever et al. 2013, five levels, verified.
- `/world/epidemic`: Threshold Town, Kermack and McKendrick 1927, five levels, a draft until its source map.
- `/world/generated/pmc-PMC12334037-2026-10-18-2`: hepatitis C, three levels, generated; levels 1
  and 3 definitional by the rule of 2026-10-20.
- `/world/generated/arxiv-2506.19869v1-2026-10-18` and `arxiv-2506.19869v1`: tuberculosis, five levels
  each, generated; levels 1 and 3 flagged. A new tuberculosis world, four levels, made 2026-10-25,
  is on this machine (job `a3d354ee`), not yet in the library.
- `/library`: every world, retired ones marked. On this machine, `/create` shows levels as they pass
  and a paper made before at once; `/world/job/<id>` plays released levels.

## Latest check:gate

G2 on `e04c6ef`, 2026-10-24: 1011 tests (vitest 911, playwright 100), 0 skipped, passed; CI green on
the same commit. `npm run land` runs it again before it pushes.

## Blockers

- **Kermack and McKendrick 1927's PDF** for Threshold Town's source map: the publisher's site
  refuses this machine; the owner downloads it.

## Decisions waiting on the owner

1. **An unseen paper's transcriptions under R13:** a longer budget for them, no repair when they
   disagree (the owner decides, as when a repair fails now), or a faster first transcriber with
   thinking kept (ADR-0055's results).
2. **CI minutes:** a public repository, the Student Pack, or a self-hosted runner; before a public
   repository, the noreply address for future commits (the 2026-10-20 log).
3. **The old gateway key**, replaced on 2026-10-24 and still valid: revoke it if it should not be.
4. **Paid branch protection** (ADR-0009) and **the deploy** (ADR-0017).

## Next three actions

1. The attention family: the primitive with its own `exp`, the towers kit, the miniature trained in
   PyTorch, Attention Is All You Need by hand, the explorer's smallest form beside it.
2. The transcriptions' place in R13, once decided.
3. BERT as the family's first generated world, G3's gate.

## Recommendations

1. **Decide the transcriptions' budget before BERT,** whose transcription is a new kind (no ODEs).
2. **Download Kermack and McKendrick 1927 in a browser.** Risk: no world may claim a passage it cannot cite.
3. **Decide CI's minutes before the attention family's sessions**, which land more often.
