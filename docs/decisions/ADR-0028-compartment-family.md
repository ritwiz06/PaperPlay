# ADR-0028: The compartment family: a model as data, one solver, and its checks

- Status: accepted. The owner set the requirements for G3a.2 (ADR-0024); the shapes are mine,
  for the owner to confirm. A subagent wrote the solver's core to my specification, and I
  reviewed and integrated it.
- Date: 2026-10-10
- Decided by: the owner asked for an expression tree with a closed grammar, units checked
  dimensionally, one fixed-step RK4 solver with an accuracy check at dt and dt/2 that refuses
  stiff or unstable systems, the family's checks, and oracle fixtures written by hand first.

## Context

A compartment model is a handful of equations, `d(compartment)/dt = rate`. Written as code, each
new model would need a pull request and its own tests. Written as data and run by one trusted
solver, a new model needs only its checks (`docs/design/every-paper.md` §2.2, ADR-0024's rule 2).

## Decision

1. **A model is data, a `ModelSpec`** (`packages/contracts/src/model.ts`):
   - compartments, parameters (each with its unit, range, default, origin and anchors), one
     equation per compartment, the invariants and steady states the paper states, the
     observables, and the solver's step and tolerance;
   - **expressions over a closed grammar:** numbers, parameters, compartments, add, subtract,
     multiply, divide, power, negate, `exp` and `log`. No string is evaluated, no time is an
     input, and no other operation exists. A tree's depth is measured without recursion before
     it is parsed, so a hostile tree is refused, not a crash;
   - **units as whole-number powers** of people, cells, molecules, length, mass and time. The
     literal 0 takes any unit; every other number is dimensionless;
   - **the accuracy tolerance is at most a thousandth,** so no spec can loosen the check until a
     stiff model passes it.
2. **One solver, `compartments.ode@1.0.0`** (`packages/primitives/src/compartments/`, specified in
   its MODEL.md):
   - a closure interpreter; lint bans `eval` and `new Function` in primitives;
   - dimensional analysis on every expression; a model whose units disagree is refused when it
     is bound;
   - classical RK4 at the model's fixed step, its arithmetic in a fixed order, so a run replays
     bit for bit on one runtime;
   - a primitive of the compartments family, its time in the model's unit, with no space and
     nothing to place.
3. **The family's checks,** each in plain words:
   - **accuracy:** the run at dt against the run at dt/2. A compartment that moves by more than
     the tolerance of its largest value, or a value that stops being finite, means the model is
     stiff or unstable at that step, and it is refused, never drawn wrong;
   - **positivity** where a compartment is declared non-negative;
   - **conservation** of each stated invariant: numerically within 10⁻⁹, and proved
     symbolically, in exact rational arithmetic, when the invariant is linear and the rates it
     needs are polynomials;
   - **steady states** the paper gives: every rate vanishes there.
4. **The solver registers as a solver,** not a primitive: `registry.solver(ref)` binds a model.
   Every model shares `compartments.ode@1.0.0`, so a run record names the solver, and the model
   is identified by the WorldSpec that holds it, through the record's `worldSpecHash`.
5. **worldspec/3's `equations` binding:** the solver, the model, its parameters, and how much of
   the model's time a second of watching shows at 1x, a teaching choice.
6. **The builder runs the family's checks** on both worlds of every level's fork, over the level's
   time, and reports what they find at the binding's model. A reviewer cannot overturn them.
7. **Oracles by hand, first:** exponential decay and growth (RK4's factor, and its distance from
   the exact solution), the logistic curve, conservation of S + I + R, SIR's final-size relation
   solved by Newton's method, a stiff decay the accuracy check refuses, and replay. Every oracle
   passed on its first run; no threshold was changed.

## Consequences

- **A new compartment model needs no code:** a ModelSpec, its anchors, and passing checks.
- **The second transcription** (ADR-0024's rule 2) compares two ModelSpecs structurally; it comes
  with the pipeline (G3a.3).
- **The agent's review notes, for the owner:**
  - an invariant whose value is 0, such as `s + i + r − N`, is held to a drift scaled by its
    starting size, so it fails on rounding: state the conserved sum instead;
  - SIR in people, `β·S·I/N`, divides by a parameter, so it is checked numerically only, never
    proved; allowing division by parameters would prove it soundly;
  - the design doc's `hill` operation, a "dimensionless" time unit and an invariant tolerance of
    10⁻⁶ were left out; the specification given to the agent did not include them.
