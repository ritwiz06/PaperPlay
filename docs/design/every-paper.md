# Every paper: the generalization audit and the plan

For the owner's review (ADR-0021). Docs only: no pipeline code until the owner has reviewed
this plan. Written 2026-10-09, in the day's sixth session.

PaperPlay is to turn AI/ML, biomedical and scientific papers into the best honest experience
each allows. Today it plays one paper, Reynolds 1987, on one primitive. This document:
1. audits what in the code assumes flocking;
2. proposes the general interfaces;
3. lays out the agent pipeline;
4. recommends the order of model families and the first test papers;
5. re-plans the roadmap, with effort;
6. says what will never work well in each domain, and how the app tells the learner.

## What this plan needs from the owner

Each decision has my recommendation first.

1. **The order of families** (§4): compartment models first, then learning toys, study design,
   grids and networks.
2. **The first test papers** (§4):
   - Kermack and McKendrick 1927, then Elowitz and Leibler 2000, for compartments;
   - Kingma and Ba 2014, then Srivastava et al. 2014, for learning toys;
   - the 1948 MRC streptomycin trial, Turing 1952, and Watts and Strogatz 1998.

   **Also needed: one CC BY paper from the PubMed Central open-access subset.** None of the
   candidates is in it, so the XML ingest path would otherwise go untested.
3. **Equations as data count as tier A** (§2.2) when four things hold:
   - every equation is anchored to the paper's own;
   - its symbols all resolve;
   - its units check;
   - the family's checks pass.

   Only the solver is trusted code. No pull request is needed per model.
4. **The level rule for models with no randomness** (§3.5). Replace "20 skies" with 20 starts:
   - the paper's own values;
   - 19 seeded draws within ±10% of each parameter and starting value, a declared
     neighbourhood.
5. **The gates, re-cut** (§5):
   - **G3a:** generalize, the compartment family, and the pipeline on it;
   - **G3b:** routing with tier C, and the learning family;
   - **G4:** evaluation on papers from all three domains;
   - **the primitive-builder agent after G4.**

   G3 as written cannot hold this work: 86–122 h against a planned 21–28 h.
6. **The primitive-builder agent** (§3.9). It comes last, behind its sandbox and the owner's
   pull-request review. It is the only agent that writes code.
7. **New dependencies,** each needing the owner's approval and an ADR:
   - a LaTeX parser for arXiv source;
   - a PDF text extractor for the fallback;
   - the Anthropic SDK in `apps/api`.

   PubMed Central's bucket is plain HTTPS, so `fetch` is enough there.
8. **The licence policy** (§3.1):
   - store anchors and quotes of at most 300 characters;
   - never rehost a source or a PDF;
   - keep paywalled PDFs in `reference/private/`;
   - ask ASU's copyright office about Turing 1952's US status and the MRC paper's.

## 1. The audit: what assumes flocking

A read-only pass over every package made **69 findings: 66 places that assume flocking, and 3
that are already general**. Of the 66:
- 47 should be generalized;
- 19 should move into a flocking kit.

About 2,300 lines would be touched, most of them mechanical moves. The design work is in
three places:
- the contracts;
- the primitive interface;
- the scene-kit boundary across the three UI layers.

Cost: S is under 50 lines touched, M is 50–300, L is over 300.

### Contracts (`packages/contracts`)

| What assumes flocking | Where | Verdict | Cost |
|---|---|---|---|
| A placement is an `x, y` on a plane | `worldspec.ts`, Placement | Generalize: a position in the primitive's declared space | M |
| Entity kinds are `beacon` and `obstacle` | `run.ts`, EntityKind, PlaceEvent, EntityEdit | Generalize: an id the primitive's `entities` declare (a schema bump) | S |
| Every control is a continuous number | `primitive.ts`, `worldspec.ts`, `run.ts` | Generalize: add choice variables, such as an optimizer or a trial arm | M |
| Time is seconds at about 1:1 with the wall clock; the level rule's 80 s; "skies" | `worldspec.ts` (RULE_MAX_SECONDS, `seconds`) | Generalize: the level's time in the primitive's own unit, with a watch-time bound | M |
| The scene is a closed enum: valley, city, reef, custom | `worldspec.ts`, DesignSpec.world | Generalize: `sceneKit: {id, version}`, checked against a kit manifest | S–M |
| The opening seed is an app constant (`HOOK_SEED = 5`) | `apps/web/src/world/local-world.ts` | Generalize: the spec's own opening seed | S |

**Already general, keep:**
- Origin, Anchor, the placeholder anchor, the pending source and SourceManifest;
- the depth variants and their word rules;
- Observable, the measured difference's summaries and claims;
- the guide script and guided exploration;
- every Level refinement:
  - one manipulable and one counterfactual;
  - exploration on the manipulable;
  - a count claim needs a prediction;
  - the bonus rule;
