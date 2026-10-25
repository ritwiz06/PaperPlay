# ADR-0054: The owner's decisions on the AI-papers plan

- Status: accepted. The owner, 2026-10-24, on the eight decisions `docs/design/ai-papers.md` asked
  for, and the first set of papers to build.
- Date: 2026-10-24
- Decided by: the owner.

## Context

`docs/design/ai-papers.md` (ADR-0052) ended with eight decisions for the owner: the miniature's
training, BERT's attention maps, agent tasks and budgets, code-running agents, the results
explorer, the order, the missing thirty-fifth paper, and the bonus level's weights. The owner
answered them on 2026-10-24 and chose the first papers to build.

## Decision

1. **The miniature transformer** is trained offline in Python with PyTorch, deterministically, its
   small weights committed; inference in the browser is deterministic, with the primitive's own
   `exp`. Two toy tasks are proposed in the plan; the one whose heads specialise visibly enough to
   pass the visibility rule is used.
2. **Real BERT-base attention maps** (Apache 2.0 weights), recorded once, offline, on PaperPlay's own
   sentences.
3. **Agent tasks** only from sets whose licence lets PaperPlay keep them, on small token budgets; a
   claim is tested by a paired comparison across tasks with a confidence interval, not 20 full
   repeats.
4. **Code-running agents** (SWE-agent, Agentless, AutoGen's): recorded runs only.
5. **The results explorer:** a paper's numbers kept as data, each anchored to its table, never a
   figure's image.
6. **The order:** the explorer's smallest form alongside attention, as the fast fallback (R13,
   ADR-0053); formulas second.
7. **The corpus** holds 34 papers, not 35.
8. **The owner's GPT weights:** later, optional.

**The first set to build**; every other paper gets the explorer for now:
- attention: 1706.03762, 1810.04805, 1906.04341, 1905.10650;
- formulas: 2001.08361, 1910.02054;
- diffusion: 2006.11239, 2010.02502, 2207.12598;
- agents, pre-built: 2201.11903, 2210.03629.

A hand-authored reference world for attention only; formulas and diffusion are generated first and
corrected by hand. Agent-experiment worlds are pre-built only, never made on request; the plan and
`/create` say so.

## Consequences

- The attention family begins next session: the primitive with its own `exp`, the towers kit, the
  miniature trained offline (a Python toolchain beside the repository's build, its weights data),
  Attention Is All You Need by hand, and the explorer's smallest form beside it.
- The 23 papers outside the first set have no world for now; the explorer is theirs.
