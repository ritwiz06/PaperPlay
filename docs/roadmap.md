# Roadmap

Five gates over 30 days, planned for one developer at 3–4 focused hours a day. A gate is
tagged only after `npm run check:gate` passes on the pinned runtime and `docs/status.md`
records that output. The requirements each gate enforces are machine-readable in
`gates.json`.

| Gate | Days | Tag | Effort | Exit | Requirements enforced |
|---|---|---|---|---|---|
| G1 Playable baseline | 1–7 | v0.1.0 | 21–28 h | A deterministic, testable local world with the prototype's world-first feel; nothing generated | R01–R04 |
| G2 Verified authored world | 8–14 | v0.2.0 | 21–28 h | The authored flocking world plays end to end with evidence, depth, forks and replay | R01–R08, R12 |
| G3 Constrained generation | 15–21 | v0.3.0 | 21–28 h | One generated experience from a new section, honest on failure; the reviewer cannot bypass a failed check | R01–R12 |
| G4 Evaluation and feature freeze | 22–27 | v0.4.0 | 18–24 h | Frozen protocol, every raw attempt kept, honest comparison with baseline B1 | R01–R12, plus evaluation checks added at G4 |
| G5 Delivery | 28–30 | v1.0.0 | 9–12 h | Clean-checkout reproduction, report, presentation with a labelled fallback, release notes | R01–R12 |

## G1 in order

1. Repo skeleton: workspaces, pinned Node, strict TypeScript, Vitest, Playwright,
   ESLint, a real `check:gate`. Done 2026-09-28.
2. Contracts: Origin, Anchor, SourceManifest, PrimitiveRef, Action, RunRecord, JobState.
   Done 2026-09-28.
3. Primitives: `flock.planar.weighted@1.0.0`, seeded PRNG, registry, `describe()`,
   hand-derived oracle fixtures, determinism tests. Done 2026-09-28.
4. `packages/ui` tokens, `WorldStage` (Canvas 2D, projected camera, orbit and zoom),
   `LabBench`, `CaptionStrip`, `StatusChip`. Next.
5. `apps/web` `/world/local`: live rule controls, beacon and obstacle placement,
   selected-neighbour view, next seed, replay same seed, and the render-invariance
   test (R02).
6. Playwright smoke: the page loads, a slider moves the `directionalAgreement` readout,
   no console errors (R04).

## After G5, not before

The productization port (Trigger.dev, Neon Postgres with Drizzle, Clerk, Next.js), new
primitives by ADR, and domain-agnostic ingest. See ADR-0001.