- the spec's checks: hook first, one action per variable, `primitivesUsed`, anchors into its
  own source, draft or reviewed;
- RunRecord's `initialState: unknown` and its sampling checks;
- the widget binding.

### Primitives (`packages/primitives`)

| What assumes flocking | Where | Verdict | Cost |
|---|---|---|---|
| `apply` takes an edit with `x, y` and beacon or obstacle | `types.ts` | Generalize, with the contract above | S |
| No query or presentation surface: Q1–Q4 and O1 are bare root exports the app imports by name | `index.ts` | Generalize: named, read-only `queries` on the primitive | M |
| `fixedTimestep` is seconds per step, played at 1x | `types.ts` | Generalize: a time unit and a playback rate (days per second for an epidemic, iterations for an optimizer) | S |
| Variables are numeric only | `types.ts` | Generalize: optional choices | S |
| No space or entity description; the builder guesses bounds from `worldWidth` and `worldHeight` | `types.ts`, the builder | Generalize: `space` (torus, grid, graph, none) and `entities` | S |
| One primitive in the registry | `registry.ts` | Keep: the list grows by ADR | S |
| Flock exports at the package root | `index.ts` | Move to `@paperplay/primitives/flock` (about 15 import sites) | S |
| The flock model itself, and the torus | `flock/*` | Move as is into the flocking family; the torus becomes a shared space | S |

**Keep:** the replay engine, whose only coupling is the edit type; the PRNG; the variable
helpers; the purity lint rules.

### Stage core (`packages/ui/src/stage-core`)

| What assumes flocking | Where | Verdict | Cost |
|---|---|---|---|
| `StageInput` is typed `FlockState` | `frame.ts` | Generalize over the kit's input | M |
| Flight altitude, bank, flap, trail length and the wrap fade | `frame.ts` constants | Move into the flocking kit's bird form | S |
| BirdPose, TrailPose, colour by heading | `frame.ts` | Move: the kit's visual forms | S |
| Ring keys `reach`, `cursor` and `spread`; emphasis `neighbours`, `reach`, `spread`, `touched` | `frame.ts` | Generalize: ring keys and emphasis chosen by the kit | S |
| FrameDescription's fixed layers (birds, trails, beacons, obstacles) and a flight-box field | `frame.ts` | Generalize: generic layers (§2.4) | M |
| The camera follows the flock's circular-mean centre | `frame.ts`, `flockCentre` | Move: the kit's `focusOf` | S |
| `describeFrame`'s bird interpolation round the torus | `frame.ts` | Move: the kit's describe step | M |
| Camera limits tuned to a 32 × 32 field at flight height | `camera.ts` | Generalize: from the bounds | S |
| Field bounds read width, depth and altitude | `screen.ts` | Generalize: a bounds box | S |
| Picking picks birds | `picking.ts` | Generalize: pickables from the kit | S |
| The compass | `compass.ts` | Move: a flocking readout | S |
| The palette mixes base roles with valley and flock roles | `palettes.ts` | Generalize: a base palette and a kit extension | M |

**Keep:**
- the fixed-step clock, its speeds and `readoutDue`;
- the colour and vector helpers;
- the camera's mathematics;
- the free-rectangle fit for the HUD.

The ground plane and orbit camera suit grids, terrain and networks too.

### Three.js adapter (`packages/ui/src/three-adapter`)

| What assumes flocking | Where | Verdict | Cost |
|---|---|---|---|
| The fallback text names the valley and its flock | `mount.ts` | Generalize: from the kit | S |
| One scene, hard-wired | `mount.ts` | Generalize: `mountStage(container, {kit})` | S |
| Birds, wings, trails, and the valley's scenery | `scene.ts`, `apply-frame.ts`, `geometry.ts` | Move into kit forms and terrain. The base keeps the scene, camera, fog, lights, sky and sun, rings, keyed markers and context-loss handling | M |
| Exports of valley geometry and bird capacity | `index.ts` | Move | S |

The lint rule that bars the adapter from primitives and contracts stays. A kit's Three.js
half takes layer data only.

### React (`packages/ui/src/react`)

| What assumes flocking | Where | Verdict | Cost |
|---|---|---|---|
| `StageDriver` is typed to the flock's input | `WorldStage.tsx` | Generalize | S |
| Tools are look, beacon, obstacle and bird | `WorldStage.tsx` | Generalize: look, place a kind, pick, from the kit's entities | S–M |
| Follow framing wraps round the torus | `WorldStage.tsx` | Generalize: the kit's focus and a `wraps` flag | S |
| HeadingCompass, SpacingGauge, SpreadDial, GroupsCounter, RocksCounter | their files | Move: flocking readouts (the gauge and dial could become generic) | S |
| The bird mascot on the guide and the world card | `hud-parts.tsx` | Generalize: from the kit | S |
| "The flock" in ForkView's label; the chart's axis in seconds | `ForkView.tsx`, `DifferenceChart.tsx` | Generalize: the time unit | S |

