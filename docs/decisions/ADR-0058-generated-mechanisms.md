# ADR-0058: An autonomous tier for papers no family covers: generated mechanisms

- Status: accepted. The owner, 2026-10-26: PaperPlay must take any paper and, on its own, produce a
  playable world in 10 to 20 minutes; verified families stay the high-trust path, and this tier
  covers everything else, promoting R08's sandboxed widget tier from a stretch goal to the main
  path. The interface, the sandboxes, the checks, the writer's comparison and the shell's
  integration below are mine, within that direction.
- Date: 2026-10-26
- Decided by: the owner.
- Replaces: the owner's "ship mode" prompt about hand-building the Attention world.

## Context

Every AI paper of the corpus routes to tier C (ADR-0052, ADR-0055): no family plays attention,
scaling laws, diffusion or agents yet, and each new family costs weeks of verified primitives and
oracles. ADR-0021 planned a tier B primitive-builder behind a pull request and the owner's review,
after G4; CLAUDE.md's second boundary allowed generated code only as widgets, behind
`FEATURE_WIDGETS=1`, in a sandboxed frame. The owner now wants a world from any paper, within the
job's deadline, with no one in the loop, while the verified families keep their trust and nothing
generated reads as verified.

## Decision

1. **A mechanism module** is plain JavaScript a coding model writes: `const mechanism = { title,
   kit, params, measurements, steps, stepLabel, init(seed, params), step(state, params),
   measure(state), frame(state) }`. Parameters carry ranges and units; measurements, units and a
   sentence of meaning; frames, one of six generic kits, every value scaled to 0..1 by the module.
   No imports, no DOM, no network, chance from the seed only. `init` takes the parameters as well
   as the seed, since a sequence's length or a grid's size is set at the start. The contract is
   `packages/contracts/src/mechanism.ts`; nothing a module returns is used until it parses there.
2. **Two sandboxes, one driver.** The driver (`@paperplay/primitives/mechanism`) takes away the
   network, storage, timers, the clock, chance and other ways out, walking the global's prototypes,
   loads the module in strict mode and answers requests as JSON. In Node: an empty V8 context
   (`vm.constants.DONT_CONTEXTIFY`), no host object put in it, code from strings refused, inside a
   worker thread with a 64 MB heap, every call stopped at 2 s and the sandbox ended past it. In the
   browser: a worker made from a blob inside `public/sandbox.html`, framed with
   `sandbox="allow-scripts"` alone, so its origin is opaque, under its own policy, `default-src
   'none'`, `connect-src 'none'`, `worker-src blob:` and a hash for its one script; the deploy
   serves it those headers and the app's own CSP everywhere else. A browser offers no per-worker
   heap limit, so a 2 MB cap on each answer stands in for one; the checks that decide run in Node.
   Tests prove, in each, that a module reaches no network, DOM, page, storage, clock or chance.
3. **Deterministic checks, in Node**: it loads; the same seed repeats exactly; it runs at its
   defaults and both ends of every range; every measurement stays finite; moving each parameter
   changes a measurement, and each measurement responds to a parameter; every frame parses in its
   kit; a step with its frame takes 8 ms or less. Their problems, in words, are what the writer is
   told. The writer never sees the checks' code.
4. **The writer**, a new stage, writes the module from the reader's mechanism, its anchored
   findings, the model's equations and a short description of the kits, with a hand-written
   module of heat on a plate as its example of the shape (never an attention module, so the
   comparison with attention.toy means something). Code only, at most 24,000 characters; it may
   answer "NO MECHANISM:" for a paper with nothing to play. **The fix loop** sends every problem back,
   at most three times after the first module, each round begun only when the job's time can hold
   it and the levels after it.
5. **The writer is glm-5-3**, chosen by a timed comparison on Attention Is All You Need (each call
   live, not recorded; `eval/bakeoff/writer.json`): glm-5-3 passed on its first module in 233 s;
   qwen3-coder-next in three rounds, 500 s; kimi-k2-7-code in two, 847 s, its first write alone
   604 s; devstral2-123b failed ranges and speed four times. Thinking off. The writer is an author,
   so no reviewer may be glm-5-3. Its stage's time is 420 s.
6. **The rest is the machinery every world meets.** Candidate levels are made in code from the
   module's parameters and measurements: each parameter at each end of its range as both the
   control and the What-if, each measurement by its end value, peak and mean, run on the level
   rule's 20 seeds in four sandboxes at once; a candidate is kept where its claim holds on 16 and
   its two curves part by a tenth of the chart on the opening seed. Then the planner chooses, the
   explainer writes, the builder builds, the level and findings rules run again, provenance, both
   reviewers. The reviewers read the module's source in place of equations; with no equations
   there is no direct-effect tag, so a definitional block is advice here, as it is anywhere the tag
   does not support it; an unsupported block sends the level's words back once.
7. **A world on a module** is in a new family, `generated`, whose label every level shows:
   "generated model: behaviour checked, not verified against the paper". Its routing is the
   `generated` tier on a `generated` primitive; the schema keeps such a world a draft, never
   reviewed. Its binding names the module by its hash (`mechanism.g<12 hex>`) and carries the
   manifest; the builder describes the module from the manifest and never runs it. The module is
   kept beside its world, as the job's `mechanism` artifact and in the cache, never inside it, and
   a page runs it only when its source's hash matches. The router's own families exclude
   `generated`, so its schema and recordings are unchanged; the library marks such a world by its
   family's label.
8. **The kits** are 2D drawings for now (`@paperplay/ui/react/mechanism`): particles, towers and
   beams, grid, network, landscape, charts, in the accepted palette. The generated world plays in
   the same game shell, with a stage of its own: the session asks the sandbox for a run's
   measurements from its start in one request, so each world of a fork is measured exactly and in
   step, and for frames a step behind the clock, which are drawing only.
9. **Fallback.** A module that still fails at the end of its fixes, a writer's refusal, or fewer
   than three candidates passing, ends the job `unsupported` with an explainer page: what the paper
   asks and finds, each finding with its passage where the source holds it, and why there is no
   world. `/create` shows it. This is the smallest form of tier C's page; `explainerspec/1`
   (every-paper.md §3.6) remains to be built.
10. **Budget.** The tier's job has 20 minutes (`deadline.mechanismJobMs`), R13's 15 extended for it;
    levels are released, playable, once they pass every check and before the reviewers have read them.

## Consequences

- CLAUDE.md's second boundary changes: generated output is still data everywhere else; the one
  piece of generated code is a mechanism module, run only in these sandboxes, under the generated
  family's label. R08's widget tier is this tier.
- A generated world is honest about what it is on every level, but it is a toy a model wrote: the
  checks hold its behaviour, not its fidelity to the paper. The owner may review one and promote it.
- The first live run, Attention Is All You Need from /create (2026-10-26): once, glm-5-3 gave nothing
  within the writer's 420 s, so a write past its time became a lost round and the writer asks for
  about 150 lines; then its module passed every check at once, 90 candidates from 220 sandbox runs
  gave 20 passing, and five levels were playable at 9.4 minutes. A reviewer then blocked the hook:
  key scaling set to 0 removes attention rather than leaving the dot products unscaled, and its
  words claimed "more peaked" against the measured "lower". Words written again could not mend a
  fact code chose, so the job asked the owner at 14 minutes. A block on a What-if should replace the
  level instead; that is the next change.
- Ten corpus papers in the background, their success rate and time, and the most common failures
  come next; then the deploy, which must serve `sandbox.html` with its own headers.
- Not done: a per-worker heap limit in the browser (none exists); 3D kits; replaying a generated
  world's runs as records; the full `explainerspec/1`.
