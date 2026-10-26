# ADR-0057: The miniature, trained: the task does not need two heads

- Status: accepted. The owner, 2026-10-25: train the miniature offline in PyTorch on "previous digit
  plus mirrored digit", 20 seeds, one shipped by a stated rule, its weights committed and checked in
  TypeScript and the browser. The results, and what they mean for the multi-head level, are mine.
- Date: 2026-10-25
- Decided by: the owner.

## Context

ADR-0054 chose PyTorch, offline, deterministic, its weights committed. The plan proposed the task
"previous digit plus mirrored digit" because each answer needs two positions at once, and claimed
that two heads would specialise, one on the previous position and one on the mirror, while a single
head, averaging the two, would get it wrong. This session tested that claim over 20 seeds.

## Decision

1. **`training/`**, a uv project outside the gate and CI: Python 3.12.13 and torch 2.14.1, pinned in
   `pyproject.toml` and `uv.lock`; `train.py`, commented for a reader learning PyTorch. CPU only,
   float32, one thread, `torch.use_deterministic_algorithms(True)`, fixed seeds. The weights are
   made once and committed in `fixtures/weights/`.
2. **The miniature** is one transformer block, as small as the task allows: 8 digits in, a 16-wide
   embedding with the sinusoidal positional encoding, two-head self-attention (each head 8 wide)
   exactly as attention.toy computes it, a residual, a 64-wide ReLU feed-forward layer with its own
   residual, and a readout to 10 digits. A linear readout of attention alone cannot add two digits
   mod 10, so the feed-forward layer is needed; narrower models (4 or 8 wide) did not learn the task.
3. **20 seeds**, each trained 8,000 steps of 256 sequences, never one of the 2,000 held out. A head
   *specialises* when more than half its attention, on the positions where previous and mirror
   differ, lands on its position; a seed's heads specialise when one head does on the previous
   position and the other on the mirror.
4. **The rule that ships a seed:** of the seeds whose heads specialised, the most accurate on the
   held-out set, the lowest seed on a tie; if none did, the most accurate of all. The one-head
   miniature, for the What-if "one head instead of two", trained alike over 20 seeds: the most accurate.
5. **Export:** `weights.bin`, every tensor as little-endian float32 in attention.toy's layout, and
   `manifest.json` with each tensor's name, shape and place, the file's sha256, the training command,
   commit, torch and Python versions, seed and metrics; `check.json`, PyTorch's own attention
   weights, scores and answers on 20 held-out inputs. A test checks each file's hash.
6. **attention.toy@1.1.0** runs trained weights: given them, the whole block and an accuracy
   observable; without them, exactly 1.0.0, its pinned bits unchanged. Its forward pass matches
   PyTorch on the 20 held-out inputs: attention weights within 1e-5 (measured 2.6e-6), scores within
   5e-5 of their row's largest (measured 1.3e-5; scores reach 155), every answer the same (the
   narrowest winning margin 3.3). One input's bits are pinned in Node, and Chromium computes the same
   digest (`/check/miniature`, development only).
7. **The candidate generator** judges a trained setting over 20 held-out inputs, its weights fixed.

## Results, 2026-10-25

| Seed | Two heads: accuracy | Head 1 on previous / mirrored | Head 2 on previous / mirrored | Specialised | One head: accuracy |
|---|---|---|---|---|---|
| 1 | 99.98% | 0.14 / 0.14 | 0.37 / 0.36 | no | 74.68% |
| 2 | 99.99% | 0.17 / 0.17 | 0.35 / 0.36 | no | 100.00% |
| 3 | 99.86% | 0.12 / 0.20 | 0.40 / 0.38 | no | 98.08% |
| 4 | 99.99% | 0.26 / 0.29 | 0.18 / 0.32 | no | 87.98% |
| 5 | 62.40% | 0.19 / 0.34 | 0.17 / 0.19 | no | 65.94% |
| 6 | 100.00% | 0.18 / 0.19 | 0.27 / 0.34 | no | 64.46% |
| 7 | 99.98% | 0.31 / 0.34 | 0.17 / 0.20 | no | 60.39% |
| 8 | 66.53% | 0.26 / 0.30 | 0.16 / 0.21 | no | 99.94% |
| 9 | 83.51% | 0.38 / 0.38 | 0.24 / 0.26 | no | 99.99% |
| 10 | 99.86% | 0.20 / 0.20 | 0.28 / 0.38 | no | 51.69% |
| 11 | 100.00% | 0.46 / 0.32 | 0.34 / 0.46 | no | 99.96% |
| 12 | 100.00% | 0.35 / 0.35 | 0.12 / 0.16 | no | 100.00% |
| 13 | 64.88% | 0.29 / 0.30 | 0.34 / 0.33 | no | 96.13% |
| 14 | 99.83% | 0.20 / 0.17 | 0.27 / 0.35 | no | 51.78% |
| 15 | 99.99% | 0.20 / 0.22 | 0.34 / 0.34 | no | 68.01% |
| 16 | 99.99% | 0.17 / 0.18 | 0.27 / 0.34 | no | 52.49% |
| 17 | 100.00% | 0.23 / 0.23 | 0.39 / 0.38 | no | 94.66% |
| 18 | 99.72% | 0.29 / 0.29 | 0.39 / 0.39 | no | 58.40% |
| 19 | 65.87% | 0.27 / 0.29 | 0.18 / 0.14 | no | 51.89% |
| 20 | 99.69% | 0.20 / 0.19 | 0.35 / 0.35 | no | 62.89% |

**No seed's heads specialised: 0 of 20.** Fourteen of 20 two-head seeds reach 99.7% or more; each
spreads its attention over the previous and the mirrored position about evenly, in both heads. One
head is enough: its best seed reaches 100%. The answer depends only on the two digits' sum, which an
even average of their vectors still carries, so the task does not need two heads, and the plan's
claim was wrong. What two heads did change is how reliably training succeeds: 14 of 20 two-head
seeds against 8 of 20 one-head seeds reached 94% or more.

Shipped: two heads, seed 6 (100.00%; no seed specialised, so the most accurate, the lowest of four
at 100%); one head, seed 2 (100.00%).

The candidate generator on the trained miniature finds 22 levels, each holding on 18 to 20 of the 20
held-out inputs, among them the positional encoding taken away (accuracy 100% to 12.5%), the
scaling taken away (to 50%) and the mask on (to 62.5%). It finds "one head instead of two" (§3.2.2)
on four measures of how the heads attend (entropy, logits' spread, largest weight, order), but not
on accuracy: one head answers as well as two. Those four describe two differently trained models,
not §3.2.2's claim that a single head's averaging loses something.

A probe, three seeds and nothing shipped, on the asymmetric task (previous − mirrored) mod 10: two
heads reached 99.4%, 51.1% and 91.6%, one head 62.6%, 69.2% and 70.6%; still no seed specialised by
the rule above, one head leaning 0.49 on the previous position against 0.28 on the mirror.

## Consequences

- The multi-head level of Attention Is All You Need waits on the owner's choice of task: an
  asymmetric one, where one head falls short, or another lesson for §3.2.2.
- The re-run of 20 seeds after the commit stamp's fix reproduced the weights bit for bit (see the
  session log), so the training is deterministic on this machine.