**Keep:**
- LevelCard and its readout slot;
- Guide, PaperJournal, LevelMap and DepthToggle;
- the origin tags and the legend;
- SpeedButton and the free-rect hook;
- ForkView's one-clock, two-pane structure.

### The builder (`packages/pipeline/src/builder`)

| What assumes flocking | Where | Verdict | Cost |
|---|---|---|---|
| `SHELL.world` allows only the valley | `build.ts` | Generalize: check the spec's scene kit against a kit manifest. The kit must draw the bound family, and have a readout, or a declared fallback, for each observable | S–M |
| Placement bounds from variables named `worldWidth` and `worldHeight` | `build.ts` | Generalize: from the primitive's `space` | S |
| A first-reach summary is in seconds | `build.ts` | Generalize: the primitive's time unit | S |
| `SAMPLE_STEPS = 6`, a tenth of a second at 60 steps a second | `difference.ts` | Generalize: from the primitive's timestep | S |

**Blocker:** lint lets the builder import only contracts and primitives. The kit manifest
must therefore be data in `contracts`, or in a new data-only package with its own lint
allowance.

**Keep:**
- validate first, then check against the registry;
- the live and start-up phase rules;
- the range, unit and integer checks;
- derived restarts;
- `summarise` and `claimHolds`.

### The React shell (`apps/web`)

| What assumes flocking | Where | Verdict | Cost |
|---|---|---|---|
| The session is the flock's throughout: its types, beacons and obstacles, Q1–Q4, the trail history, the rock prefix | `world/session.ts` | Generalize: `createWorldSession(primitive, kitAdapter, options)` | M (about 150 lines) |
| The fork imports the flock and switches the ring on by metric | `world/fork.ts` | Generalize: use the level's own primitive | S |
| The world is a hard-wired fixture | `world/authored-world.ts` | Generalize: a world loader by id, with the spec's seed | S |
| `/world/local`, the G1 bench | `world/local-world.ts`, `LocalWorld.tsx` | Move into the flocking kit's dev page, or retire it | S |
| Readouts chosen by a switch on metric names; the chart's names from a table | `hook/HookWorld.tsx` | Generalize: the kit's readout registry, a plain number as fallback, and the observable's own label | S |
| "On this sky", "across 20 skies" | `hook/HookWorld.tsx`, `hook/guide.ts` | Generalize: "run", or the kit's noun | S |
| Colour by heading, follow framing, "a world about flocking" | `hook/HookWorld.tsx` | Generalize: the kit's defaults and the spec's title | S |
| The capture's demo script | `capture/` | Move | S |

**Keep:**
- the guide's logic;
- the level-opening rule (moved through its range, never solved);
- the journal's passages and citations;
- the fork's mechanics;
- depth persistence.

### Fixtures and scripts

| What assumes flocking | Verdict | Cost |
|---|---|---|
| `flocking-reference.json` and its bindings | Keep, adding `sceneKit` | S |
| The bindings, oracle and levels-sweep harnesses typed to the flock | Generalize: share the generic oracle kinds (replay, frozen observable, threshold, metamorphic), keep one harness per family, and sweep every spec through its own primitive | M |
| Level 4's rejoin candidate, and the defaults, hook-seed and group-measure sweeps | Move with the flocking family | S |
| `scripts/gate/worlds.ts` | Keep: already generic | none |

**Tests that move:** about 750 lines of the UI tests, three web tests and about 44 browser
references. The render-invariance test is kept and run per kit.

## 2. The general interfaces

### 2.1 A primitive family

A family is a set of trusted, deterministic, tested primitives, with the checks and labels
that come with them.

```ts
interface PrimitiveFamily {
  id: "agents" | "compartments" | "learning" | "study-design" | "grids" | "networks";
  /** Shown on every world in the family, never dropped. */
  label?: "miniature: the idea at toy scale" | "a model of how the study was designed, not its data";
  /** Checks every world in the family must pass, beyond the generic ones. */
  checks: FamilyCheck[];
  /** The oracle fixture kinds its primitives use. */
  oracleKinds: OracleKind[];
  /** How the level rule varies a run (§3.5). */
  variation: "seeds" | "neighbourhood" | "cohorts";
}

interface Primitive {
  // Today's fields stay: id, version, paramSchema, stateSchema, init, step, measure, describe, apply.
  family: FamilyId;
  time: { unit: "second" | "hour" | "day" | "iteration" | "generation"; perStep: number; perWatchSecond: number };
  space: { kind: "torus2d"; width: string; height: string } | { kind: "grid"; columns: string; rows: string } | { kind: "graph" } | { kind: "none" };
  entities?: Record<string, { placeable: boolean; meaning: string }>;
  /** Read-only and named, so a kit can draw their answers. A query never changes a version. */
  queries?: Record<string, (state: unknown, params: unknown) => unknown>;
}
```

