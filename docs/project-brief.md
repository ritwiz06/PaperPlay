# PaperPlay project brief

PaperPlay turns a research paper into a world you can play with. The paper is the
storyline. Each level lets you change one thing, fork into one "what if the authors
had…" alternative, and see the passage in the paper that every control came from.

## Who it is for

- A curious beginner who has never read a research paper.
- A graduate student who has read this one and wants to poke at its mechanism.

## What it promises, and what it does not

- A learning sandbox: predict, intervene, observe, explain. A prediction is a prompt
  for thinking, never a graded answer.
- Not a simulation of the study. There are no scores, badges or win conditions, and no
  claim that a world reproduces the authors' results.
- Every displayed statement says where it comes from: paper-derived (with an anchor
  into the source), teaching choice, computed observation, or generated inference.

## How a world gets made

Agents read a paper section and propose a `WorldSpec`: structured data, never code. A
deterministic builder assembles the world from a registry of tested scientific
primitives. Independent checks (schema, bindings, oracles, replay, render invariance)
decide what is released. A semantic reviewer may suggest scoped repairs but cannot
overturn a failed check, and the controller allows at most two repairs per change
before keeping the last working world.

## Month one

One mechanism, done properly: local collective motion (flocking), through the primitive
`flock.planar.weighted@1.0.0`, with the Murmuration Valley prototype
(`reference/murmuration-valley.html`) as the visual direction for the world, and
Outbreak Island (`reference/outbreak-island.html`) for its game-first HUD (ADR-0008).
The architecture is domain-agnostic; month one proves it on one family of models.

Out of scope for month one: universal paper coverage; running generated code outside
the sandboxed widget tier; reproducing original experiments; billing and teams; more
than one model provider; photorealism, VR or multiplayer; the productization stack,
which is planned for after G5 (see ADR-0001).

## What success looks like at the end of month one

- A hand-authored flocking world, playable end to end with evidence, depth levels,
  forks and replay (G2).
- One world generated from a new development section, honest when it fails (G3).
- A frozen evaluation protocol, every raw attempt kept, and an honest comparison with a
  single-pass baseline. A clean negative result counts (G4).
- A clean-checkout reproduction, and a report that separates what is generated, what is
  trusted and what is decorative (G5).

## Where things live

- Build brief: `docs/BUILD_PROMPT.md`
- Standing instructions: `CLAUDE.md`
- Gates, tags and effort: `docs/roadmap.md`
- Requirements and their evidence: `docs/requirements.md`
- Current state: `docs/status.md`
- Decisions: `docs/decisions/`
- Session notes: `docs/sessions/`
