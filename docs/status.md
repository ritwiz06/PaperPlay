# Status

Updated 2026-10-20: housekeeping, the AI-papers corpus and its plan ([log](sessions/2026-10-20.md)).
A snapshot, rewritten every session and kept under 80 lines; history is in
[progress.md](progress.md) and the session logs.

## Where we are

- **Gate:** G2 Verified authored world is current, tagged `v0.2.0` at `b37c7dc`; G1 is `v0.1.0`.
  Next: G3, whose gate is now the attention family's first generated world, BERT (ADR-0052).
- **Working commit:** `063463a`, the stack's last code commit, landed on `main` with this status.
- **Purpose:** teaching the 34 AI and ML papers of `docs/papers/corpus.md`; biomedical papers later,
  the compartment family kept (ADR-0052). The plan is `docs/design/ai-papers.md`.
- **Definitional** is judged by compartment since 2026-10-20 (ADR-0044's second amendment); no
  recorded job replays until one runs again under it.
- **Worktrees:** the main one, and `PaperPlay-land`, land's checkout for the gate (ADR-0051).
- **Model provider:** an OpenAI-compatible gateway, its address and key in `apps/api/.env` only;
  called only by `npm run pipeline:live`, live runs in the background between sessions (ADR-0051).

## What a learner can do

- `/world/hook`: Murmuration Valley, Reynolds 1987, six levels, verified.
- `/world/momentum`: Momentum Valley, Sutskever et al. 2013, five levels, verified.
- `/world/epidemic`: Threshold Town, Kermack and McKendrick 1927, five levels, a draft until its source map.
- `/world/generated/pmc-PMC12334037-2026-10-18-2`: hepatitis C, three levels, generated; its hook is
  definitional by the rule of 2026-10-20, and a regeneration is running.
- `/world/generated/arxiv-2506.19869v1-2026-10-18` and `arxiv-2506.19869v1`: tuberculosis, five levels
  each, generated; levels the rule flags are named in the library; a regeneration is running.
- `/library`: every world, retired ones marked; `/create` and `/world/local` on this machine.

## Latest check:gate

G2 on the stack's tip `341fb5e`, 2026-10-19: 986 tests (vitest 889, playwright 97), 0 skipped,
passed; CI green on the same commit. `npm run land` runs it again before it pushes.

## Blockers

- **Kermack and McKendrick 1927's PDF** for Threshold Town's source map: the publisher's site
  refuses this machine; the owner downloads it.

## Decisions waiting on the owner

1. **The AI-papers plan** (`docs/design/ai-papers.md`): its families, their order, and the
   decisions listed at its end.
2. **CI minutes:** a public repository, the Student Pack, or a self-hosted runner. Before a public
   repository: set the noreply address for future commits (the command is in the 2026-10-20 log)
   and confirm the routing set's five arXiv abstracts may be kept (arXiv's metadata is CC0).
3. **The root `.env`:** a second, valid gateway key; it belongs in `apps/api/.env`, and the old key,
   still valid, revoked if it was replaced.
4. **Paid branch protection** (ADR-0009) and **the deploy** (ADR-0017).

## Next three actions

1. Review the background runs: the two regenerations, and the router on the 34 papers against the
   plan's families.
2. The attention family: Attention Is All You Need, hand-authored, as its reference world.
3. BERT as the family's first generated world, G3's gate.

## Recommendations

1. **Download Kermack and McKendrick 1927 in a browser.** Risk: no world may claim a passage it cannot cite.
2. **Decide CI's minutes before the attention family's sessions**, which land more often.
3. **Try the worlds on a real phone** once the deploy is live.