Every primitive keeps today's guarantees:
- seeded and fixed-step;
- no clock;
- its inputs never mutated;
- hand-derived oracle fixtures;
- bit-for-bit replay on one runtime.

### 2.2 Equations as data: the compartment family

A compartment model is **data**: a validated expression tree for each equation. One trusted
solver runs it. No model is code, so a new epidemic or gene-circuit model needs no pull
request, only the checks.

```ts
interface ModelSpec {
  timeUnit: "day" | "hour" | "minute" | "second" | "dimensionless";
  compartments: { id: string; name: string; unit: Unit; initial: Expr; nonNegative: boolean; anchors: Anchor[] }[];
  parameters: { id: string; symbol: string; unit: Unit; range: [number, number]; defaultValue: number; origin: Origin; anchors: Anchor[] }[];
  equations: { of: string; rate: Expr; anchors: Anchor[] }[];          // d(of)/dt = rate, one per compartment
  invariants?: { kind: "conserved"; expr: Expr; anchors: Anchor[] }[]; // only those the paper states, e.g. x + y + z = N
  observables: { id: string; label: string; expr: Expr; unit: Unit }[];
}

type Expr =
  | { n: number }                                                // a literal
  | { p: string }                                                // a parameter
  | { c: string }                                                // a compartment
  | { op: "add" | "mul"; args: Expr[] }
  | { op: "sub" | "div"; a: Expr; b: Expr }
  | { op: "neg" | "exp" | "log"; a: Expr }
  | { op: "pow"; a: Expr; b: Expr }                              // b dimensionless
  | { op: "hill"; x: Expr; k: Expr; n: Expr };                   // xⁿ / (kⁿ + xⁿ), written out on expansion
```

**What it allows:**
- arithmetic, `exp`, `log`, powers, and the Hill function;
- at most 24 compartments, 32 parameters, 400 nodes per equation, and a depth of 24.

**What it never allows:**
- strings that are evaluated;
- calls outside this closed list;
- loops;
- time as an input, for now: no forcing.

The tree is walked by an interpreter built from closures. There is no `eval` and no
`new Function`. The deploy's Content-Security-Policy, which has no `unsafe-eval`, would refuse
them anyway.

**How it is validated,** in order. Any failure stops the world:
1. **Structure:** Zod, strict, with the limits above.
2. **Names:** every `p` and `c` resolves, there is one equation per compartment, and no
   name repeats.
3. **Units:** dimensional analysis on every node.
   - Units are vectors of exponents over base dimensions: people, cells, molecules, length,
     mass and time.
   - Each rate must have its compartment's unit over the model's time unit.
   - `exp`, `log` and a power's exponent take dimensionless arguments only.
4. **Anchors:**
   - every equation is anchored to the paper's own equation, by its label or number and its
     LaTeX source;
   - every symbol in that LaTeX maps to a declared parameter or compartment.

   An invented term fails here.
5. **Numbers, from the solver, over the level rule's 20 starts (§3.5):**
   - every value stays finite;
   - every `nonNegative` compartment stays at or above −10⁻⁹ of its scale;
   - every stated invariant holds within 10⁻⁶ of its starting value;
   - halving the step changes no observable by more than its declared tolerance;
   - replay is bit for bit.
6. **Symbolic conservation,** when every rate is a polynomial, as SIR's are: the stated
   invariant's derivative expands to exactly 0.

**The solver:** `compartments.ode@1.0.0`.
- It is a fixed-step classical Runge–Kutta (RK4), hand-written with no dependency, and
  oracle-tested once:
  - against exact solutions of linear systems;
  - against the SIR final-size relation;
  - one hand-computed step.
- The step is declared per model and kept honest by the halving check.
- Stochastic versions, such as tau-leaping for an epidemic's early fade-out, come later, as
  their own primitive.

### 2.3 A scene kit

A kit decides how a family's state looks: its entities, their visual forms, the terrain, and
the readout widgets. It never measures anything.

```ts
// In contracts, as data, so the builder can check it.
interface SceneKitManifest {
  id: string; version: string;
  draws: { families: FamilyId[]; spaces: SpaceKind[] };
  terrain: "valley" | "town" | "cell" | "clinic" | "dish" | "landscape" | "network";
  forms: Record<string, string>;               // what each entity or compartment is drawn as: "bird", "person", "protein"
  readouts: Record<ObservableKind, string>;    // fraction → dial, count → counter, …; else the plain number
  palette: Record<string, TokenOrMix>;          // the kit's colour roles, each a token or a mix of two
  disclosures: string[];                        // teaching choices it makes, e.g. "each figure stands for 20 people"
}
```

