# compartments.ode@1.0.0

One trusted solver for every compartment model: a model is a validated `ModelSpec`
(`packages/contracts/src/model.ts`), each of its equations an expression tree over a closed
grammar, and this primitive runs it. No model is code, so a new epidemic or gene-circuit model
needs no pull request, only its checks (docs/design/every-paper.md §2.2). It is a teaching
solver: deterministic and fixed-step, not a reproduction of any paper's numerics or results.

These rules are the primitive's specification. The oracle fixtures in
`fixtures/oracles/compartments.ode/` are derived from this page by hand, never from the
implementation. Changing any rule, the state contract or a check's threshold requires a new
primitive version.

Versions: 1.0.0 (2026-10-10) introduces G1–G3, U1–U8, E1–E6, P1 and C1–C4.

## The grammar

- **G1 Nodes.** An expression is one of:

  | Node | Value |
  |---|---|
  | `{ "n": 2.5 }` | the number, finite |
  | `{ "p": "beta" }` | the parameter's value |
  | `{ "c": "s" }` | the compartment's value |
  | `{ "op": "add", "args": [a₁, …, a_m] }`, m ≥ 2 | a₁ + a₂ + … + a_m |
  | `{ "op": "mul", "args": [a₁, …, a_m] }`, m ≥ 2 | a₁ × a₂ × … × a_m |
  | `{ "op": "sub", "a": a, "b": b }` | a − b |
  | `{ "op": "div", "a": a, "b": b }` | a / b |
  | `{ "op": "pow", "a": a, "b": b }` | a to the power b |
  | `{ "op": "neg", "a": a }` | −a |
  | `{ "op": "exp", "a": a }` | e to the power a |
  | `{ "op": "log", "a": a }` | the natural logarithm of a |

  Nothing else: no other operation, no string that is evaluated, no loop, and no time input,
  so nothing outside the model can drive it. An interpreter built from closures walks the tree;
  nothing is evaluated from text and no Function constructor is called, which the deploy's
  Content-Security-Policy would refuse anyway.
- **G2 Limits.** At most 24 compartments and 32 parameters; in each expression at most 400 nodes
  and a depth of 24, a lone number having depth 1.
- **G3 What each expression reads.** An initial value reads parameters and numbers; a rate and
  an invariant read parameters and compartments; a steady state's value reads parameters and
  numbers; an observable reads compartments and numbers, because `measure(state)` sees no
  parameters. Every name resolves, every id is used once across compartments, parameters and
  observables, every compartment has exactly one equation, and a steady state gives a value
  for every compartment. The contract checks G1–G3.

## Units

A unit is a whole-number exponent, from −4 to 4, for each of six dimensions: people, cells,
molecules, length, mass and time, time counted in the model's `timeUnit`. `{}` is
dimensionless. Every node gets a unit, or *any*:

- **U1 Leaves.** A number is dimensionless, except the literal 0, which has any unit: 0 people
  and 0 cells are the same 0. A quantity with a unit is a parameter, never a bare number. A
  parameter or a compartment has its declared unit.
- **U2 Sums.** `add` and `sub` need every operand that is not *any* to have one unit, and have
  it; with every operand *any*, the sum is *any*.
- **U3 Products.** `mul` adds its factors' exponents and `div` subtracts the divisor's. A
  product with an *any* factor is *any*, being zero, and so is a quotient of an *any*. Dividing
  by an *any*, which is always zero, is refused.
- **U4** `neg` keeps its operand's unit.
- **U5** `exp` and `log` need a dimensionless (or *any*) argument, and are dimensionless.
- **U6 Powers.** The exponent is dimensionless (or *any*). A dimensionless base gives a
  dimensionless power. An *any* base gives *any*, except to the literal power 0, which is
  dimensionless. A base with a unit needs a whole-number literal exponent k, and its exponents
  are multiplied by k.
- **U7** Every exponent a node computes stays within −4 to 4, as a declared one must; a node
  that would leave that range is refused.
- **U8 The model's units agree** when:
  - each rate has its compartment's unit divided by time, one `time` exponent less;
  - each initial value and each steady-state value has its compartment's unit;
  - each invariant has a unit (its operands agree);
  - each observable has its declared unit.

  *Any* agrees with every unit. `compartmentModel` refuses a model whose units disagree.

Units are named in words for learners, dimensions in their order above: a positive exponent
gives a plural noun, a negative one "per" and a singular noun, with "squared", "cubed" or
"to the fourth" for powers 2 to 4. `{ people: 1, time: −1 }` in days is "people per day",
`{ people: −1, time: −1 }` is "per person per day", and `{}` is "dimensionless". Length and
mass have no named unit, so they read "length units" and "mass units".

## State

```json
{ "stepIndex": 0, "compartments": { "s": 0.999, "i": 0.001, "r": 0 } }
```

Plain JSON: a JSON round trip reproduces it exactly. `compartments` holds one finite number
per compartment, keys in the spec's compartment order. `stepIndex` counts steps taken.
`stateSchema` checks all of this for states read back from JSON. Below, x is the vector of
compartment values in that order and θ the parameters' values.

## Evaluation and one step

- **E1 Evaluating an expression** uses IEEE 754 double arithmetic, as JavaScript computes it:
  `n` is the number, `p` and `c` read θ and x; `add` sums left to right, ((a₁ + a₂) + a₃) + …,
  and `mul` multiplies left to right; `sub` is a − b, `div` a / b, `neg` −a; `pow` is
  `Math.pow(a, b)`, `exp` is `Math.exp(a)` and `log` is `Math.log(a)`. Each operation is one
  rounding. `exp`, `log` and `pow` come from the runtime's Math library, which is deterministic
  on one runtime but not correctly rounded everywhere, so replay is bit for bit on one runtime.
