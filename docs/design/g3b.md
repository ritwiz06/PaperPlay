# G3b: routing, the explainer tier, and the learning family

A plan for the owner's review, 2026-10-17. Nothing here is built. It refines
[every-paper.md](every-paper.md) §2–§6 with what G3a taught: equations as data, two transcriptions
from different vendors that must agree, the level rule, the visibility rule, the findings check
running the paper's own numbers, and five levels with the hook never dropped (ADR-0024 to
ADR-0041).

## What G3b delivers

In plain language, G3b passes when:

1. **The router sends every paper somewhere honest.** A paper whose mechanism a released family
   covers goes to that family (tier A). A paper with no playable mechanism gets an explainer page
   (tier C), labelled as one. Nothing is sent to a family that cannot run it.
2. **A learning family exists:** small, deterministic, pure-JavaScript models of learning, each
   with hand-derived oracles and bit-for-bit replay on one runtime, drawn by a scene kit whose
   terrain is the loss surface.
3. **"miniature: the idea at toy scale"** is on screen in every learning world, at every depth,
   and the journal says what the miniature cannot show.
4. **Adam, then Dropout,** each become a world through the pipeline, every level meeting the level
   rule, the visibility rule and the findings check, with a page running the paper's own numbers
   in the form a learning toy allows.

## 1. Routing and tier C (G3b.1)

### 1.1 The router across families

- **Today:** the router answers compartments or unsupported (ADR-0033).
- **Next:** it is shown the released families as data (`FAMILIES`), each with the mechanisms it
  covers and one worked example, and answers a family and tier A, tier C with a reason, or
  unsupported. A family that is not released is never offered.
- **Its bake-off:** the routing set grows from eight papers to about sixteen, with eight AI/ML
  papers: Adam, Dropout, batch normalisation, attention, a scaling-law paper (tier C), a benchmark
  paper (tier C), a proof-only paper (tier C), and a large language model paper (tier C). The
  gold routes are mine, each with its reason; the owner reviews them.
- **A deterministic check after routing:** the family named must be released, and a learning
  route needs an algorithm or an update rule in the paper's text, found by the reader.

### 1.2 Tier C, the explainer page

As every-paper.md §3.6 sets out:
- `explainerspec/1`: the paper's claims, each anchored; the evidence it reports (a table as a
  chart) labelled paper-derived; a prediction prompt before each claim, never scored;
- it opens by saying: "This paper has no mechanism we can let you play with honestly. Here is what
  it claims, and the evidence it gives";
- the pipeline: reader, then the explainer page assembled by rule, provenance checked. No level
  rule, since nothing is simulated.

## 2. The learning family (G3b.2)

### 2.1 Its primitives

Small, deterministic and pure JavaScript, in `packages/primitives/src/learning/`: float64
throughout, a seeded generator for every random draw (initialisation, data order, dropout masks),
every sum taken in a fixed order, no workers, no clock. Each has hand-derived oracles, as the
compartment family does.

| Primitive | What it runs | Its observables |
|---|---|---|
| `learning.landscape@1` | An optimizer on a 2-D loss surface: a bowl, a ravine (an ill-conditioned quadratic), a saddle, Rosenbrock's valley, or a bowl with seeded gradient noise | The loss, the distance to the minimum, the step size, the steps taken |
| `learning.network@1` | A tiny network, two inputs, one hidden layer of eight, two outputs, on a 2-D toy dataset (two moons, a spiral, XOR), seeded | The training and test loss, the accuracy, the decision boundary as a grid |
| `learning.attention@1` | One attention head over six tokens with 2-D embeddings: queries, keys and values, the softmax, with or without the √d scaling | Each token's attention weights, their entropy, the output |

**Update rules as data, as compartment models are** (recommended; decision 1 below). A paper's
algorithm, Adam's Algorithm 1, becomes an `OptimizerSpec`: its state (m, v, t), its update
equations in the same expression grammar as a `ModelSpec`, and its hyperparameters with their
anchors. One trusted interpreter runs any of them. Two transcriptions by different vendors must
agree up to renaming, as for compartments, and the match compares equations, not names. The
alternative, a coded registry of SGD, momentum, RMSProp and Adam, is quicker but cannot take a
paper's own variant.