Its code has three halves, each in the layer it belongs to:
- **Stage core** (pure): `describeLayers(input, emphasis, look) → Layer[]`.
- **Three.js adapter:** the forms and terrain, built from layer data only.
- **React:** its readout widgets, keyed by observable kind or id.

**Rules, each enforced by a test:**
- **Render invariance per kit:** drawing any kit, or none, leaves every observable bit for
  bit the same.
- **A kit's adapter half imports no primitive and no contract.** The existing lint rule
  covers this.
- **A kit that quantizes says so.** For example, a town of 100 figures for 10,000 people
  discloses "each figure stands for 100 people", as a teaching choice.
- **Every colour is a token or a mix of two.**
- **A kit adds no new shader mid-run.** This is this session's lesson from level 5.

**First kits:**
- the **valley**, for flocking and as the loss landscape's terrain;
- a **town**, for an epidemic;
- a **cell**, for a gene circuit;
- a **clinic**, for a trial's design;
- a **dish**, for a reaction–diffusion grid;
- a **village network**, for small worlds.

### 2.4 A FrameDescription that isn't about birds

```ts
interface FrameDescription {
  camera: FrameCamera;                   // as today
  bounds: { width: number; depth: number; height: number };
  palette: BasePalette & Record<string, string>;
  layers: Layer[];
  rings: { key: string; position: Vec3; radius: number; color: string }[];
  cursor: { position: Vec3 } | null;
}

type Layer =
  | { kind: "instances"; form: string; items: { key?: string; position: Vec3; yaw?: number; scale?: number; color: string; fade?: number; lit?: boolean }[] }
  | { kind: "terrain"; columns: number; rows: number; heights: number[]; colors: string[] }
  | { kind: "segments"; items: { points: Vec3[]; color: string; fade?: number }[] }   // trails, edges
  | { kind: "markers"; form: string; items: { key: string; position: Vec3; lit?: boolean }[] };
```

Birds become `instances` of the form "bird", trails become `segments`, and rocks become
`markers`. A loss surface is `terrain` with an optimizer's path as `segments`. A network is
houses as `instances` with roads as `segments`.

### 2.5 What WorldSpec and RunRecord need

**`worldspec/3`:**
- **`kind`:** `world`, or `explainer` for tier C, which has its own, lighter schema (§3.6).
- **`routing`:**
  - `tier`: A, B or C;
  - `family` and `reason`;
  - `primitive.status`: released, or unmerged with its pull request.

  A refinement keeps a world on an unmerged primitive a draft forever: never reviewed, and
  never shown as verified.
- **`design.sceneKit`,** `{id, version, options}`, replacing the `world` enum.
- **Bindings:** `primitive`, `equations` with the solver and a ModelSpec, or `widget`.
- **`openingSeed`.**
- **A level's time** in the primitive's unit, `{value, unit}`, replacing seconds. The builder
  checks the watch time at 4x.
- **Placements:** `{entityId, entity, at}`, `at` in the primitive's space.
- **`limits`:** at least one statement of what the world cannot show (§6), required, each with
  its origin.
- **The family's label,** required by a refinement whenever the family has one.
- **A prediction before every What-if,** made required: today the contract allows a level
  without one, and only the flocking world's test insists (ADR-0023). Generated worlds should
  not be able to skip it.

**`runrecord/3`** (predictions, this session; see §5):
- each prediction, by step, level and choice;
- generic place events, with the entity kind as an id and a position in the space. That
  part may come as `runrecord/4` with G3a.

## 3. The agent pipeline

Each stage below gives its inputs and outputs, whether it calls a model, and what it may
never do. The controller owns the job's states:
- the path: `received → parsing → planning → building → running → checking → ready`;
- the other states: `needs_information`, `unsupported`, `repairing`, `failed` and `cancelled`.

