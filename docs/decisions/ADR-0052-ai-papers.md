# ADR-0052: PaperPlay teaches AI and ML papers first

- Status: accepted. The owner, 2026-10-20: PaperPlay's main purpose is teaching the AI and ML papers
  of the corpus; biomedical papers come later and the compartment family stays; G3b's Adam slices
  are paused and G3's gate becomes the attention family's first generated world, BERT; the
  gateway's address leaves tracked files. The plan's details are mine, its decisions the owner's.
- Date: 2026-10-20
- Decided by: the owner.

## Context

PaperPlay was built for "AI/ML, biomedical and scientific papers", its generated worlds so far all
compartment models from biomedical papers, and G3b's next step was Adam in the learning family. The
owner chose 34 papers on transformers, scale, diffusion and agents as what PaperPlay teaches first.

## Decision

1. **The corpus:** `docs/papers/corpus.md` and `fixtures/papers/corpus.json`, registered from arXiv
   by `npm run corpus` (title, authors, year, licence and LaTeX source as arXiv gives them). Most
   carry arXiv's non-exclusive licence: anchors and short quotes only, text never kept.
2. **The plan:** `docs/design/ai-papers.md`: five families (attention, formulas, diffusion, agent
   experiments, a results explorer), each paper's playable mechanism, kit, tier and level 1, and the
   order, attention first with Attention Is All You Need by hand as its reference.
3. **G3's gate** is BERT, generated in the attention family; G3b's Adam slices (G3b.2d, G3b.2e) and
   the learning network wait. A plan change in the roadmap.
4. **The router on the corpus** runs in the background after the land (`pipeline:live --
   corpus-route`), recorded; the next session compares its families and tiers with the plan's, and
   the papers join the routing set once the owner confirms the plan's labels.
5. **The gateway's address** is `VOYAGER_BASE_URL` in `apps/api/.env`, beside the key; the docs call it
   an OpenAI-compatible gateway, and the bundle's secret check guards its host from that file.

## Consequences

- New primitives and kits come before any generated world of these families: tier B until then.
- The plan's decisions (the miniature's training, recorded BERT maps, task sets and a live budget,
  code-running agents, the explorer's data, the order) wait on the owner.