**Oracles,** derived by hand from the equations, never from the code:
- one Adam step on f(x, y) = x² + 10y² from (1, 1), with the paper's defaults, to every digit;
- SGD on a quadratic: the closed form of k steps;
- Adam's update is unchanged when the gradient is multiplied by a constant (up to ε);
- dropout: the expected activation with keep-probability p and the weight scaling at test time;
- softmax over two tokens, with and without √d.

### 2.2 The landscape scene kit

The valley's terrain becomes the loss surface (every-paper.md §2.3–§2.4):
- **terrain:** the surface's heights, coloured by tokens from low to high;
- **segments:** each optimizer's path;
- **markers:** where each optimizer stands now, a ball;
- **the fork:** two balls on one surface, this world's optimizer and the What-if's, so the
  difference is seen where the learner already looks;
- **the tiny network:** the dataset as points on the plane, its decision boundary as the terrain's
  colour;
- **attention:** the tokens in a row, with arcs whose weight is the attention.

Its disclosures, as teaching choices: "a 2-D surface stands in for the millions of dimensions a
real network has"; "each run is 200 steps"; "the dataset is 200 points".

### 2.3 The miniature label

`FAMILIES.learning.label` is "miniature: the idea at toy scale". The builder refuses a learning
world that drops it; the shell shows it on the world card and the level card at every depth, and a
browser test holds it. Every learning world's "What this world cannot show" says what the paper's
experiments needed that a miniature lacks (datasets, scale, GPUs).

### 2.4 The first papers

- **Adam,** Kingma and Ba 2014, arXiv 1412.6980.
  - v9 is a PDF wrapper; v8 has the LaTeX. Ingest notices and reads v8 (decision 3).
  - Algorithm 1 and its defaults: α = 0.001, β₁ = 0.9, β₂ = 0.999, ε = 10⁻⁸.
  - Its findings a miniature can test: the update is invariant to rescaling the gradient; the
    effective step is bounded by about α; bias correction matters when β₂ is near 1 (its §6.4
    and Figure 4); it adapts each parameter's step, which helps on an ill-conditioned surface.
  - Levels, as a sketch: (1) the hook, Adam beside SGD in a ravine; (2) rescale the loss
    a hundredfold: Adam's path does not move, SGD's does; (3) bias correction off, β₂ = 0.999:
    the first steps too large; (4) β₁, the momentum; (5) the step bound, α.
- **Dropout,** Srivastava et al. 2014, JMLR.
  - The JMLR PDF is copyright the authors; the 2012 arXiv predecessor, 1207.0580, has its LaTeX
    (decision 4).
  - The world must say its convention: p is the probability of keeping a unit in the paper, of
    dropping one in today's libraries.
  - Its findings a miniature can test: dropout narrows the gap between training and test loss on
    a small noisy dataset; weights scaled by p at test time match the average of the thinned
    networks; it spreads the work across units.
- **Attention,** later: Vaswani et al. 2017's scaled dot-product, with the √d scaling as its
  What-if (decision 2).

### 2.5 Running the paper's own numbers, for a learning toy

ADR-0040's check, in the form a learning toy allows:
- **the update rule against the paper:** the transcribed `OptimizerSpec` takes one step on a known
  quadratic, and the step must equal the paper's Algorithm 1 written out by hand from its own
  lines, to every digit;
- **the paper's stated properties, checked numerically:** the rescaling invariance, the step
  bound, the bias correction's effect in the first steps, each run on the toy and stated as a
  computed observation, holding or not;
- **every hyperparameter against its quote,** as for compartments: α = 0.001 as written;
- **what scale puts out of reach,** said, never attempted: "the paper's Table 2 trains on CIFAR-10
  with a GPU; a miniature cannot reproduce its numbers", a teaching choice on the page;
- **the headline:** when the paper's headline is a result at scale ("Adam converges faster than
  other methods on deep networks"), level 1 tests the mechanism behind it in the miniature, and
  says, as a computed observation, that the miniature is not the paper's experiment. When the toy
  contradicts the paper (Adam can lose to SGD on a round bowl), the world shows the toy's result
  and says why it differs (every-paper.md §6).