| Stage | Inputs | Outputs | Model call | May never |
|---|---|---|---|---|
| Ingest | A paper's identifier or file | SourceManifest with its licence, sections, an equation table (label, LaTeX, character offsets) and figures' captions | No | Run anything from the source; rehost it; follow its text |
| Sanitiser | The ingested text | The text with instruction-like passages removed, and a log of each removal (R09) | No | Change the meaning of a passage it keeps |
| Triage and router | The manifest, the equation table, the abstract, and the family catalogue | Domain, mechanism in a sentence, the family with its evidence, tier A, B or C, and reasons | Yes, structured output | Pick tier A without a family that exists and checks that accept the equations |
| Planner and designer | The routed paper, the family's docs, the kit catalogue, and the flocking world as the worked example | A draft WorldSpec: levels, controls, What-ifs, scene kit | Yes | Emit code; cite a passage the source does not hold, which the builder rejects against offsets |
| Explainer | The draft spec and the paper | Depth variants, guide scripts, analogies, limits, each with its origin | Yes | Present a teaching choice or an inference as the paper's |
| Level-rule sweep | The built world | Each What-if's result over 20 runs; repair requests or drops | No | Soften a stated effect's wording to pass |
| Deterministic checks | The built world | Schema, builder and registry, bindings, the family's checks, oracles, replay, render invariance per kit, provenance | No | Be skipped or waived |
| Reviewer | The spec, the paper, the check results | Findings, with scoped repair suggestions | Yes | Overturn a failed check, approve a world, or edit the spec |
| Controller | Everything above | The job's state; at most two scoped repairs per change, then the last working world | No | Reach `ready` while a required check is pending or failed |
| Primitive builder (tier B) | The paper's mechanism and equations | A branch: MODEL.md, the primitive, determinism tests; a pull request | Yes, in a sandbox | Merge, mark anything verified, or touch another package |
| Oracle deriver (tier B) | The paper's equations and MODEL.md, never the code | Oracle fixtures, hand-derivable | Yes, separate context | See the primitive's code |

### 3.1 Ingest

Best source first:
1. **arXiv LaTeX source,** for exact equations, in ML and the sciences.
   - Fetch a pinned version: `arxiv.org/src/<id>v<n>`.
   - Parse it with a restricted LaTeX parser that never runs TeX or expands untrusted macros.
   - Some sources are only a wrapper around a PDF. Adam's latest version, v9, is one; its v8
     has the real LaTeX. Ingest notices this and falls back.
2. **PubMed Central open-access JATS XML,** for biomedicine.
   - PMC retired its OA Web Service in August 2026, by its own notice; I have not checked
     this myself.
   - The routes left: the public `pmc-oa-opendata` S3 bucket, `PMCxxxx.N/PMCxxxx.N.xml`, whose
     `.json` gives `is_pmc_openaccess` and `license_code`; OAI-PMH; and E-utilities.
3. **PDF text extraction** as the fallback.
   - Equations from a PDF, and above all from a scan's OCR, are marked low-confidence.
   - They need a human transcription before any world uses them. Turing 1952 and Kermack and
     McKendrick 1927 are scans with garbled OCR in their equations.

**The source register** records each source's licence. The rules, which need the owner's
confirmation:
- **arXiv's default licence grants rights to arXiv only.** Parse the source locally, store
  anchors and short attributed quotes, and link back. Never rehost the source or the PDF.
- **CC BY:** quotes and adaptations are allowed, with attribution.
- **NC or ND licences** limit use; ND may forbid adapted text such as a level's paraphrase.
  The router routes these to tier C, or flags them to the owner.
- **Paywalled PDFs** stay in `reference/private/` (ADR-0006), quoted only in short passages.
- **Uncertain status,** such as Turing's US status or the MRC paper's, goes to ASU's copyright
  office before anything is published.

### 3.2 Routing, and what each tier shows

- **Tier A: a family covers the mechanism.** A full world, verified by the checks.
- **Tier B: a new mechanism.** The primitive builder drafts a primitive (§3.9). Until the owner
  merges it, the world is a draft, labelled "a world on a new model, not yet verified", and
  never shown as verified.
- **Tier C: no playable mechanism.** An interactive explainer (§3.6), labelled as one.

### 3.3 Planner, designer and explainer

The flocking world is their worked example: its levels, its What-ifs, its depth variants and
its guide scripts. The designer picks a scene kit from the catalogue by the family and the
paper's setting. The explainer writes `limits` for every world (§6).

### 3.4 Deterministic checks

They run in this order, and none can be waived:
1. schema;
2. builder and registry;
3. bindings;
4. the family's checks, such as §2.2's units, positivity and conservation;
5. oracles;
6. replay;
7. render invariance for the chosen kit;
8. provenance: every paper-derived statement anchored, and every quote a substring of the
   source at its offsets.

### 3.5 The level rule as a pipeline stage

Every generated What-if is swept before any learner sees it (ADR-0018). Its stated effect must
hold in its stated direction on at least 16 of 20 runs, and show within the level's time at 4x.
If it fails, it is repaired once or twice, in scope, or dropped. A level with no What-if left
is dropped, because every level needs one.

What "20 runs" means depends on the family's variation:
- **seeds,** for agents and learning toys: 20 seeds, which for a learning toy cover its
  initialisation and its data order;
- **neighbourhood,** for compartments and grids with no randomness: the paper's own values,
  plus 19 seeded draws within ±10% of each parameter and starting value;
- **cohorts,** for study design: 20 simulated cohorts.

### 3.6 Tier C, the explainer

A smaller schema, `explainerspec/1`, with no primitive. It holds:
- the paper's claims, each anchored;
- the evidence the paper reports, such as a table drawn as a chart, labelled paper-derived;
- a prediction prompt before each claim, never scored.

