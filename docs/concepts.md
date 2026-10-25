# Concepts

Every technical and scientific idea the code relies on, explained for a learner. Each
entry says what it is, where the repository uses it, why it was chosen here, and one good
place to learn more. New concepts are added in the session that introduces them.

## Science

### Boids: flocking from local rules

Craig Reynolds showed in 1987 that a convincing flock needs no leader. Each bird follows a
few rules about its near neighbours only, and the flock-wide pattern emerges from those
local decisions.

- **Used in:** `packages/primitives/src/agents/flock/MODEL.md`, `packages/primitives/src/agents/flock/step.ts`
- **Why here:** It is the mechanism of PaperPlay's first paper and the reason the world
  exists: learners change one local rule and watch the whole flock respond.
- **Learn more:** [Reynolds 1987, "Flocks, Herds, and Schools"](https://www.red3d.com/cwr/papers/1987/boids.html)

### Separation, alignment and cohesion as steering

Each rule names a velocity the bird would like to have:
- **Separation:** away from crowding neighbours.
- **Alignment:** the neighbours' average velocity.
- **Cohesion:** toward the neighbours' centre.

The bird turns toward each wish at a rate set by that rule's weight.

- **Used in:** `packages/primitives/src/agents/flock/step.ts`, `packages/primitives/src/agents/flock/params.ts`
- **Why here:** Steering toward a desired velocity gives every weight the same unit (per
  second). That makes the three sliders comparable, and the equations simple enough to
  check by hand.
- **Learn more:** [Reynolds 1999, "Steering Behaviors for Autonomous Characters"](https://www.red3d.com/cwr/steer/gdc99/)

### Torus: a world without edges

The flock lives on a rectangle whose opposite edges are joined. A bird that flies off the
right edge comes back on the left, so no bird ever meets a wall.

- **Used in:** `packages/primitives/src/spaces/torus.ts`, `packages/ui/src/stage-core/frame.ts`
- **Why here:** Walls would bend the flock and blur what the rules alone do. Without edges,
  every place in the world behaves the same, which also makes symmetry tests possible.
- **Learn more:** [Periodic boundary conditions](https://en.wikipedia.org/wiki/Periodic_boundary_conditions)

### Shortest way round (the minimum-image convention)

On a torus there are several paths between two birds. The model always uses the shortest
one: a bird at the far right edge is a close neighbour of a bird at the far left.

- **Used in:** `packages/primitives/src/spaces/torus.ts`, `packages/primitives/src/agents/flock/measure.ts`
- **Why here:** Without it, birds on either side of a seam would ignore each other, and
  the edges would come back in disguise.
- **Learn more:** [Periodic boundary conditions: the minimum-image convention](https://en.wikipedia.org/wiki/Periodic_boundary_conditions)

### Directional agreement (an order parameter)

Average every bird's heading as a unit arrow and measure the length of that average. Zero
means the headings cancel out; one means every bird flies the same way.

- **Used in:** `packages/primitives/src/agents/flock/measure.ts`, `eval/sweeps/flock-defaults.md`
- **Why here:** A single number shows whether a murmuration has formed. It is the readout
  learners watch when they change alignment.
- **Learn more:** [Vicsek et al. 1995, "Novel type of phase transition in a system of self-driven particles"](https://doi.org/10.1103/PhysRevLett.75.1226)

### Nearest-neighbour distance

For each bird, find the distance to its closest neighbour, then average over the flock. It
shows how tightly the birds pack.

- **Used in:** `packages/primitives/src/agents/flock/measure.ts`
- **Why here:** It responds directly to separation and cohesion, so learners can see
  spacing change. Unlike a distance limited to the perception radius, it is defined for
  every flock.
- **Learn more:** [Collective animal behaviour](https://en.wikipedia.org/wiki/Collective_animal_behavior)

### Groups as connected components

Link two birds when they are closer than 4.5 world units and their headings differ by less
than 45°, and follow the links. Every set of birds that can reach each other is a cluster,
found with a union–find structure. A cluster of at least 4 birds is a group; smaller ones
are strays. The flock reads as "one group" when it has exactly one group and at most half
its birds are strays.

- **Used in:** `packages/primitives/src/agents/flock/measure.ts` (E14, E18, O1),
  `eval/sweeps/group-measure.md`, `docs/decisions/ADR-0015-group-measure.md`
- **Why here:** "One murmuration" needs a definition that random noise cannot meet. The link
  distance is fixed, so counts stay comparable when a learner changes how far birds can see.
  The heading condition and the strays rule are the owner's; the sweep showed each half
  alone is not enough.
- **Learn more:** [Disjoint-set (union–find) data structure](https://en.wikipedia.org/wiki/Disjoint-set_data_structure)

### Percolation: when scattered points join up

Link every pair of points closer than a set distance. Below a critical density the links
form many small clusters; near it, one cluster suddenly spans the whole space. For points
in a plane, that happens when each point has on average about 4.5 links.

- **Used in:** `scripts/sweep/group-measure.ts`, `eval/sweeps/group-measure.md`, `docs/decisions/ADR-0003-flock-defaults.md`
- **Why here:** The default flock sits close to that threshold (about 4.4 links per bird).
  So under distance alone, 17% of purely random scatters count as "one group". That is why
  flock 3.0.0 also asks links to share a heading, and the flock to have few strays
  (ADR-0015).
- **Learn more:** [Percolation threshold](https://en.wikipedia.org/wiki/Percolation_threshold)

### Semi-implicit Euler integration

Each step updates a bird's velocity first, then moves it using the new velocity. It is the
simplest stable way to advance a simulation by a fixed time step.

- **Used in:** `packages/primitives/src/agents/flock/step.ts`
- **Why here:** It is cheap and stable at 1/60 s steps, and easy to reproduce by hand in
  the oracle fixtures.
- **Learn more:** [Semi-implicit Euler method](https://en.wikipedia.org/wiki/Semi-implicit_Euler_method)

### Compartment models (S, I and R)

Split a population into a few groups, such as those who can still catch a disease (S), those who
have it (I) and those who no longer do (R), and write how fast people move between them as
equations. Each group is one number for the whole of it: nobody is followed one by one.

- **Used in:** `packages/contracts/src/model.ts`, `packages/primitives/src/compartments/MODEL.md`
- **Why here:** Kermack and McKendrick's 1927 model of an epidemic is three such equations. As
  data, a ModelSpec, one trusted solver runs it and any other model like it (ADR-0028).
- **Learn more:** [Wikipedia, "Compartmental models in epidemiology"](https://en.wikipedia.org/wiki/Compartmental_models_in_epidemiology)

### The basic reproduction number and the next-generation matrix

R0 is how many people one infected person infects, on average, in a population where nobody is
yet infected. Above 1 an infection spreads; below 1 it dies out. For a model with several
infected groups, it is the largest eigenvalue of the next-generation matrix F·V⁻¹, where F holds
how fast each infected group makes new infections and V how fast people leave each group, both
at the disease-free state.

- **Used in:** `packages/pipeline/src/reproduce/ngm.ts`
- **Why here:** Running a paper's own numbers recomputes its R0 from the transcribed equations,
  through this matrix, and compares it with the paper's formula at the same values; only when the
  two agree can a world say the paper's headline does not appear at its listed values (ADR-0040).
- **Learn more:** [van den Driessche and Watmough, "Reproduction numbers and sub-threshold endemic equilibria" (2002)](https://doi.org/10.1016/S0025-5564(02)00108-6)

### Runge–Kutta integration (RK4)

To follow a model through time, take small steps. RK4 looks at the rate four times within each
step, at its start, twice at its middle and at its end, and takes a weighted average, so its error
shrinks with the fourth power of the step.

- **Used in:** `packages/primitives/src/compartments/rk4.ts`
- **Why here:** One fixed-step RK4 solver runs every compartment model, its arithmetic in a fixed
  order so a run replays bit for bit; the oracles check it against exact solutions.
- **Learn more:** [Wikipedia, "Runge–Kutta methods"](https://en.wikipedia.org/wiki/Runge%E2%80%93Kutta_methods)

### Stiff equations, and the step-halving check

Some models change on two very different time scales at once. A fixed step that is fine for the
slow part can make the fast part blow up. Running the model again at half the step shows it: if
the two runs disagree, the step is too coarse for this model.

- **Used in:** `packages/primitives/src/compartments/checks.ts`
- **Why here:** The owner asked that a model the solver cannot follow be refused honestly, never
  drawn wrong. The accuracy check compares every compartment at dt and dt/2.
- **Learn more:** [Wikipedia, "Stiff equation"](https://en.wikipedia.org/wiki/Stiff_equation)

### The epidemic threshold

In Kermack and McKendrick's model, the ill grow only while the number still well is above the
rate of removal divided by the rate of infection, l/κ. Below it, each ill person passes the
illness to fewer than one other before being removed, and the epidemic fades out. The same
idea is now usually written as the basic reproduction number, R₀, being above 1.

- **Used in:** `fixtures/worldspecs/kermack-mckendrick-1927.json`, Threshold Town's levels 3
  to 5
- **Why here:** It is the paper's central result, and it explains why the epidemic ends while
  people are still well.
- **Learn more:** [Wikipedia, "Basic reproduction number"](https://en.wikipedia.org/wiki/Basic_reproduction_number)

### Checking a claim near its values (a parameter neighbourhood)

A model with no chance in it gives one answer for one set of values, so running it 20 times
on the same values proves nothing. Instead, a claim is checked on the world's own values and on
19 others, each parameter nudged by up to a tenth. A claim that holds only at one exact point
is fragile; one that holds across the neighbourhood is a property of the model there.

- **Used in:** `scripts/sweep/levels.ts`
- **Why here:** The owner's level rule for deterministic models (ADR-0024): the claim must
  hold on at least 16 of the 20.
- **Learn more:** [Wikipedia, "Sensitivity analysis"](https://en.wikipedia.org/wiki/Sensitivity_analysis)

### Emergence

Order at the scale of the whole flock that no single bird plans. The defaults sweep
measured how often local rules alone produce one ordered group within 20 seconds.

- **Used in:** `eval/sweeps/flock-defaults.md`, `docs/decisions/ADR-0003-flock-defaults.md`
- **Why here:** It is the idea the opening level teaches, and the reason the defaults had
  to be measured rather than assumed.
- **Learn more:** [Reynolds, "Boids: background and update"](https://www.red3d.com/cwr/boids/)

### Randomness of headings (the mean resultant length)

The average of many headings drawn at random is a short arrow. Its expected length shrinks
like one over the square root of the number of birds.

- **Used in:** `fixtures/oracles/flock.planar.weighted/rules-off-initial-agreement-low.json`, `packages/primitives/src/agents/flock/headings.ts`, `packages/ui/src/react/kits/valley/HeadingCompass.tsx`
- **Why here:** It is why a freshly seeded flock starts with low agreement, and how the
  oracle bounds that start with stated odds rather than a guess. The heading compass draws
  it: the arrow is the mean of the birds' unit headings, so it is short when they scatter
  and nearly as long as the ring when they agree.
- **Learn more:** [Directional statistics](https://en.wikipedia.org/wiki/Directional_statistics) and
  [Circular mean](https://en.wikipedia.org/wiki/Circular_mean)

### Averaging conserves the total (consensus dynamics)

When each bird moves its velocity toward the average of birds that all see each other, the
flock's total velocity never changes; only its spread shrinks.

- **Used in:** `fixtures/oracles/flock.planar.weighted/alignment-conserves-velocity-sum.json`
- **Why here:** It is an exact law the alignment rule must obey, so an oracle can catch a
  wrong average without knowing any numbers in advance.
- **Learn more:** [Olfati-Saber, Fax and Murray 2007, "Consensus and Cooperation in Networked Multi-Agent Systems"](https://doi.org/10.1109/JPROC.2006.887293)

### Banking into a turn

A bird turning at rate ω while flying at speed v leans by an angle whose tangent is
v·ω divided by gravity. Turning harder or faster means leaning further.

- **Used in:** `packages/ui/src/stage-core/frame.ts`
- **Why here:** It makes turns readable on screen. It is computed from two consecutive
  states, purely for display, and never feeds back into the simulation.
- **Learn more:** [Banked turn](https://en.wikipedia.org/wiki/Banked_turn)

### Momentum and Nesterov's accelerated gradient

Gradient descent steps against the slope. Momentum keeps a velocity, a running sum of past steps
each decayed by μ, so the step grows where the slope keeps pointing the same way, towards ε/(1 − μ)
times a plain step, and swings across a steep valley. Nesterov's method takes the gradient a step
ahead, at θ + μ·v, which damps the swing where the curvature is high.

- **Used in:** `scripts/fixtures/momentum.ts`, `fixtures/oracles/learning.landscape/`, `packages/primitives/src/learning/MODEL.md`
- **Why here:** Momentum Valley, the learning family's reference world, teaches both on an oblong
  bowl like Sutskever et al. 2013's own example; its oracles are their closed forms (ADR-0047).
- **Learn more:** [Sutskever et al. 2013, On the importance of initialization and momentum in deep learning](https://proceedings.mlr.press/v28/sutskever13.html)

## Engineering


### Restricted readers for untrusted files

A file from outside can be built to attack whatever reads it: an archive whose paths climb out of
its folder, a LaTeX macro that runs a command, an XML entity that pulls in a local file. A
restricted reader understands only what it needs, refuses the rest, and never runs or fetches
anything a file asks for.

- **Used in:** `packages/pipeline/src/ingest/archive.ts`, `packages/pipeline/src/ingest/latex.ts`,
  `packages/pipeline/src/ingest/xml.ts`
- **Why here:** A paper is untrusted input (CLAUDE.md boundary 4).
- **Learn more:** [OWASP, "XML External Entity Prevention"](https://cheatsheetseries.owasp.org/cheatsheets/XML_External_Entity_Prevention_Cheat_Sheet.html)

### Record and replay (recorded test doubles)

A test that calls a live service is slow, costly and different every run. Instead, every live
call is saved once, as the response under a hash of the request; tests answer each call from that
recording, so they run offline and always see the same reply. A changed request has a new hash and
no recording, which fails loudly rather than calling out.

- **Used in:** `packages/pipeline/src/models/recording.ts`
- **Why here:** The owner asked that tests and CI never call the model gateway (ADR-0030).
- **Learn more:** [Martin Fowler, "Self-Initializing Fake"](https://martinfowler.com/bliki/SelfInitializingFake.html)

### Exponential backoff

When a server is busy, a client that retries at once makes it busier. Waiting longer after each
failure, doubling the wait, gives it room to recover; a server that says how long to wait, in a
Retry-After header, is believed.

- **Used in:** `apps/api/src/models/voyager.ts`
- **Why here:** The gateway rate-limits, and some of its models are slow under load.
- **Learn more:** [Wikipedia, "Exponential backoff"](https://en.wikipedia.org/wiki/Exponential_backoff)

### Structured output (a reply held to a JSON Schema)

A language model writes text. Asked for data, it can be held to a JSON Schema by the server, or
asked for JSON and checked afterwards. Either way the reply is validated before anything uses it,
and a reply that fails is sent back once with the error.

- **Used in:** `packages/pipeline/src/models/structured.ts`, `scripts/live/probe.ts`
- **Why here:** Every stage's output must be data the builder can check, never free text (R08).
- **Learn more:** [JSON Schema, "Getting started"](https://json-schema.org/learn/getting-started-step-by-step)

### Constrained decoding, and when it goes wrong

A server that holds a model to a JSON Schema does it by constrained decoding: at each step it
lets the model choose only tokens the schema's grammar allows. The reply is always valid JSON,
but not always useful. A grammar that allows whitespace anywhere lets a model loop on spaces
until its limit, and a reasoning model can spend its whole budget thinking before the grammar
lets it write. The fallback is to ask for plain JSON and check it afterwards.

- **Used in:** `packages/pipeline/src/models/structured.ts` (the fallback), `packages/pipeline/src/stages/planner.ts` and `packages/pipeline/src/stages/explainer.ts` (plain JSON always)
- **Why here:** In the bake-off, models held to the planner's large schema looped or wrote nothing (ADR-0035).
- **Learn more:** [vLLM, "Structured outputs"](https://docs.vllm.ai/en/latest/features/structured_outputs.html)

### Streaming a reply, and a proxy's idle timeout

A server can send its reply as it is made, as server-sent events, each a line `data: {…}`. A
proxy between the client and the server (here, Cloudflare in front of the gateway) gives up on a
connection that carries nothing for too long and answers 524. Streaming keeps bytes moving while
a slow model works; the client joins the pieces into one reply before anything else reads it.

- **Used in:** `apps/api/src/models/voyager.ts`, `apps/api/src/models/node-fetch.ts`
- **Why here:** Reasoning models took longer than the proxy would wait, and longer than Node's own fetch waits for headers (ADR-0030's amendment).
- **Learn more:** [MDN, "Using server-sent events"](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
### Radius of gyration, and a centre on a wrap-around world

The radius of gyration of some points is how far, on average, they lie from their centre:
the square root of the mean squared distance. On a torus, "the centre" needs care: averaging
x = 31 and x = 1 gives 16, the wrong side of the world. The circular mean treats each
coordinate as an angle round a circle and averages the angles instead, giving 0.

- **Used in:** `packages/primitives/src/agents/flock/measure.ts` (E19 and Q3), the spread ring and
  dial
- **Why here:** Level 4's lesson is how compact a flock stays. Without cohesion, the largest
  group's radius grows from about 5 to about 12 world units, on every one of 20 skies
  (ADR-0018).
- **Learn more:** [Radius of gyration](https://en.wikipedia.org/wiki/Radius_of_gyration),
  [Circular mean](https://en.wikipedia.org/wiki/Circular_mean)

### A Content-Security-Policy

A response header that tells the browser where a page may load scripts, styles, fonts and
data from, and whether it may run inline code or `eval`. Anything else is blocked and
reported, so an injected script cannot run with the page's rights.

- **Used in:** `vercel.json`, `scripts/serve-dist.ts`, `tests/e2e/csp.spec.ts`,
  `apps/web/src/strict-csp.ts`
- **Why here:** The deploy is public. The policy allows only the page's own origin and no
  eval, and is tested against the built app before the first deploy (ADR-0017).
- **Learn more:** [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)

### Predict, observe, explain

A way of learning from an experiment: say what you expect before you look, watch what
happens, then explain the gap. Committing to a prediction first makes a surprise noticeable,
where watching alone lets it slide past.

- **Used in:** `apps/web/src/hook/guide.ts`, `tests/e2e/guided.spec.ts`,
  `fixtures/worldspecs/flocking-reference.json` (level 2)
- **Why here:** Level 2's result is a surprise: seeing the whole flock does not bring order
  sooner (faster on only 6 of 20 skies). The guide asks first, then reports what was
  measured, and never scores the guess.
- **Learn more:** [White and Gunstone 1992, *Probing Understanding*](https://www.taylorfrancis.com/books/mono/10.4324/9780203761342/probing-understanding-richard-gunstone-richard-white)

### Code splitting (loading a module on demand)

A bundler normally puts every imported module into one file the browser must download before
anything runs. An `import()` call instead marks a split point: that module, and what only it
needs, goes into its own chunk, fetched when the call runs.

- **Used in:** `packages/ui/src/react/WorldStage.tsx`, `scripts/test/bundle.test.ts`
- **Why here:** Three.js was more than half the bundle. Loading it when the stage mounts lets
  the HUD draw first. A test builds the bundle to check the split holds, since a single eager
  import anywhere would undo it (ADR-0017).
- **Learn more:** [Vite: dynamic import](https://vite.dev/guide/features#dynamic-import)

### Fixed-step simulation loop

Wall-clock time from each frame goes into an accumulator. The simulation then takes as
many whole 1/60 s steps as that time allows, capped so a stall cannot snowball.

- **Used in:** `packages/ui/src/stage-core/fixed-step.ts`, `apps/web/src/world/session.ts`
- **Why here:** States then depend only on the number of steps, never on the frame rate,
  which is what makes runs reproducible.
- **Learn more:** [Glenn Fiedler, "Fix Your Timestep!"](https://gafferongames.com/post/fix_your_timestep/)

### Interpolating between steps

When a frame falls between two simulation steps, birds are drawn part-way between their
last two positions, the short way round the torus.

- **Used in:** `packages/ui/src/stage-core/frame.ts`
- **Why here:** Motion looks smooth at any frame rate, while the simulation itself stays on
  fixed steps.
- **Learn more:** [Glenn Fiedler, "Fix Your Timestep!": the final touch](https://gafferongames.com/post/fix_your_timestep/)

### Seeded pseudorandom numbers (mulberry32)

A tiny generator turns a 32-bit seed into the same sequence of numbers every time. It uses
only integer operations, so every JavaScript engine agrees.

- **Used in:** `packages/primitives/src/prng.ts`, `fixtures/oracles/prng.mulberry32.json`
- **Why here:** Same seed, same flock, so runs can be replayed and compared bit for bit.
  `Math.random` is banned in primitives.
- **Learn more:** [Pseudorandom number generator](https://en.wikipedia.org/wiki/Pseudorandom_number_generator)

### Rejection sampling for headings

Draw points in a square, keep only those inside the unit circle, and use their direction.
Every heading is then equally likely, and no trigonometry is needed.

- **Used in:** `packages/primitives/src/agents/flock/init.ts`
- **Why here:** Square roots and arithmetic give the same result on every engine, whereas
  sine and cosine may not.
- **Learn more:** [Rejection sampling](https://en.wikipedia.org/wiki/Rejection_sampling)

### Bitwise determinism and floating point

Computers round every arithmetic result. The same operations in the same order give the
same bits, but reordering them can change the last digit.

- **Used in:** `packages/primitives/test/flock.determinism.test.ts`, `packages/primitives/src/agents/flock/step.ts`
- **Why here:** Replay promises identical numbers, so sums run in a fixed order and both
  coordinates go through identical operations.
- **Learn more:** [Goldberg, "What Every Computer Scientist Should Know About Floating-Point Arithmetic"](https://docs.oracle.com/cd/E19957-01/806-3568/ncg_goldberg.html)

### Pure functions and immutability

A pure function returns a new value and never changes its inputs. The tests freeze every
input, so any accidental write throws an error.

- **Used in:** `packages/primitives/test/flock.step.test.ts`, `packages/ui/test/render-invariance.test.ts`
- **Why here:** It is how the renderer can be proven unable to change the simulation, and
  how replay can trust stored states.
- **Learn more:** [MDN: Object.freeze](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze)

### Schemas as contracts (Zod)

A schema states exactly what valid data looks like and rejects anything else. Strict
objects refuse unknown keys, and refinements add rules across fields.

- **Used in:** `packages/contracts/src/provenance.ts`, `packages/contracts/src/run.ts`
- **Why here:** Generated output is data, not code, so the contracts are the line every
  agent, file and test must pass.
- **Learn more:** [Zod documentation](https://zod.dev)

### Discriminated unions

A value that can be one of several shapes, told apart by a field such as `kind`.
TypeScript then knows which fields exist in each case.

- **Used in:** `packages/contracts/src/run.ts`, `packages/primitives/src/replay.ts`
- **Why here:** Run events are a param change, a placement or a removal, and code handling
  them cannot mix the cases up.
- **Learn more:** [TypeScript handbook: discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)

### A spec interpreted by a builder (data, not code)

Instead of running code that a model or an author wrote, the system accepts only a document
in a closed vocabulary: which primitive, which variable, which range, which elements to show.
A small, trusted program, the builder, checks the document and turns it into a running
world. Anything outside the vocabulary is refused, never executed.

- **Used in:** `packages/contracts/src/worldspec.ts`, `packages/pipeline/src/builder/build.ts`,
  `fixtures/worldspecs/flocking-reference.json`
- **Why here:** Generated output is data, not code (CLAUDE.md, boundary 2). A WorldSpec can be
  validated, diffed, replayed and reviewed. A mistake in it becomes a refusal with a path, not
  a broken or unsafe page.
- **Learn more:** [Interpreter pattern](https://en.wikipedia.org/wiki/Interpreter_pattern)

### Versioned documents

A saved document records which schema version wrote it, for example `runrecord/2`.
Readers can then refuse versions they do not understand.

- **Used in:** `packages/contracts/src/index.ts`, `packages/contracts/src/run.ts`
- **Why here:** Run records outlive the code that wrote them. An unversioned record would
  replay silently wrong.
- **Learn more:** [Kleppmann, Designing Data-Intensive Applications, chapter 4](https://dataintensive.net)

### Reading an old version (upgrade on read)

When a document format gets a new version, keep reading the old one exactly as it was, then
convert it to the new one in a single tested step before any code uses it. Everything after
that step knows only the newest version.

- **Used in:** `packages/contracts/src/worldspec-v3.ts`, `packages/pipeline/src/builder/build.ts`
- **Why here:** `worldspec/3` adds routing, a scene kit, a time unit and limits. Old specs, and
  the records that name them by hash, stay readable: `WorldSpec` checks a version 2 document by
  version 2's own rules, and `upgradeWorldSpec` turns it into version 3 for the builder.
- **Learn more:** [Martin Kleppmann, "Designing Data-Intensive Applications", chapter 4, "Encoding and Evolution"](https://dataintensive.net/)

### Semantic versioning

Version numbers carry meaning. The major number changes when something breaks, the minor
when something is added, and the patch for fixes.

- **Used in:** `packages/primitives/src/agents/flock/MODEL.md`, `packages/primitives/src/registry.ts`
- **Why here:** The registry looks primitives up by exact version. 2.0.0 changed the state
  format; 2.1.0 changed only the defaults.
- **Learn more:** [Semantic Versioning 2.0.0](https://semver.org)

### Deterministic replay

Store the starting state and every learner action with the step it happened at. Running
them again reproduces the whole run.

- **Used in:** `packages/primitives/src/replay.ts`, `packages/contracts/src/run.ts`, `apps/web/src/world/session.ts`
- **Why here:** A seed alone cannot reproduce a run in which a learner moved sliders and
  placed beacons. Replay makes every recorded observation checkable, and "Replay same
  seed" on `/world/local` is this, live.
- **Learn more:** [Glenn Fiedler, "Deterministic Lockstep"](https://gafferongames.com/post/deterministic_lockstep/)

### Characterization records (golden files)

Before changing how code is arranged, record what it does now, in files, and make the changed
code reproduce those files exactly. The records describe the old behaviour; they are not a
specification of what is right.

- **Used in:** `apps/web/test/records.test.ts`, `fixtures/records/flocking-seed5/`
- **Why here:** G3a.1 moves almost every file that touches the flocking world, and must change
  nothing a learner sees or a record replays. Records made before the move, replayed at
  tolerance 0 and made again byte for byte after it, turn "no change in behaviour" into a check.
- **Learn more:** [Wikipedia, "Characterization test"](https://en.wikipedia.org/wiki/Characterization_test), the term from Michael Feathers' "Working Effectively with Legacy Code"

### Test oracles

An oracle is an independent way to know the right answer. Here the answers are derived by
hand from the written equations, before and apart from the code.

- **Used in:** `fixtures/oracles/README.md`, `packages/primitives/test/flock.oracles.test.ts`;
  the binding fixtures, `fixtures/bindings/` and `packages/pipeline/test/bindings.test.ts`
- **Why here:** Numbers copied from the implementation would only test that the code
  agrees with itself. The binding fixtures are written the same way: from the level script
  and the parameter table, never from the builder's output.
- **Learn more:** [Test oracle](https://en.wikipedia.org/wiki/Test_oracle)

### Metamorphic tests

When the exact answer is unknown, test a relation instead. Mirroring the world across its
diagonal must mirror its future, bit for bit.

- **Used in:** `fixtures/oracles/flock.planar.weighted/diagonal-reflection-bitwise.json`, `fixtures/oracles/flock.planar.weighted/translation-invariance.json`
- **Why here:** Symmetries of the equations catch whole families of bugs, such as an x
  typed where a y belongs, over hundreds of steps.
- **Learn more:** [Chen et al. 2018, "Metamorphic Testing: A Review of Challenges and Opportunities"](https://doi.org/10.1145/3143561)

### Planted-bug checks (mutation testing)

Deliberately break the code in a realistic way, then confirm that some test fails. A test
suite that cannot catch planted bugs cannot be trusted to catch real ones.

- **Used in:** `docs/sessions/2026-09-28.md`, `docs/sessions/2026-09-30.md`
- **Why here:** Tests that pass on the first run prove little. Planting bugs shows they
  can fail.
- **Learn more:** [Mutation testing](https://en.wikipedia.org/wiki/Mutation_testing)

### Test-driven development

Write a test, watch it fail for the right reason, then write the least code that passes.
Repeat.

- **Used in:** `packages/contracts/test/run-record.test.ts`, `scripts/test/check-docs.test.ts`
- **Why here:** A test watched failing first is known to test the right thing.
- **Learn more:** [Martin Fowler, "Test Driven Development"](https://martinfowler.com/bliki/TestDrivenDevelopment.html)

### Requirement evidence and gates

Tests carry requirement ids in their titles, and the gate counts passing tests per id. A
gate passes only when every required id has evidence, nothing was skipped, and the runtime
is the pinned one.

- **Used in:** `scripts/check-gate.ts`, `scripts/gate/evidence.ts`, `gates.json`
- **Why here:** "No fake progress" applies to the project itself: a gate cannot pass before
  its tests exist.
- **Learn more:** [Traceability matrix](https://en.wikipedia.org/wiki/Traceability_matrix)

### Parameter sweeps and held-out checks

Try every combination on a grid, choose the best on some seeds, then re-check the choice on
seeds it never saw. Choosing the best of many flatters it, a bias the held-out check exposes.

- **Used in:** `scripts/sweep/flock-sweep.ts`, `eval/sweeps/flock-defaults.md`
- **Why here:** The defaults sweep picked 14 of 20, but the honest rate on unseen seeds was
  17 of 40, and ADR-0003 records both.
- **Learn more:** [Cawley and Talbot 2010, "On Over-fitting in Model Selection"](https://jmlr.org/papers/v11/cawley10a.html)

### An upper bound for a rare event (the Wilson score interval)

When 0 of 10,000 trials succeed, the true rate is not proven to be 0; it is only likely to
be small. The Wilson score interval gives a range for the true rate that is honest near 0%
and 100%, where the textbook "p ± 1.96 standard errors" collapses to a single point.

- **Used in:** `scripts/sweep/group-measure.ts`, `eval/sweeps/group-measure.md`
- **Why here:** The owner's criterion is "under 1% of seeds". The sweep passes only when the
  95% upper bound is under 1%, not the observed share. The bare count's 1.28% fails, and O1's
  0 of 10,000 has an upper bound of 0.038%.
- **Learn more:** [Binomial proportion confidence interval: Wilson score interval](https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval#Wilson_score_interval)

### Monorepo workspaces

Several packages live in one repository and link to each other locally, so a change to a
contract and its users lands in one commit.

- **Used in:** `package.json`, `packages/contracts/package.json`
- **Why here:** Contracts, primitives, the stage and the apps change together but keep
  their boundaries.
- **Learn more:** [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces)

### TypeScript run directly by Node (type stripping)

Node 24 removes TypeScript's type annotations and runs the file, with no build step.

- **Used in:** `scripts/check-gate.ts`, `apps/api/src/main.ts`
- **Why here:** Scripts and the API run from source, and every package is consumed from its
  `src/`.
- **Learn more:** [Node.js: running TypeScript natively](https://nodejs.org/api/typescript.html)

### Dimensional analysis (units as exponents)

Write every unit as powers of a few base dimensions, such as people per day as people¹ time⁻¹.
Adding needs equal units, multiplying adds the powers, and a rate must have its quantity's unit
over time. An equation whose units do not agree is wrong, whatever its numbers.

- **Used in:** `packages/primitives/src/compartments/units.ts`
- **Why here:** Every compartment, parameter and observable declares its unit, and the solver
  refuses a model whose units disagree before it runs a step.
- **Learn more:** [Wikipedia, "Dimensional analysis"](https://en.wikipedia.org/wiki/Dimensional_analysis)

### An interpreter instead of eval

Run a formula given as data by walking its tree and building a small function for each node,
never by turning text into code. Nothing outside the grammar's few operations can run.

- **Used in:** `packages/primitives/src/compartments/expr.ts`
- **Why here:** A generated model must not be able to run code, and the deploy's
  Content-Security-Policy refuses `eval` anyway; lint bans it in primitives.
- **Learn more:** [Robert Nystrom, "Crafting Interpreters", "Evaluating Expressions"](https://craftinginterpreters.com/evaluating-expressions.html)


### Shares into whole figures (the largest remainder method)

Drawing 120 figures for shares such as 0.593, 0.302 and 0.105 needs whole numbers that still
add up to 120. Each share first gets the whole part of its exact count; the figures left over
go to the shares with the largest fractions left behind.

- **Used in:** `packages/ui/src/stage-core/kits/town/frame.ts`
- **Why here:** The town's figures are a picture of the model's shares, so their counts must
  come from the shares alone and always add up.
- **Learn more:** [Wikipedia, "Largest remainder method"](https://en.wikipedia.org/wiki/Largest_remainder_method)
### Lint-enforced boundaries

Lint rules forbid specific imports and calls in specific folders. For example, primitives
cannot call `Math.random`, and the Three.js adapter cannot import simulation code.

- **Used in:** `eslint.config.js`
- **Why here:** Architecture written only in prose erodes, and a failing lint run does not.
- **Learn more:** [ESLint: no-restricted-imports](https://eslint.org/docs/latest/rules/no-restricted-imports)

### One interface, many implementations (scene kits)

Write the part of a program that every case shares once, against a small interface, and let
each case supply its own implementation of that interface. Adding a case then means writing
one implementation, not changing the shared part.

- **Used in:** `packages/ui/src/stage-core/frame.ts`, `packages/ui/src/three-adapter/scene.ts`, `apps/web/src/world/session.ts`
- **Why here:** The stage, its Three.js adapter and the app's session were written for birds.
  A scene kit (ADR-0026) is the interface between them and one family's look: the valley kit
  draws the flock, and a town kit can draw an epidemic without touching the stage, the
  adapter, the session or the fork.
- **Learn more:** [Refactoring Guru, "Strategy"](https://refactoring.guru/design-patterns/strategy)

### Model/render separation

The model computes states and the renderer only draws them. Changing how things look can
never change what is measured.

- **Used in:** `packages/ui/test/render-invariance.test.ts`, `packages/ui/src/stage-core/frame.ts`
- **Why here:** It is the first non-negotiable (R02). Learners must be able to trust that
  the scenery is decoration.
- **Learn more:** [Separation of concerns](https://en.wikipedia.org/wiki/Separation_of_concerns)

### Provenance and origin labels

Every displayed statement says where it comes from:
- **paper-derived,** with an anchor into the source;
- **teaching choice;**
- **computed observation;**
- **generated inference.**

- **Used in:** `packages/contracts/src/provenance.ts`, `packages/ui/src/tokens.ts`
- **Why here:** A teaching default must never read as a claim from the paper.
- **Learn more:** [W3C PROV overview](https://www.w3.org/TR/prov-overview/)

### End-to-end browser tests

Tests drive a real browser through the app as a person would, and assert on what appears.

- **Used in:** `tests/e2e/smoke.spec.ts`, `tests/e2e/stage.spec.ts`, `playwright.config.ts`
- **Why here:** Some properties only exist in a browser: that WebGL draws something, and
  that the fallback explains itself.
- **Learn more:** [Playwright](https://playwright.dev)

### Automated accessibility checks (axe)

A rules engine reads the page as assistive technology would, and reports each element that
breaks a WCAG rule it can decide by itself: a button with no name, a field with no label,
text too faint for its background. What it cannot decide, it marks incomplete, for a person
to check.

- **Used in:** `tests/e2e/accessibility.spec.ts`
- **Why here:** R12 asks for an axe scan in `test:e2e`. It runs in the states a learner
  reaches, at desktop and phone widths, and fails on any violation. It catches regressions
  that no one looks for. It does not prove the page usable, which is why the keyboard paths
  have their own tests.
- **Learn more:** [axe-core](https://github.com/dequelabs/axe-core) and
  [W3C, "Evaluating web accessibility"](https://www.w3.org/WAI/test-evaluate/)

### A heads-up display (HUD)

Game information drawn over the world rather than beside it: small cards at the screen's
edges that leave the middle to the scene.

- **Used in:** `packages/ui/src/react/hud.css`, `packages/ui/src/react/LevelCard.tsx`, `apps/web/src/hook/HookWorld.tsx`
- **Why here:** ADR-0008 made PaperPlay game-first. The stage fills the screen, and the
  level card, guide and level map lie over it. A test holds the HUD at rest to at most a
  quarter of a desktop and a third of a phone.
- **Learn more:** [HUD (video games)](https://en.wikipedia.org/wiki/HUD_(video_games))

### The largest empty rectangle

Given boxes on a screen, find the biggest rectangle that touches none of them. With a few
boxes, every candidate's edges come from the screen's and the boxes' edges, so trying those
candidates is enough.

- **Used in:** `packages/ui/src/stage-core/screen.ts`, `packages/ui/src/react/useFreeRect.ts`
- **Why here:** The stage frames the field in the room the HUD leaves. It scores each
  candidate by how large the field would look in it, not by its area alone (ADR-0012).
- **Learn more:** [Largest empty rectangle](https://en.wikipedia.org/wiki/Largest_empty_rectangle)

### Adjusting state when a prop changes

React can update a component's own state during rendering, when it sees a prop has changed,
instead of in an effect. That avoids drawing one frame with stale state.

- **Used in:** `packages/ui/src/react/Guide.tsx`
- **Why here:** The guide opens whenever the learner acts. The page passes a cue that
  changes with each action, and the guide opens in the same render that sees the new cue.
- **Learn more:** [React, "You might not need an effect"](https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)

### An animation loop outside React's state

The browser calls a function before each repaint (`requestAnimationFrame`). The stage runs
its loop there, and keeps the camera and the last frame in a ref, which React does not
watch. React's state changes only for readouts, at most ten times a second.

- **Used in:** `packages/ui/src/react/WorldStage.tsx`, `apps/web/src/world/LocalWorld.tsx`
- **Why here:** Re-rendering the page every frame would be slow, and the brief forbids it.
  The drawing stays smooth while the page's text updates calmly.
- **Learn more:** [React: referencing values with refs](https://react.dev/learn/referencing-values-with-refs)

### Keyboard operability

Everything a pointer can do, a keyboard can do too, and focus always shows where the keys
will act.

- **Used in:** `packages/ui/src/react/WorldStage.tsx`, `tests/e2e/world.spec.ts`
- **Why here:**
  - On the stage, arrows orbit the view or move a cursor across the ground, and Enter
    places or picks at the cursor.
  - The R04 tests place an obstacle and pick a bird by keyboard alone.
- **Learn more:** [WCAG 2.1: keyboard (2.1.1)](https://www.w3.org/TR/WCAG21/#keyboard)

### Docs as checked artifacts

Documentation lives beside the code and a program checks it. Missing sections, stale dates
or broken paths fail the build like a failing test.

- **Used in:** `scripts/docs/check.ts`, `scripts/check-docs.ts`, `docs/README.md`
- **Why here:** Any session, human or Claude, has to learn the current state from a few
  files, so those files must not drift.
- **Learn more:** [Write the Docs: Docs as Code](https://www.writethedocs.org/guide/docs-as-code/)

### A git hook, and a land record

A git hook is a program git runs at a fixed moment. The pre-push hook runs before a push
leaves the machine, sees which refs the push would move, and can refuse it. PaperPlay's hook
refuses any push that would move `main`, unless a land record says the commit passed the
gate locally and CI on that same commit. Land writes that record as it goes.

- **Used in:** `.githooks/pre-push`, `scripts/hooks/pre-push.ts`, `scripts/land/guard.ts`,
  `scripts/land/land.ts`
- **Why here:** three broken states reached `main` in one day, each time with the rule known
  and not followed. A check that runs itself cannot be forgotten.
- **Learn more:** [Pro Git: Git Hooks](https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks)

### A note in a record, not an event

A run record keeps two kinds of thing. Events change the run: a parameter moved, a rock
placed. Notes do not: a learner's prediction is kept at its step, but replaying the record
ignores it, and the run comes out the same.

- **Used in:** `packages/contracts/src/run.ts`, its Prediction schema;
  `apps/web/src/world/session.ts`, its predict and record
- **Why here:** the owner asked for every prediction to be saved in the run record. Keeping
  it apart from the events means a prediction can never change what the run measured.
- **Learn more:** [Martin Fowler: Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html)

### Content digests as proof of place (a source map)

A quote is checked against a source the repository may not keep by storing, beside the quote, a
cryptographic digest of the bytes and of the extracted text, and the quote's character offsets. A
fresh fetch that hashes the same proves the text is the one the offsets point into, without the text
being kept.

- **Used in:** `scripts/source-map.ts`, `packages/contracts/src/sourcemap.ts`, `fixtures/papers/flocking/source-map.json`
- **Why here:** Reynolds's paper is ACM's copyright: the flocking world may keep anchors and short
  quotes, not the text, and still show each quote is where it says (ADR-0045).
- **Learn more:** [SHA-2 (Wikipedia)](https://en.wikipedia.org/wiki/SHA-2)

## Graphics

### Scene graph (Three.js)

A tree of objects (meshes, lights, a camera) that a renderer draws each frame. Moving an
object means changing its transform, and the library does the drawing.

- **Used in:** `packages/ui/src/three-adapter/scene.ts`, `packages/ui/src/three-adapter/apply-frame.ts`
- **Why here:** The owner chose Three.js from G1 (ADR-0004). Only the adapter touches it,
  so a later renderer replaces one folder.
- **Learn more:** [three.js manual: creating a scene](https://threejs.org/manual/#en/creating-a-scene)

### Instanced meshes

One shape drawn many times in a single call, each copy with its own position, rotation,
size and colour.

- **Used in:** `packages/ui/src/three-adapter/scene.ts`, `packages/ui/src/three-adapter/apply-frame.ts`
- **Why here:** All birds, up to 400, are drawn in three calls: their bodies, left wings and
  right wings. Each wing's matrix is its bird's matrix times a hinge and a flap. Trees and
  rocks are instanced too.
- **Learn more:** [three.js: InstancedMesh](https://threejs.org/docs/#api/en/objects/InstancedMesh)

### A cyclic colour map

Colours arranged round a wheel, so a direction can be shown as a colour: a heading and the
same heading a full turn later get the same colour, and nearby headings get nearby colours.

- **Used in:** `packages/ui/src/stage-core/kits/valley/palettes.ts`, `packages/ui/src/stage-core/kits/valley/frame.ts`
- **Why here:** Colour by heading lets learners see agreement: a flock that agrees turns one
  colour. The wheel comes from the palette, so it trades hue for contrast against the
  meadow, which a test holds at 3:1 (ADR-0013).
- **Learn more:** [Kovesi, "Good colour maps: how to design them"](https://arxiv.org/abs/1509.03700)

### Frame-rate-independent smoothing

Easing a value toward a target by a share of the gap each frame. A share of
1 − exp(−Δt / τ) makes it close the same gap in the same time at any frame rate.

- **Used in:** `packages/ui/src/react/WorldStage.tsx`
- **Why here:** The following camera eases toward the flock's centre without jolts, and
  behaves the same on a fast or a slow screen.
- **Learn more:** [Rory Driscoll, "Frame rate independent damping using lerp"](https://www.rorydriscoll.com/2016/03/07/frame-rate-independent-damping-using-lerp/) and
  [Exponential smoothing](https://en.wikipedia.org/wiki/Exponential_smoothing)

### View and projection matrices

Two 4 × 4 matrices take a point in the world to the screen. The view matrix places the
camera; the projection matrix gives perspective.

- **Used in:** `packages/ui/src/stage-core/camera.ts`
- **Why here:** The stage core computes them itself, and a test checks Three.js arrives at
  the same matrices: an independent check of the maths.
- **Learn more:** [WebGL2 Fundamentals: 3D perspective](https://webgl2fundamentals.org/webgl/lessons/webgl-3d-perspective.html)

### Orbit camera

A camera on a sphere around a target, described by an angle around (yaw), an angle up
(pitch) and a distance. Dragging turns it; scrolling moves it closer.

- **Used in:** `packages/ui/src/stage-core/camera.ts`
- **Why here:** Learners can look around the flock from any side. The pitch limits stop the
  camera flipping under the ground.
- **Learn more:** [WebGL2 Fundamentals: cameras](https://webgl2fundamentals.org/webgl/lessons/webgl-3d-camera.html)

### Picking: from the screen back to the world

Turn a point on the screen back into a ray from the camera, and find where that ray meets
the ground plane. Picking a bird works the other way round: project every bird onto the
screen and take the one drawn nearest the pointer.

- **Used in:** `packages/ui/src/stage-core/camera.ts`, `packages/ui/src/stage-core/picking.ts`, `packages/ui/src/stage-core/kits/valley/picking.ts`
- **Why here:** It is how a click becomes a beacon at the right spot in the world, or a
  picked bird. Both work on what is drawn, so picking never touches the simulation.
- **Learn more:** [Scratchapixel: ray–plane intersection](https://www.scratchapixel.com/lessons/3d-basic-rendering/minimal-ray-tracer-rendering-simple-shapes/ray-plane-and-ray-disk-intersection.html)

### Quaternions for orientation

A compact way to store a rotation. Two rotations are combined by multiplying their
quaternions.

- **Used in:** `packages/ui/src/three-adapter/apply-frame.ts`
- **Why here:** Each bird turns to its heading (yaw), then rolls about its own nose (bank),
  without the gimbal problems of angle triples.
- **Learn more:** [three.js: Quaternion](https://threejs.org/docs/#api/en/math/Quaternion)

### Low-poly, flat-shaded geometry

Shapes made of few triangles, each lit as one flat face, which gives the faceted look of
the prototype's island.

- **Used in:** `packages/ui/src/three-adapter/kits/valley/geometry.ts`
- **Why here:** It matches the accepted visual direction and stays cheap to draw.
- **Learn more:** [three.js: MeshStandardMaterial (flatShading)](https://threejs.org/docs/#api/en/materials/MeshStandardMaterial)

### An off-centre (asymmetric) frustum

A perspective projection whose centre is not the middle of the screen. The scene is framed as
if the screen were only part of its real size, while the whole screen still draws.

- **Used in:** `packages/ui/src/stage-core/camera.ts`, `packages/ui/src/three-adapter/apply-frame.ts`
- **Why here:** The HUD covers parts of the screen, so the field is framed in the rectangle
  they leave. The world still fills the screen behind the cards. Picking undoes the shift,
  so a click lands where it should (ADR-0012).
- **Learn more:** [three.js, PerspectiveCamera.setViewOffset](https://threejs.org/docs/#api/en/cameras/PerspectiveCamera.setViewOffset)

### Focus and context

Show the thing of interest in full detail and keep everything around it visible, but quieter.
Nothing disappears, so the viewer keeps their bearings.

- **Used in:** `packages/ui/src/stage-core/kits/valley/frame.ts`, `packages/ui/src/stage-core/kits/valley/palettes.ts`
- **Why here:** The selected-neighbour view enlarges the picked bird and keeps the birds it
  sees in ink. The rest are dimmed, which works with this palette where colour would not:
  aqua and lime have too little contrast against the cream sky.
- **Learn more:** [InfoVis:Wiki, "Focus-plus-Context"](https://infovis-wiki.net/wiki/Focus-plus-Context)

### Shadow maps

The scene is drawn once from the sun's point of view to record what it can see; anything
it cannot see is in shadow. Percentage-closer filtering softens the edges.

- **Used in:** `packages/ui/src/three-adapter/scene.ts`, `packages/ui/src/three-adapter/mount.ts`
- **Why here:** Shadows under the birds show their height above the valley, which a flat
  view cannot.
- **Learn more:** [LearnOpenGL: shadow mapping](https://learnopengl.com/Advanced-Lighting/Shadows/Shadow-Mapping)

### Fog

Distant objects fade toward the sky colour.

- **Used in:** `packages/ui/src/three-adapter/scene.ts`
- **Why here:** The hills recede into the cream sky, giving depth without detail.
- **Learn more:** [three.js: Fog](https://threejs.org/docs/#api/en/scenes/Fog)

### Colour management (sRGB and linear light)

Colours are written in sRGB but blended and lit in linear light, then converted back for
the screen.

- **Used in:** `packages/ui/src/three-adapter/apply-frame.ts`, `packages/ui/src/stage-core/kits/valley/palettes.ts`
- **Why here:** It keeps the palette tokens looking the same on screen as in the design,
  and lets fading birds blend smoothly into the sky.
- **Learn more:** [three.js manual: color management](https://threejs.org/manual/#en/color-management)

### Shader programs, and the stall on first use

A GPU draws with small programs, shaders, compiled for each kind of material and drawing
pass. The browser compiles them, and the first time one is used, the page can wait for that
compile to finish. A new canvas starts with none compiled. Software WebGL such as SwiftShader
compiles slowly, so a new drawing state can freeze the page for a second or more.

- **Used in:** `packages/ui/src/three-adapter/apply-frame.ts` (rocks cast no shadow),
  `packages/ui/src/three-adapter/scene.ts` (`touchedMaterial`, a rock's own kind of material)
- **Why here:** level 5's fork froze for 1.6 s after its first frame. Each new stage was
  drawing its rocks into the shadow map for the first time. Without rock shadows, the freeze
  went away; a lit rock reuses a rock's shader, so lighting one adds none.
- **Learn more:** [MDN: WebGL best practices, compile shaders and link programs in parallel](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)

### WebGL2

The browser interface for drawing with the graphics card. Three.js requires version 2.

- **Used in:** `packages/ui/src/three-adapter/mount.ts`
- **Why here:** It is what makes a 3D valley possible in a page. When it is missing, the
  stage says so plainly.
- **Learn more:** [MDN: WebGL2RenderingContext](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext)

### SwiftShader (software WebGL)

A WebGL implementation that runs on the processor instead of a graphics card. It is slower,
but it draws the same way on every machine.

- **Used in:** `playwright.config.ts`, `tests/e2e/stage.spec.ts`
- **Why here:** Browser tests must render identically with or without a GPU. The test also
  asserts that SwiftShader was really used.
- **Learn more:** [SwiftShader](https://github.com/google/swiftshader)

### Edge fade (smoothstep)

A curve that rises from 0 to 1 with gentle ends. Birds within two world units of an edge
shrink and blend into the sky along it.

- **Used in:** `packages/ui/src/stage-core/frame.ts`
- **Why here:** On a torus a bird leaving one edge reappears at the other; the fade keeps
  that from reading as a teleport.
- **Learn more:** [Smoothstep](https://en.wikipedia.org/wiki/Smoothstep)

### Frame-stepped capture (offline rendering)

Film a simulation one frame at a time instead of in real time. Advance the world by an
exact amount, draw it, save the picture, and repeat. Then join the pictures at a fixed
frame rate. The film no longer depends on how fast the machine draws.

- **Used in:** `scripts/capture-demo.ts`, `apps/web/src/capture/demo-script.ts`, `scripts/capture/ffmpeg.ts`
- **Why here:** Screen recording films wall-clock time, so a slow frame skips part of the
  flock's flight. Each video frame here is exactly two simulation steps. Two runs gave
  byte-identical videos on one runtime, because the encoder is single-threaded and bit-exact
  too. Another CPU's software rasteriser draws slightly different pixels, so byte-identity
  holds per runtime.
- **Learn more:** [FFmpeg, "image2pipe"](https://ffmpeg.org/ffmpeg-formats.html#image2-1) and
  [Playwright, "Videos"](https://playwright.dev/docs/videos), the real-time recording this
  avoids

### Self-hosted web fonts, subsets and static weights

A web font is a file the page downloads and declares with `@font-face`. Each declaration
covers one weight and a range of characters (`unicode-range`), and the browser fetches a
file only when text on the page needs it. Asking for a weight that was never declared
makes the browser fake it by thickening the strokes.

- **Used in:** `packages/ui/src/fonts/fonts.css`, `packages/ui/test/fonts.test.ts`, `tests/e2e/fonts.spec.ts`
- **Why here:** The owner's rule was no network at runtime or in tests, and only the
  weights in use. So the files sit beside the code, one static file per weight, and a
  test fails if a page asks for an unshipped weight.
- **Learn more:** [web.dev: best practices for fonts](https://web.dev/articles/font-best-practices)

### Contrast ratio (WCAG)

A number from 1 to 21 comparing the relative brightness of two colours. Text needs at
least 4.5:1 to be readable.

- **Used in:** `packages/ui/src/stage-core/color.ts`, `packages/ui/test/palettes.test.ts`
- **Why here:** A test keeps birds at 7:1 against the sky in both palettes; origin colours
  are checked the same way at R12.
- **Learn more:** [WCAG 2.1: contrast (minimum)](https://www.w3.org/TR/WCAG21/#contrast-minimum)

### Reduced motion

Operating systems let people ask for less animation, and pages can read that setting.

- **Used in:** `apps/web/src/world/LocalWorld.tsx`, `tests/e2e/world.spec.ts`
- **Why here:** The brief's quality floor. The flock is drawn still until the learner
  presses play.
- **Learn more:** [MDN: prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)

### Screenshot pixel checks

Take a screenshot and measure how much its pixels vary. A blank canvas is one colour; a
drawn scene is not.

- **Used in:** `tests/e2e/stage.spec.ts`
- **Why here:** It proves WebGL drew something, without brittle comparisons against a
  reference image.
- **Learn more:** [Playwright: screenshots](https://playwright.dev/docs/screenshots)

## AI and agents

### Thinking tokens (reasoning models)

A reasoning model writes a long hidden chain of thought before its answer, and the gateway counts
those tokens with the reply's. On this gateway they were about 90% of every planner's, explainer's
and reviewer's reply, at 20 to 35 tokens a second, so thinking set most of a job's wall clock. Many
open models' chat templates take a switch that turns it off.

- **Used in:** `apps/api/models.json`, `packages/pipeline/src/models/caps.ts`,
  `apps/api/src/models/voyager.ts`
- **Why here:** Thinking pays where nothing else checks a model's answer (the two transcriptions,
  the reviewers) and not where the deterministic rules judge it in full (the planners, the
  explainer); see ADR-0053.
- **Learn more:** [Qwen3's thinking switch](https://qwenlm.github.io/blog/qwen3/)

### Critical path

The longest chain of steps that must happen one after another; a job can finish no sooner. Steps
that run at once count once, as long as the slowest of them.

- **Used in:** `scripts/timing.ts`, `docs/decisions/ADR-0053-fast-generation.md`
- **Why here:** Making a call faster helps only if it is on the critical path: the transcriptions
  run beside the reader, so shortening the reader saves nothing, while the planners and every
  repair sit on it.
- **Learn more:** [Critical path method](https://en.wikipedia.org/wiki/Critical_path_method)

### Progressive delivery

Releasing parts of a result as each is ready instead of all at once at the end: here, a world's
levels as soon as the hook and two more pass every check, while repairs and reviews go on.

- **Used in:** `packages/pipeline/src/controller/run.ts`, `apps/api/src/server.ts`,
  `apps/web/src/create/CreatePage.tsx`, `apps/web/src/worlds/GeneratedWorld.tsx`
- **Why here:** A learner can play within minutes, and every released level has passed the same
  checks as a finished world's; only the reviewers' reading is still to come, and the page says so.
- **Learn more:** [Progressive delivery](https://launchdarkly.com/blog/what-is-progressive-delivery-all-about/)