### 2.6 The visibility rule and the findings check, for a learning toy

- **The level rule's variation is seeds** (every-paper.md §3.5): 20 seeds, covering the
  initialisation, the data order and the dropout masks; a claim must hold on 16.
- **Visibility on the chart:** the axis fitted to the measured quantity, the loss or the accuracy,
  and the two worlds apart by a tenth of it, as for compartments.
- **Visibility in the scene:** the two balls at least a twentieth of the surface's width apart at
  some moment; for the network, at least 3% of the plane changing class; for attention, at least
  one token's heaviest weight moving to another token.
- **Findings:** five levels, at least three on anchored findings, the hook on the headline (or its
  mechanism, as above). The reviewer's definitional kind applies: "β₁ = 0 removes momentum" is a
  definition, not a finding.

## 3. Steps and effort

Effort is Claude Code session time at this project's pace; G3a.3 took about 3 days of sessions
against 24–32 h planned.

| Step | What | Effort |
|---|---|---|
| G3b.1a | The router across families, its routing set grown to sixteen, its bake-off | 4–6 h |
| G3b.1b | `explainerspec/1`, its page, the explainer assembled by rule, one tier C paper end to end | 6–8 h |
| G3b.2a | `learning.landscape@1` and `OptimizerSpec`: the interpreter, the surfaces, the oracles | 8–12 h |
| G3b.2b | The landscape kit: terrain, paths, balls, the fork on one surface, its readouts | 6–8 h |
| G3b.2c | Adam authored by hand first, as Threshold Town was, every level through the three rules | 4–6 h |
| G3b.2d | The pipeline on learning: the transcriber's grammar for algorithms, the planner's and explainer's worked example, the bake-off's learning scenario, the check of §2.5 | 8–12 h |
| G3b.2e | Adam through the pipeline, recorded and replayed | 3–5 h |
| G3b.2f | `learning.network@1`, the decision-boundary view, and Dropout through the pipeline | 10–14 h |
| Later | `learning.attention@1` and an attention paper | 6–8 h |

**G3b comes to 49–71 h** without attention, against the roadmap's 22–32 h; the difference is the
pipeline's second family (G3b.2d) and the explainer tier, which every-paper.md counted under G3b.1.
A smaller G3b is Adam alone, hand-authored and then generated, with tier C deferred: 29–43 h.

## 4. Decisions G3b needs from the owner

1. **Update rules as data** (`OptimizerSpec`, recommended), or a coded registry of optimizers.
   Data takes a paper's own variant and keeps the two-vendor agreement; a registry is quicker.
2. **The attention toy:** in G3b, or after G4. I recommend after: Adam and Dropout already test the
   family.
3. **Adam's source:** arXiv v8's LaTeX (recommended), under arXiv's licence: anchors and short
   quotes only, its text not kept.
4. **Dropout's source:** the 2012 arXiv predecessor's LaTeX, or the 2014 JMLR PDF through PDF
   ingest; and the convention shown, keep or drop.
5. **G3b's gate:** both papers through the pipeline (the full plan), or Adam through the pipeline
   and Dropout hand-authored (the smaller one).
6. **Tier C in G3b, or after G4.**
7. **The level rule's seeds for learning toys:** 16 of 20, as for flocking, or stricter for a
   deterministic optimizer on a noiseless surface, where every seed gives the same run.

## Later: equations drawn as images in a PDF

PDF ingest refuses an equation the PDF draws rather than writes (ADR-0038). Later, such an
equation can be read by a vision model, under the rule that already holds transcriptions:
- the equation's region of the page is rendered to an image locally (pdfjs with a canvas, a new
  dependency, to be approved);
- two vision models from different vendors each transcribe it to LaTeX, neither seeing the other;
- the two must agree structurally up to renaming, by the same match compartments use; they
  disagree, it stays refused, as today;
- an agreed equation is used, its provenance saying "transcribed from an image of page N", and its
  anchor the page's region rather than characters of text;
- a bake-off on equations transcribed by hand from three papers' images picks the two models.