It never invents a mechanism or simulates a result. It opens by saying: "This paper has no
mechanism we can let you play with honestly. Here is what it claims, and the evidence it
gives."

### 3.7 Reviewer and controller

As in the brief (R10): the reviewer suggests, the checks decide. The controller allows at most
two scoped repairs per change, then keeps the last working world.

### 3.8 Real job states

As in the brief (R11): states arrive over server-sent events, there is no timed progress bar,
and `ready` is unreachable while any required check is pending or failed.

### 3.9 The primitive-builder agent, its sandbox, and the owner's review

- **The sandbox:**
  - a throwaway container with no network and no secrets;
  - time and memory limits;
  - write access to one new folder under `packages/primitives` only.
- **The lint rules still apply:** no `Math.random`, no clock, no imports from UI or Node.
- **What it writes:**
  - MODEL.md, equation by equation, each anchored to the paper;
  - the primitive;
  - determinism and replay tests.
- **The oracle deriver works separately.** It sees only the paper's equations and MODEL.md,
  never the code, and writes hand-derivable oracle fixtures, as `fixtures/oracles/README.md`
  asks.
- **The owner's step:** the agent opens a pull request and the owner reviews it. Only a merge
  and a release make the primitive tier A. Until then every world on it is a draft.

## 4. The order of families, and the first test papers

My recommendation, with reasons. The source facts come from a research pass this session;
what it could not verify is marked.

| Order | Family and kit | First paper | Second paper | Why here |
|---|---|---|---|---|
| 1 | Compartments, in a town and a cell | Kermack and McKendrick 1927 | Elowitz and Leibler 2000 | One solver serves many papers, the checks are the strongest of any family, and it reaches biomedicine and the sciences at once |
| 2 | Learning toys, on the valley as a loss landscape | Kingma and Ba 2014 (Adam) | Srivastava et al. 2014 (Dropout) | AI/ML needs its own family; the loss surface reuses the valley's terrain |
| 3 | Study design, in a clinic | MRC 1948, streptomycin | none yet | The highest risk of misleading, so it comes after the pipeline has proven itself |
| 4 | Grids, in a dish | Turing 1952 | none yet | It extends compartments to a grid with a Laplacian |
| 5 | Networks, in a village | Watts and Strogatz 1998 | none yet | A new space, the graph, with its own rewiring checks |

**The papers, one by one:**
- **Kermack and McKendrick 1927.** Free from the Royal Society, and public domain in the US.
  - Its section on constant rates, equation (29), is the SIR model: dx/dt = −κxy,
    dy/dt = κxy − ly, dz/dt = ly.
  - The paper states the invariant x + y + z = N and the threshold N = l/κ.
  - The scan's OCR garbles the equations, so they are transcribed by hand.
  - The world must say that the paper's real contribution, the infection-age model, is
    beyond it.
- **Elowitz and Leibler 2000.** Paywalled, so the PDF stays private. It tests the private-PDF
  path and nonlinearity with no conservation law.
  - Box 1 has the mRNA and protein equations with Hill repression.
  - **Not verified against the original:** the parameter values, taken from BioModels.
- **Kingma and Ba 2014.** arXiv, default licence; ingest from v8's LaTeX.
  - Algorithm 1 is verified in the source.
  - Its defaults: α = 0.001, β₁ = 0.9, β₂ = 0.999, ε = 10⁻⁸.
- **Srivastava et al. 2014.** A free JMLR PDF, copyright the authors, with no LaTeX. The 2012
  arXiv predecessor has its TeX source.
  - The world must say which convention it uses: p is the probability of keeping a unit in
    the paper, but of dropping one in today's libraries.
- **MRC 1948.** In PMC as page scans only, not in the open-access subset; its licence is
  unclear.
  - It reports 4 of 55 deaths with streptomycin against 14 of 52 with bed rest, at six months.
  - Allocation was by random sampling numbers in sealed envelopes; X-rays were read blind.
  - **Not verified:** the paper's "considerable improvement" counts.
- **Turing 1952.** Free from the Royal Society, and public domain in the UK since 2025.
  - **Unsure:** its US status.
  - Its equations (6.1) and (6.2), a ring of cells, are verified from the scan.
- **Watts and Strogatz 1998.** Paywalled; private PDF only.
  - Its rewiring procedure, L(p) and C(p) are verified from a course copy, whose authorisation
    is unclear.

**The gap:** no candidate is in the PMC open-access subset. One CC BY biomedical modelling
paper from PMC should join the set, so that ingest's XML path is tested. I have not chosen
one; the owner should, or ask me to search.

## 5. The roadmap, re-planned

Effort is Claude Code session time, at this project's pace so far. G1 took about 8 h against
21–28 h planned.

