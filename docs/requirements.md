# Requirements

Twelve requirements, R01–R12. A requirement counts as evidenced only when tests carrying
its id in their title (for example `[R01] …`) ran and passed, none were skipped, on the
Node version pinned in `.node-version`. `npm run check:gate` enforces this for the
requirements `gates.json` lists under the current gate, and rejects tags that name no
requirement.

Each row links issue → commit → check → evidence path. There is no issue tracker yet,
so the issue column names the brief section or kickoff step that asked for the work.
The brief's tenth non-negotiable, "checks are real", is not numbered: `check:gate`
itself enforces it, and `scripts/test/gate-evidence.test.ts` tests that enforcement.

| ID | Requirement | Issue | First gate | Checked by | Commit | Evidence | Status |
|---|---|---|---|---|---|---|---|
| R01 | Deterministic, oracle-checked primitives: pure, seeded and fixed-step; the same seed and events give bitwise-identical observables on one runtime; oracle fixtures derived by hand from the equations pass | Brief §1.1, §4; kickoff step 4 | G1 | Vitest: oracle harness, determinism, step purity, PRNG reference vectors | c18488d | `packages/primitives/test/`, `fixtures/oracles/` | Evidenced: 40 tests |
| R02 | Model/render separation: the renderer only displays state; changing camera, palette or scenery never changes a measured observable | Brief §1.1; G1 step 5; ADR-0004 | G1 | Vitest: render invariance on FrameDescription; adapter import boundary (lint and test) | f89a2db | `packages/ui/test/render-invariance.test.ts`, `packages/ui/test/three-adapter.test.ts` | Evidenced: 4 tests |
| R03 | Strict, versioned contracts: unknown keys are rejected wherever meaning could change; refinements enforce anchors for paper-derived statements, exactly one manipulable and one counterfactual per level, hook first | Brief §3, §1.4; kickoff step 3; owner decisions 2026-09-30 | G1 (subset), G2 (WorldSpec) | Vitest: contract tests | c18488d, a5ca4df (runrecord/2) | `packages/contracts/test/` | G1 subset evidenced: 49 tests. WorldSpec at G2 |
| R04 | Playable local world: `/world/local` runs the primitive with live rule controls, beacon and obstacle placement, a selected-neighbour view, next seed and replay same seed; a control moves the engine parameter and the live readout | Brief §7 G1.5–6 | G1 | Playwright smoke | — | — | Not started |
| R05 | Origin labels and two-way provenance: every displayed statement carries one of four origin labels, and paper-derived needs an anchor; focusing a control highlights its passage, and clicking a passage focuses its control | Brief §1.3, §6.2 | G2 | Vitest and Playwright | — | — | Not started |
| R06 | Level structure and learning tools: hook first; one manipulable and one counterfactual per level; three depth variants; a fork view with synchronized worlds; guided exploration that never scores | Brief §1.4, §6.2 | G2 | Zod refinements, Playwright walkthrough | — | — | Not started |
| R07 | Replay and stale evidence: a RunRecord holds identity hashes, the full initial state, seed, timestep, sampling, ordered events and observables; replay matches within the declared tolerance; a new primitive version or source hash resets dependent checks | Brief §1.8, §7 G2.5–6; owner decisions 2026-09-30 | G2 | Vitest: replay engine; replay CLI and e2e on a fresh page load to come | a5ca4df | `packages/primitives/test/replay.test.ts` | Partly evidenced: 11 tests (runrecord/2, place-then-remove replay). CLI, export/import and stale-evidence rule at G2 |
| R08 | Spec, not code: agents emit a validated WorldSpec that a deterministic builder interprets against the registry; generated widgets run only behind `FEATURE_WIDGETS=1`, in a separate-origin iframe with `sandbox="allow-scripts"`, labelled generated-inference | Brief §1.2 | G2 (builder), G3 (widgets) | Binding fixtures, sandbox e2e | — | — | Not started |
| R09 | Untrusted paper text and server-only secrets: instruction-like text is stripped before any prompt and the stripping is logged; paper text cannot change controller policy; keys live only in `apps/api/.env`, and the build fails if the client bundle holds a key prefix | Brief §1.5, §1.9 | G3 | Sanitiser tests, bundle grep | — | — | Not started |
| R10 | Sovereign checks and bounded repair: the reviewer cannot turn a failed numerical or replay check into a pass; at most two scoped repairs per change, then the prior artifact stays | Brief §1.6 | G3 | Controller tests with injected failures | — | — | Not started |
| R11 | Honest job states: real lifecycle events over SSE, no timed progress, and `ready` unreachable while any required check is pending or failed | Brief §1.7 | G3 | Controller and SSE tests, create-flow e2e | c18488d (enum) | `packages/contracts/src/job.ts` | Contract only |
| R12 | Accessibility and motion floor: responsive to 360 px, visible keyboard focus, reduced motion turns off tethers and pulses, AA contrast for origin colours on cream and on dark, labelled controls, an axe scan | Brief §6.4 | G2 (axe enforced), built in from G1 | Playwright with axe | — | — | Groundwork only: labelled stage canvas, still flock under reduced motion, WebGL fallback text, portrait framing. Axe scan not started |