- **E2 Rates.** f(x) = (f₁(x), …, f_n(x)) in compartment order, f_j being E1 of compartment j's
  equation's rate at x and θ. Parameters stay fixed within a step.
- **E3 One classical Runge–Kutta (RK4) step** of size Δt, with h = Δt / 2 and every vector
  operation taken component by component in compartment order:

  ```
  k1 = f(x)
  k2 = f(y2),   y2_j = x_j + h·k1_j
  k3 = f(y3),   y3_j = x_j + h·k2_j
  k4 = f(y4),   y4_j = x_j + Δt·k3_j
  x′_j = x_j + (Δt / 6)·(((k1_j + 2·k2_j) + 2·k3_j) + k4_j)
  ```

  For a linear equation dx/dt = λx, with z = λΔt, the stages are k1 = λx,
  k2 = λx(1 + z/2), k3 = λx(1 + z/2 + z²/4) and k4 = λx(1 + z + z²/2 + z³/4), so in exact
  arithmetic x′ = R(z)·x with R(z) = 1 + z + z²/2 + z³/6 + z⁴/24, the first five terms of
  e^z. Every stage is a value of f, so a linear combination w·x with w·f(x) = 0 for every x is
  unchanged by a step in exact arithmetic: w·x′ = w·x + (Δt/6)(w·k1 + 2w·k2 + 2w·k3 + w·k4).
- **E4 Step contract.** Δt must lie in (0, dt], dt being the model's declared step: a step is
  never coarser than the one the accuracy check (C1) judged. `stepIndex` increases by one.
  A step whose result holds a value that is not a finite number is refused with a RangeError,
  never returned.
- **E5 Initial state.** x_j(0) = E1 of compartment j's initial value at θ, and `stepIndex` is 0.
  The model has no randomness, so the seed changes nothing; it is still required to be an
  unsigned 32-bit integer, so a run record's seed means the same for every primitive. A
  non-finite initial value is refused.
- **E6 Observables.** Each observable is E1 of its expression at x, in the spec's order.

## Polynomials

- **P1 Expansion.** An expression is a polynomial over its parameters and compartments when it
  is built from numbers, `p`, `c`, `add`, `sub`, `mul`, `neg`, `pow` with a whole-number literal
  exponent ≥ 0, and `div` by a non-zero literal. It then expands into a sum of terms, each a
  coefficient times a product of symbols to powers, with like terms combined. Coefficients are
  exact rationals: every finite double is one (m·2^e), and sums, products and quotients of
  rationals are computed exactly, with no rounding, so a cancellation is exact or absent. It is
  not a polynomial when it uses `exp` or `log`, divides by anything but a non-zero number, or
  raises to a power that is not a whole-number literal ≥ 0. An expansion past 4096 terms, a
  power above 64 or a coefficient numerator or denominator of 4096 bits or more is abandoned
  as too large; nothing is then claimed for it.

## The family's checks

Each check runs from the initial state at given parameters, which must satisfy `paramSchema`,
and returns its problems in plain English; an empty list means the check passed. τ is the
model's declared tolerance, N a number of steps, and a compartment's scale is its largest
|value| over the run at Δt, steps 0 to N. Where a scale is 0, 10⁻¹² of the unit stands in.

- **C1 Accuracy.** Run N steps at Δt and 2N at Δt/2 from the same start. At every coarse step
  k from 1 to N and for every compartment, the deviation |x_j(k at Δt) − x_j(2k at Δt/2)| must
  not exceed τ · scale_j. The worst offender, the one with the largest ratio of deviation to
  allowance, is reported with its time and size. A value that is not a finite number, which
  the step refuses (E4), is a problem too. This is the honest refusal: such a model is stiff or
  unstable at its declared step, the solver's step is too coarse for it, and PaperPlay will not
  draw it rather than draw it wrong.
- **C2 Positivity.** Run N steps at Δt. Every compartment marked `nonNegative` stays at or
  above −10⁻⁹ · scale_j at every step from 0 to N. The most negative value of each offender is
  reported.
- **C3 Conservation.** For each invariant the paper states, with value I(k) at step k:
  - *numerically,* over N steps at Δt, |I(k) − I(0)| ≤ 10⁻⁹ · max(|I(0)|, 10⁻¹²) at every step;
  - *symbolically,* when the invariant expands (P1) to Σ_c a_c·x_c + b, with a_c and b free of
    compartments (each term holds at most one compartment, to the first power), and the rate
    of every compartment with a_c ≠ 0 expands too, then dI/dt = Σ_c a_c·f_c must expand to
    exactly 0. Parameters are constant, so b contributes nothing. If it expands to anything
    else, the equations as written do not conserve what the paper states, and that is a
    problem whatever the numbers say.

  Each invariant is reported as proved symbolically, or checked numerically only, with the
  reason the symbolic test did not apply. An invariant whose value is 0, such as s + i + r − N,
  is held to 10⁻¹² · 10⁻⁹ and fails on rounding alone; state it as the conserved sum, s + i + r.
- **C4 Steady states.** At each steady state the paper gives, x* = E1 of each compartment's
  value at θ, and for every compartment |f_j(x*)| ≤ τ · M_j(x*), where M is the rate's size if
  none of its sums cancelled: M(n) = |n|, M(p) = |θ_p|, M(c) = |x_c|; M of `add` and `sub` is
  the sum of the operands' M; of `mul`, their product; of `neg`, its operand's; of `div`,
  M(a) / |b|; and of `exp`, `log` and `pow`, the node's |value|. In exact arithmetic
  |f_j| ≤ M_j, so the check says the net rate is at most τ of the flows that should cancel
  there, on any time scale. Where every flow is zero (M_j = 0), the rate must be exactly 0.
  A value that is not a finite number is a problem too.