| Step | What | Effort |
|---|---|---|
| **G2, what is left** | The source register and map once the Reynolds PDF is in `reference/private/`; the fixture reviewed; the gate switched to G2 and tagged. Replay export, `/world/local` in the shell, and the stale-evidence rule move out (below) | 4–7 h |
| **G3a.1 Generalize** | worldspec/3 and runrecord/3 or 4; the primitive interface (§2.1); the kit contract across three layers (§2.3, §2.4); flocking moved into its family and kit; the session and fork made generic; tests run per kit. The flocking world plays exactly as before | 14–20 h |
| **G3a.2 Compartments and the town kit** | ModelSpec, its validator and units; the RK4 solver and its oracles; the family's checks; the town kit; Kermack and McKendrick authored by hand first, as flocking was | 14–20 h |
| **G3a.3 The pipeline on a known family** | `apps/api`: jobs, server-sent events, the sanitiser, secrets, and the bundle's key check. Ingest from arXiv source and PDF; the router, still offering compartments only; planner and designer; explainer; the sweep stage; checks; reviewer; controller; `/create` with real job states. A mock provider first, then one recorded real run. It generates the Kermack and McKendrick world and compares it with the hand-authored one | 24–32 h |
| **G3b.1 Routing and tier C** | The router across families; `explainerspec/1` and its page; PMC ingest. The stale-evidence rule lands here, since generated worlds depend on primitive versions | 8–12 h |
| **G3b.2 Learning toys and the landscape kit** | Adam on a 2-D surface beside SGD, then dropout on a tiny network; the miniature label enforced | 14–20 h |
| **G4 Evaluation** | The protocol frozen. A fixed set of papers from all three domains, at least two each, against a single-pass baseline, at least three seeds each, every raw attempt kept, and a small learning pilot | 20–28 h |
| **G3c The primitive-builder agent** | Its sandbox, the oracle deriver, the pull-request flow. After G4, unless the owner wants it before | 12–18 h |
| **G5 Delivery** | As planned | 9–12 h |
| **After G3a's first generated world** | Replay export UI, and `/world/local` in the shell (owner, this session) | 4–6 h |

**G3a and G3b together come to 74–104 h,** plus G3c's 12–18 h, against G3's planned
21–28 h. Month one cannot hold it. Either G3a ends month one, with G3b, G4 and G5 after it,
or scope is cut further. That is the owner's call.

## 6. What will never work well, and how the app says so

### AI and machine learning

- **Anything that depends on scale:** scaling laws, emergent abilities, double descent at
  scale, results that need real datasets or GPUs. A miniature can show the idea, never the
  result.
- **A toy can contradict the paper.** Adam on a 2-D bowl may lose to plain SGD, while the
  paper's experiments show the reverse at scale. The world shows its toy's result honestly and
  says why it differs.
- **Large language model papers,** where the mechanism is training on data at scale, and
  papers that are mostly proofs or benchmarks, go to tier C.
- **Deterministic training** holds only at toy scale, in pure JavaScript.

### Biomedicine

- **Empirical results cannot be simulated from first principles.** A trial's outcome is data,
  not a mechanism. A study-design world uses invented patients, says so in its label, and shows
  the paper's own numbers as paper-derived, never as simulated.
- **Fitted pharmacokinetics, imaging, omics and genome-wide studies** have no small mechanism
  to play: tier C.
- **A deterministic compartment model hides chance.** An epidemic in a small town can die
  out by luck, and the deterministic model cannot show that until a stochastic primitive exists.
- **Ethics, consent and rationing** are part of the 1948 trial's story, and no world plays
  them.

### The sciences

- **PDE-heavy models beyond a small 2-D grid,** such as fluids, climate, stiff chemistry,
  quantum systems or particle physics. They are too large or too stiff for a browser, so they
  get a much simplified miniature, or tier C.
- **Chaos and sensitive dynamics.** Bit-for-bit replay holds on one runtime only, and a world
  must state its tolerance.
- **Equations from a scan** are transcribed by a person and checked before any world uses
  them.

### Everywhere

- **Papers with no equations and no mechanism:** tier C.
- **Paywalled papers:** the learner cannot open the passage. The journal shows the citation and
  a short quote, and links to the publisher.

### How the app tells the learner

- **The world card names its kind in words:**
  - "a verified world";
  - "a world on a new model, not yet verified";
  - "an interactive explainer".
- **The family's label stays on screen,** never dropped:
  - "miniature: the idea at toy scale";
  - "a model of how the study was designed, not its data".
- **Every world has a journal page, "What this world cannot show",** from the spec's
  required `limits`. Each limit has its origin.
- **Tier C opens by saying it has no mechanism to play,** and why.
- **Origins stay on every statement,** as today:
  - paper-derived, with its anchor;
  - teaching choice;
  - computed observation;
  - generated inference.
