# Status

Updated 2026-10-24: fast generation (R13) and the owner's decisions on the AI-papers plan
([log](sessions/2026-10-24.md)). A snapshot, rewritten every session and kept under 80 lines;
history is in [progress.md](progress.md) and the session logs.

## Where we are

- **Gate:** G2 Verified authored world is current, tagged `v0.2.0` at `b37c7dc`; G1 is `v0.1.0`.
  Next: G3, whose gate is the attention family's first generated world, BERT (ADR-0052).
- **Working commit:** `aea6451`, the timing script's fix, landed on `main` with this status.
- **Purpose:** teaching the 34 AI and ML papers of `docs/papers/corpus.md`, the first set of 11
  chosen (ADR-0054); biomedical papers later, the compartment family kept. The plan is
  `docs/design/ai-papers.md`.
- **R13, fast generation** (ADR-0053): a 12-minute deadline, thinking only for the transcriptions
  and the reviewers, words only for changed levels, levels released as they pass, read once, worlds
  kept by paper and version, `prebuild`. Before: p50 33.5 min, p90 84.9 min over 9 live jobs.
  Two tuberculosis speed runs stopped at their deadlines, at 5.1 and 5.2 min, with no level: a fresh
  transcription past its 5 min (now 7), then both planners past their 4, asked not to think. R13 is
  not met yet (ADR-0053's amendment).
- **Definitional** is judged by compartment (ADR-0044's second amendment, the owner's reading
  confirmed 2026-10-24); no recorded job replays until one runs again under it.
- **Worktrees:** the main one, and `PaperPlay-land`, land's checkout for the gate (ADR-0051).
- **Model provider:** an OpenAI-compatible gateway, its address and key in `apps/api/.env` only
  (the root `.env` is gone); called only by `npm run pipeline:live`, in the background.

## What a learner can do

- `/world/hook`: Murmuration Valley, Reynolds 1987, six levels, verified.
- `/world/momentum`: Momentum Valley, Sutskever et al. 2013, five levels, verified.
- `/world/epidemic`: Threshold Town, Kermack and McKendrick 1927, five levels, a draft until its source map.
- `/world/generated/pmc-PMC12334037-2026-10-18-2`: hepatitis C, three levels, generated; levels 1
  and 3 definitional by the rule of 2026-10-20; its regeneration of 2026-10-20 failed.
- `/world/generated/arxiv-2506.19869v1-2026-10-18` and `arxiv-2506.19869v1`: tuberculosis, five levels
  each, generated; levels 1 and 3 flagged.
- `/library`: every world, retired ones marked. On this machine, `/create` shows levels as they pass
  and a paper made before at once; `/world/job/<id>` plays released levels; `/world/local`.

## Latest check:gate

G2 on the stack's tip `8379ed8`, 2026-10-20: 989 tests (vitest 892, playwright 97), 0 skipped,
passed; CI green on the same commit. `npm run land` runs it again before it pushes.

## Blockers

- **Kermack and McKendrick 1927's PDF** for Threshold Town's source map: the publisher's site
  refuses this machine; the owner downloads it.

## Decisions waiting on the owner

1. **CI minutes:** a public repository, the Student Pack, or a self-hosted runner. Before a public
   repository: set the noreply address for future commits (the command is in the 2026-10-20 log)
   and confirm the routing set's five arXiv abstracts may be kept (arXiv's metadata is CC0).
2. **The old gateway key**, replaced in `apps/api/.env` on 2026-10-24 and still valid: revoke it in
   the portal if it should not be.
3. **Paid branch protection** (ADR-0009) and **the deploy** (ADR-0017).

## Next three actions

1. Whether kimi-k2-7-code and glm-5-3 honour the thinking switch (one call each); then the
   planners' budget or model, and tuberculosis again, compared with the job of 2026-10-20.
2. The attention family: the primitive with its own `exp`, the towers kit, the miniature trained in
   PyTorch, Attention Is All You Need by hand, the explorer's smallest form beside it.
3. BERT as the family's first generated world, G3's gate.

## Recommendations

1. **Download Kermack and McKendrick 1927 in a browser.** Risk: no world may claim a passage it cannot cite.
2. **Decide CI's minutes before the attention family's sessions**, which land more often.
3. **Try the worlds on a real phone** once the deploy is live.
