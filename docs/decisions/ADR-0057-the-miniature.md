# ADR-0057: The miniature, trained: the task does not need two heads

- Status: accepted, amended 2026-10-25 (the multi-head level's task). The owner, 2026-10-25: train the miniature offline in PyTorch on "previous digit
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

## Amendment, 2026-10-25: the multi-head level's task

The owner, after the results above: the multi-head level's claim is accuracy, as the paper's is,
one head's averaging failing where two heads succeed; heads that visibly split the work are a
strong preference, not a requirement. Two goals, each on at least 16 of 20 seeds: (1) two heads beat
one on held-out accuracy by at least 10 points, the same seed; (2) preferably, one head looks at the
previous position at least twice as much as at the mirror and another head the reverse (the
dominance ratio, which replaces "more than half" as the test of a split).

**The probes**, three seeds each, then more where they were promising (`train.py --task`, `--length`):

| Candidate | Seed | Two heads | One head | Gap, points | Heads: previous / mirrored | Split |
|---|---|---|---|---|---|---|
| a. minus, 8 digits | 1 | 99.4% | 62.6% | +36.7 | 0.23/0.16; 0.49/0.28 | no |
| a. minus, 8 digits | 2 | 51.1% | 69.2% | −18.1 | 0.27/0.27; 0.25/0.24 | no |
| a. minus, 8 digits | 3 | 91.6% | 70.6% | +21.0 | 0.19/0.16; 0.50/0.32 | no |
| b. minus, 16 digits | 1 | 74.6% | 36.1% | +38.5 | 0.38/0.19; 0.39/0.20 | no |
| b. minus, 16 digits | 2 | 76.0% | 25.5% | +50.5 | 0.11/0.16; 0.41/0.22 | no |
| b. minus, 16 digits | 3 | 34.5% | 32.5% | +2.0 | 0.17/0.17; 0.17/0.16 | no |
| b. minus, 32 digits | 1 | 16.2% | 18.1% | −1.8 | 0.04/0.04; 0.05/0.05 | no |
| b. minus, 32 digits | 2 | 16.7% | 22.7% | −6.0 | 0.05/0.05; 0.08/0.08 | no |
| b. minus, 32 digits | 3 | 16.4% | 16.8% | −0.3 | 0.05/0.04; 0.05/0.05 | no |
| c. table, 8 digits | 1 | 100.0% | 99.5% | +0.5 | 0.02/0.90; 0.89/0.00 | yes |
| c. table, 8 digits | 2 | 100.0% | 99.7% | +0.3 | 0.85/0.00; 0.01/0.87 | yes |
| c. table, 8 digits | 3 | 100.0% | 81.6% | +18.4 | 0.01/0.91; 0.87/0.00 | yes |
| b and c. table, 16 digits | 1 | 100.0% | 73.9% | +26.1 | 0.87/0.01; 0.00/0.91 | yes |
| b and c. table, 16 digits | 2 | 100.0% | 74.2% | +25.8 | 0.91/0.00; 0.00/0.93 | yes |
| b and c. table, 16 digits | 3 | 100.0% | 54.4% | +45.6 | 0.00/0.94; 0.94/0.00 | yes |

The minus task keeps the two digits apart but leaves the heads blended; longer sequences widen
two heads' lead but 32 digits did not learn in 8,000 steps; the random table, with no arithmetic
shortcut, makes each head carry one digit exactly and split cleanly, but over 8 digits one head
still solves it by leaning on one position. Over 16 digits, a single head's average blends in
more distractors and the table forces the split: both goals at once. Minus over 8 digits at 20 seeds
met neither: two heads won by 10 points on 14 of 20, and split on 0 of 20.

**The chosen task: a fixed random table of the previous and the mirrored digit, over 16 digits.**
In one sentence for a beginner: each digit's answer is looked up in a fixed table, by the digit
before it and the digit in its mirrored place. It is not the simplest candidate, but the only one
that met goal 1, and it meets goal 2 too. At 20 seeds:

| Seed | Two heads | One head | Gap | Head on previous: previous / mirrored, ratio | Head on mirror: mirrored / previous, ratio | Split |
|---|---|---|---|---|---|---|
| 1 | 100.00% | 73.91% | +26.1 | 0.87 / 0.01, 147× | 0.91 / 0.00, 233× | yes |
| 2 | 100.00% | 74.21% | +25.8 | 0.91 / 0.00, 650× | 0.93 / 0.00, 211× | yes |
| 3 | 100.00% | 54.37% | +45.6 | 0.94 / 0.00, over 1000× | 0.94 / 0.00, 411× | yes |
| 4 | 100.00% | 74.12% | +25.9 | 0.74 / 0.02, 36× | 0.84 / 0.01, 144× | yes |
| 5 | 100.00% | 73.72% | +26.3 | 0.79 / 0.01, 62× | 0.85 / 0.01, 160× | yes |
| 6 | 100.00% | 54.54% | +45.5 | 0.89 / 0.01, 116× | 0.87 / 0.00, 309× | yes |
| 7 | 100.00% | 54.02% | +46.0 | 0.94 / 0.00, over 1000× | 0.96 / 0.00, 689× | yes |
| 8 | 100.00% | 54.39% | +45.6 | 0.88 / 0.00, 801× | 0.94 / 0.00, 523× | yes |
| 9 | 100.00% | 54.12% | +45.9 | 0.93 / 0.00, over 1000× | 0.93 / 0.00, 291× | yes |
| 10 | 100.00% | 55.11% | +44.9 | 0.91 / 0.00, 457× | 0.92 / 0.00, 264× | yes |
| 11 | 100.00% | 54.38% | +45.6 | 0.95 / 0.00, over 1000× | 0.94 / 0.00, 213× | yes |
| 12 | 100.00% | 36.55% | +63.5 | 0.94 / 0.00, over 1000× | 0.95 / 0.00, 326× | yes |
| 13 | 99.97% | 44.85% | +55.1 | 0.94 / 0.00, over 1000× | 0.93 / 0.00, 312× | yes |
| 14 | 100.00% | 73.57% | +26.4 | 0.95 / 0.00, over 1000× | 0.93 / 0.00, 190× | yes |
| 15 | 100.00% | 74.02% | +26.0 | 0.93 / 0.00, 775× | 0.95 / 0.00, 353× | yes |
| 16 | 100.00% | 54.66% | +45.3 | 0.95 / 0.00, over 1000× | 0.96 / 0.00, 566× | yes |
| 17 | 100.00% | 55.20% | +44.8 | 0.95 / 0.00, over 1000× | 0.88 / 0.01, 79× | yes |
| 18 | 100.00% | 73.93% | +26.1 | 0.93 / 0.00, 774× | 0.92 / 0.00, 279× | yes |
| 19 | 100.00% | 74.31% | +25.7 | 0.91 / 0.00, 907× | 0.88 / 0.01, 126× | yes |
| 20 | 100.00% | 54.33% | +45.7 | 0.92 / 0.00, 766× | 0.95 / 0.00, 316× | yes |

Two heads beat one by 25.7 points or more on 20 of 20 seeds, and split the work on 20 of 20, each
head looking at its own position at least 36 times as much as at the other. Shipped by the rule:
two heads seed 1 (100.00%, the lowest of 19 at 100%), one head seed 19 (the most accurate, 74.31%),
in `fixtures/weights/miniature-table-16-*`, the table in their manifests. attention.toy@1.2.0 scores
the task (and minus), and runs both as PyTorch does: two heads within 4.7e-7 on attention and 1.0e-6
of a row on scores, one head within 4.8e-6 and 3.7e-5, every answer the same. The candidate
generator finds the multi-head level on accuracy: one head instead of two, 100% to a median 75% of a
16-digit input, lower by more than 13 points on 17 of 20 held-out inputs.

The plus miniature stays: it teaches the scaling, the positions and the mask. A level may use a
different miniature from its world's others, labelled as a teaching choice.
