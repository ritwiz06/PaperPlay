# learning.landscape@1.0.0

One trusted primitive for every optimizer's update rule (ADR-0047). The rule arrives as data, an
`OptimizerSpec` in the closed expression grammar a `ModelSpec` uses; the surface it runs on is one of
a closed list the primitive differentiates exactly. Nothing is evaluated from text.

## The surface

L1. A quadratic over the plane: f(x, y) = ½·hx·(x − cx)² + ½·hy·(y − cy)² + gx·x + gy·y, with hx,
hy ≥ 0. Its gradient is exact: ∂f/∂x = hx·(x − cx) + gx, ∂f/∂y = hy·(y − cy) + gy. Its lowest point is
(cx − gx/hx, cy − gy/hy) where it curves, and its centre along a direction that does not.

## The rule

L2. Each coordinate of the plane keeps the rule's state alike: the position, and state such as a
velocity. Before the first step each state takes its initial value, made of hyperparameters and
numbers; the position takes the surface's starting point instead.

L3. One step, number t from 1: where the gradient is taken is computed for both coordinates from the
state as it is; the surface's gradient there is g; then each line of the update runs in order, each
coordinate alike, a later line reading the values earlier lines gave in the same step.

L4. A step whose result holds any value that is not a finite number is refused with a RangeError,
naming the state, the coordinate and the step. Nothing is drawn of it.

## Determinism

L5. Float64 throughout; sums and products run over their arguments left to right; no chance, no
clock, no workers. The seed is checked and changes nothing. The same spec and parameters give the
same run bit for bit on one runtime, and a state read back from JSON runs on as the original does.

## What it measures

L6. The loss at the position, f(x, y); the distance from the lowest point; the position's two
coordinates; and how far the last step moved the position, the length of its change in the plane.

## Variables

L7. The rule's hyperparameters are live: a learner may change them between steps. The starting
point's two coordinates shape only the start of a run.
