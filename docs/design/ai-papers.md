# The AI-papers plan

PaperPlay's purpose from 2026-10-20 (ADR-0052): teaching the AI and ML papers of
[`docs/papers/corpus.md`](../papers/corpus.md); biomedical papers later, the compartment family
kept. This plan says, for each paper, what a learner can play, in which family and scene, at which
tier, and what its level 1 tests; then each family's effort and what it cannot show honestly; then
the order, and what the owner decided (ADR-0054). Tiers are every-paper.md's: A, a family covers
the mechanism; B, a new mechanism needs a primitive first; C, no playable mechanism, so an
explainer or the results explorer, labelled as such. A tier below is the paper's once its family
exists.

## The families, confirmed or corrected

**a. Attention (confirmed, with two cautions).** A miniature transformer, two to four layers, its
weights trained offline by PaperPlay on a toy task (copying, reversing or sorting short sequences,
and masked-word prediction on a tiny corpus) and shipped as data, inference pure and deterministic,
labelled "miniature: trained by PaperPlay on a toy task, not the paper's model". Caution one:
softmax calls `exp`, whose last bit can differ between JavaScript engines, so the primitive carries
its own `exp` to keep a run bit for bit on every browser. Caution two: several levels need no
training at all (the √dk scaling, positional encoding, the decoder's mask, path length all hold
for any weights, seeded random ones included), while multi-head specialisation needs trained
weights; the levels say which. For the BERT-analysis papers, attention maps recorded once from the
real BERT-base (Apache-2.0 weights) on PaperPlay's own sentences, stored as data with their
provenance. Scene: words as towers, attention as beams between them; a new kit.

**b. Formulas (confirmed).** Equations as data with no time axis, evaluated over the control, the
compartments' expression grammar reused without a solver: Kaplan's scaling laws and their
compute-optimal frontier; the memory, communication and pipeline-bubble arithmetic of Megatron-LM,
ZeRO and GPipe; ALBERT's parameter counts. Every constant is a quoted value with its anchor. Scene:
a GPU cluster, devices as racks, memory as their fill, a pipeline's schedule as lanes; a new kit.

**c. Diffusion (confirmed).** Two-dimensional toy data from a mixture of Gaussians, whose noised
distribution at every step is again a mixture, so its score and its optimal denoiser are exact: no
training, full determinism from a seeded generator. The forward process and its schedules (linear,
cosine), the reverse samplers (DDPM's, DDIM's with η, annealed Langevin dynamics), classifier-free
guidance with each mixture component a class, and the denoising chains of the roots. Labelled "the
exact score of a toy distribution; the paper learns it with a network". Scene: a field of points
flowing between noise and data; a new kit.

**d. Agent experiments (confirmed, corrected in three places).** Real runs of non-testing gateway
models on small task sets, recorded and replayed, with a "running the paper's experiment on
today's models" page beside each world showing the paper's numbers and ours. Corrections: the
gateway offers no sampling seed, so a claim is tested by a paired comparison across tasks, each
run recorded, with a confidence interval, not 20 full repeats (ADR-0054);
tasks must carry a licence that allows keeping them (GSM8K and the Game of 24 are MIT); and the
software-engineering agents (SWE-agent, Agentless) and AutoGen's code-running agents execute
model-written code, which is outside month one's scope except in the widget sandbox, so those are
recorded runs only, run outside PaperPlay (ADR-0054). Agent-experiment worlds are pre-built only.
Generative Agents plays in the town kit. The multi-agent failures paper uses PaperPlay's own
recorded failures (its controller's repairs and stops) as examples. Scene: an experiment bench,
tasks as cards and runs as rows; a new kit, the town kit for Generative Agents.

**e. The results explorer (confirmed, as tier C).** For mostly empirical papers: the paper's own
tables re-plotted and interactive, each number anchored to its table, never a reproduced figure.
It is also every other family's honest page for what a world cannot show (BLEU, GLUE, FID, SWE-bench).

## Each paper

| Paper | What a learner plays | Family, kit | Tier | Level 1 tests |
|---|---|---|---|---|
| 1706.03762 Attention Is All You Need | the distance between two words, √dk, heads, positions, the mask, on the miniature | attention, towers | A, hand-authored reference | "more parallelizable": one sequential step and a path of one between any two positions, against n for a recurrent layer (§4, Table 1); BLEU in the explorer |
| 1810.04805 BERT | mask words and watch the miniature fill them, with both-sided or left-only attention | attention, towers | A, generated: G3's gate | both-sided context predicts masked words better than left-to-right, on the miniature, labelled; GLUE in the explorer |
| 1906.04341 What Does BERT Look At? | a sentence and a head of real BERT-base, recorded | attention, towers | A, recorded maps | much of BERT's attention goes to [SEP] and punctuation, and some heads follow syntactic relations |
| 1905.10650 Are Sixteen Heads Really Better than One? | remove heads one at a time and watch the miniature's accuracy | attention, towers | A on the miniature; the paper's own numbers in the explorer | many heads can be removed at test time with little loss |
| 2003.10555 ELECTRA | which tokens a generator replaced, and the discriminator's guess, on the miniature | attention and explorer | C | cannot: its headline is training efficiency, which only training curves show; the explorer re-plots them |
| 1907.11692 RoBERTa | the paper's ablations: dynamic masking, next-sentence prediction, batch size, data | results explorer | C | cannot: an empirical study; its tables, interactive |
| 1910.10683 T5 | the systematic study's choices and their scores | results explorer | C | cannot: an empirical study |
| 1909.11942 ALBERT | the embedding size E and cross-layer sharing, against the parameter count | formulas, cluster | A | far fewer parameters than BERT-large for the same hidden size, from the counts' own formulas |
| 2001.08361 Scaling Laws | parameters N, data D and compute C | formulas, cluster | A | loss falls as a power law in N, D and C, with the paper's constants |
| 1909.08053 Megatron-LM | the tensor-parallel degree | formulas, cluster | A | splitting each layer's matrices lets a model too big for one device fit, at two all-reduces per layer each way |
| 1910.02054 ZeRO | the stage, 1 to 3, and the data-parallel degree | formulas, cluster | A | memory per device falls with the data-parallel degree, by the paper's own formula |
| 1811.06965 GPipe | micro-batches M and partitions K | formulas, cluster | A | the pipeline's idle bubble, (K − 1)/(M + K − 1), is small once M ≥ 4K |
| 1503.03585 Nonequilibrium Thermodynamics | the number of steps and the schedule | diffusion, field | A | a slow forward diffusion can be reversed: the reverse process turns noise back into the data |
| 1907.05600 Score-based generation (NCSN) | noise levels and Langevin's step size | diffusion, field | A | annealing over noise levels lets Langevin dynamics recover the mixture's weights, where one level does not (the paper's own toy) |
| 1305.6663 Generalized Denoising Auto-Encoders | the corruption's size | diffusion, field | A | the corrupt-and-denoise chain samples the data distribution, better as the noise shrinks |
| 1306.1091 Generative Stochastic Networks | the chain's transition and its walkback | diffusion, field | A, in 1305.6663's world | a learned transition operator's chain samples the data; shared with the denoising auto-encoders' world |
| 1703.06975 Infusion training | a chain infused with the target as it trains | explainer | C | cannot: its mechanism is a training procedure |
| 2006.11239 DDPM | the number of steps and the β schedule | diffusion, field | A | the reverse process from pure noise reproduces the data, toy-scale; FID in the explorer |
| 2010.02502 DDIM | η, from DDPM's 1 to 0, and the number of steps | diffusion, field | A | with η = 0 a few steps keep the quality that DDPM's sampler loses |
| 2102.09672 Improved DDPM | the cosine against the linear schedule | diffusion, field | A | the cosine schedule destroys information more gradually than the linear one, whose last steps are nearly pure noise |
| 2207.12598 Classifier-Free Guidance | the guidance weight w | diffusion, field | A | stronger guidance trades diversity for fidelity |
| 2112.10752 Latent Diffusion | diffusion in a compressed space | explainer and explorer | C | cannot honestly at toy scale: its point is perceptual compression of images |
| 2201.11903 Chain-of-Thought | prompts with or without worked reasoning | agents, bench | A, recorded | worked reasoning raises accuracy on multi-step word problems, the paper's numbers beside today's models' |
| 2210.03629 ReAct | reasoning and acting interleaved, against acting alone, with a local search tool | agents, bench | A, recorded | interleaving beats acting alone on multi-hop questions |
| 2303.11366 Reflexion | verbal reflection kept between trials, or not | agents, bench | A, recorded | success rises across trials with reflection |
| 2302.04761 Toolformer | its filter: keep an API call if it lowers the loss | explainer and explorer | C | cannot: it trains the model |
| 2305.14325 Multiagent Debate | the number of agents and rounds | agents, bench | A, recorded | debate raises accuracy over a single agent |
| 2305.10601 Tree of Thoughts | input-output, chain of thought, or a tree search of breadth b, on the Game of 24 | agents, bench | A, recorded | the tree search solves far more puzzles; a checker decides each |
| 2308.08155 AutoGen | conversation patterns between agents | explorer and recorded conversations | C | cannot as a measured effect: a framework, and its agents run code |
| 2304.03442 Generative Agents | memory, reflection and planning switched on or off | agents, town | A, recorded | news spreads through the town by conversation alone (the paper's party and election) |
| 2405.15793 SWE-agent | the agent-computer interface's tools | recorded runs (ADR-0054) | C | cannot without running model-written code |
| 2407.01489 Agentless | localise, repair, validate | recorded runs (ADR-0054) | C | cannot without running model-written code |
| 2310.01798 LLMs Cannot Self-Correct Reasoning Yet | rounds of self-correction with no outside feedback | agents, bench | A, recorded | self-correction without feedback does not raise accuracy, and often lowers it |
| 2503.13657 Why Do Multi-Agent LLM Systems Fail? | label recorded failures, PaperPlay's own, by the paper's taxonomy | explainer | C; CC BY-NC-ND, anchors only | cannot as an effect: a taxonomy |

## Attention Is All You Need, its levels checked

Against the paper's own sections:

1. **The hook, §4 and Table 1:** self-attention connects any two positions in one step, with one
   sequential operation per layer, where a recurrent layer needs n of each. The control is the
   distance between two words; the What-if, "what if the layer were recurrent?", measures the path
   between them: 1 against the distance. This is the headline's "more parallelizable", which a world
   can show; the BLEU scores it cannot, and the explorer holds them.
2. **Query, key and value, §3.2:** "the output is computed as a weighted sum of the values, where the
   weight assigned to each value is computed by a compatibility function of the query with the
   corresponding key". The control picks the querying word; the What-if makes every key the same,
   and attention spreads evenly. Needs no training.
3. **Dividing by √dk, §3.2.1 and its footnote:** for large dk the dot products grow, "pushing the
   softmax function into regions where it has extremely small gradients". The control is dk; the
   What-if removes the scaling, measuring how spread attention is (its entropy) and the softmax's
   gradient. Holds for seeded random queries and keys, as the footnote's argument does.
4. **Multi-head, §3.2.2:** "with a single attention head, averaging inhibits this". The control is the
   number of heads at a fixed model width; the What-if, one head, measures how many distinct
   positions the heads attend to. Needs the miniature's trained weights.
5. **Positional encoding, §3.5:** "since our model contains no recurrence and no convolution, in order
   for the model to make use of the order of the sequence, we must inject some information about the
   ... position". The control shuffles the words; the What-if removes the encoding, and each word's
   attention over the others is then the same in any order. Holds for any weights.
6. **The decoder's mask, §3.2.3:** illegal connections are masked "(setting to −∞)" to "prevent
   leftward information flow". The What-if removes the mask, measuring the attention paid to later
   words: none with it, some without.
7. **A bonus level, beyond the paper:** the owner's GPT-from-scratch weights loaded into the same
   primitive, labelled as the owner's model, not the paper's.

Refinements: level 1 is the paper's architectural claim, not its results; levels 2, 3, 5 and 6
need no training and so can come first; level 4 waits on the miniature's weights.

## Effort, in two-hour sessions

| Family | Sessions | What it cannot show honestly |
|---|---|---|
| Attention: the primitive with its own `exp`, the towers kit, the miniature's training and weights, Attention Is All You Need by hand | 6–8 | any score on a real benchmark (BLEU, GLUE); what training at scale does; a miniature is not the paper's model |
| BERT generated, G3's gate: the pipeline routing and planning for the family | 4–6 | BERT's fine-tuning results; its pre-training at scale |
| BERT-analysis maps, recorded | 2 | BERT on the paper's own data; its maps on other models |
| Formulas: no-time equations, the cluster kit, five worlds | 3–4 | wall-clock speedups on real hardware; a law beyond the range it was fitted on |
| Diffusion: exact mixture scores, the samplers, the field kit, oracles | 5–7 | image quality, FID; how a network learns the score |
| Agent experiments: task sets, the runner, the statistical level rule, the bench kit, the today's-models page | 6–9, plus live runs between sessions | the paper's own models, many retired; any model-written code run, without a sandbox |
| Results explorer | 3–4 | nothing beyond the paper's own numbers |

About 30 to 40 sessions in all.

## The order

Attention first: Attention Is All You Need by hand as the family's reference, then BERT generated
as G3's gate, with the results explorer's smallest form alongside it as every family's fast
fallback (R13); formulas second, then diffusion, then the agents. G3b's Adam slices are paused:
G3's gate is BERT (ADR-0052).

**The first set to build** (the owner, 2026-10-24); every other paper gets the explorer for now:

| Family | Papers | How |
|---|---|---|
| Attention | 1706.03762, 1810.04805, 1906.04341, 1905.10650 | Attention Is All You Need by hand, as the reference; the others generated |
| Formulas | 2001.08361, 1910.02054 | Generated first, then corrected by hand |
| Diffusion | 2006.11239, 2010.02502, 2207.12598 | Generated first, then corrected by hand |
| Agent experiments | 2201.11903, 2210.03629 | Pre-built only |

**Agent-experiment worlds are pre-built only**, never made on request: their runs call models on
task sets, which a request must not start. `/create` says so, and `pipeline:live -- prebuild` makes
them (ADR-0053).

## The attention family's slices, about two hours each

1. **The primitive** (2026-10-25, done): `attention.toy@1.0.0`, its own exp and softmax, its oracles
   written by hand, and its candidate-level generator: ten candidates from code on the paper's
   switches, each holding on 20 of 20 seeds; one head against several shows nothing yet, as the
   plan said, until the weights are trained.
2. **The scene spike** (2026-10-25, for the owner's review, unmerged): words as towers, attention as
   beams, one colour a head.
3. **Training the miniature** offline in PyTorch on "previous digit plus mirrored digit":
   deterministic, its weights committed as data, inference in the browser deterministic and checked
   against Node's bits.
4. **The scene kit**, built properly once the spike's look is approved.
5. **The results explorer's smallest form** (tier C), alongside, as every family's fallback.
6. **Attention Is All You Need**, hand-authored, the family's reference world.
7. **BERT generated**, G3's gate, its extraction by selection from the start (ADR-0056).

## The miniature's toy task

Two proposals; the one used is the one whose heads specialise visibly enough to pass the visibility
rule on level 4 (multi-head, §3.2.2), measured once the miniature is trained:

1. **Reversal:** a sequence of eight digits, written backwards. Every head learns the same
   anti-diagonal, so attention reads clearly, but one head does the whole task and the multi-head
   level would show nothing.
2. **Previous plus mirror:** at each position, the sum (mod 10) of the digit before it and the digit at
   the mirrored position. Each output needs two places at once, so two heads specialise, one on the
   diagonal below, one on the anti-diagonal, and a single head must average the two and gets it
   wrong: the What-if's measure, the distinct positions the heads attend, differs by a margin the
   rule can see. The pick, unless training shows otherwise.

## Decided by the owner, 2026-10-24 (ADR-0054)

1. **The miniature's training:** offline in Python with PyTorch, deterministic, the small weights
   committed; inference in the browser deterministic, with the primitive's own `exp`. Its task, above.
2. **Real BERT-base attention maps** (Apache 2.0), recorded once offline on PaperPlay's own sentences.
3. **Agent tasks** only from sets whose licence lets PaperPlay keep them, on small token budgets; a
   claim tested by a paired comparison across tasks with a confidence interval, not 20 full repeats.
4. **Code-running agents:** recorded runs only.
5. **The results explorer:** numbers as data anchored to tables, never figure images.
6. **The order:** the explorer's smallest form alongside attention, the fast fallback; formulas second.
7. **The corpus** holds 34 papers, not 35.
8. **The owner's GPT weights:** later, optional; the bonus level waits for them.
