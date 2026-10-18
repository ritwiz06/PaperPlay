/**
 * The momentum world, hand-authored (ADR-0046, ADR-0047): the learning family's reference, from
 * Sutskever, Martens, Dahl and Hinton 2013, as the WorldSpec in
 * fixtures/worldspecs/sutskever-2013-momentum.json. Classical momentum and Nesterov's accelerated
 * gradient, one update rule with a lookahead, on an oblong bowl like the paper's own two-dimensional
 * example. Written here once; `npm run fixture:momentum` writes the JSON, and a test holds the JSON
 * to it. Every anchor comes from its source map, fixtures/papers/momentum/source-map.json, made from
 * the paper's open copy on PMLR, whose text is not kept (ADR-0045, ADR-0047).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The paper's passages this world rests on, by claim: each the short quote its source map will locate. */
export const CLAIMS = {
  accelerates: "is a technique for accelerating gradient descent that accumulates a velocity vector in directions of persistent reduction in the objective across iterations",
  amplified: "they will tend to persist across iterations and be amplified by CM",
  correction: "both CM and NAG compute the new velocity by applying a gradient-based correction to the previous velocity vector (which is decayed)",
  partial: "NAG first performs a partial update",
  stably: "letting it behave more stably than CM in many situations, especially for higher values of μ",
  oscillations: "While the optimization path taken by CM exhibits large oscillations along the high-curvature vertical direction, NAG is able to avoid these oscillations almost entirely",
  tolerant: "thus making NAG more tolerant of large values of μ compared to CM",
  oblong: "a two-dimensional oblong quadratic objective, both with the same momentum and learning rate constants",
  aggressive: "the overly aggressive nature of CM or NAG would prevent this",
  crucial: "We find that both the initialization and the momentum are crucial",
  poorlyTuned: "well-initialized networks perform markedly worse when the momentum is absent or poorly tuned",
} as const;
export type Claim = keyof typeof CLAIMS;
/** The source map: each claim's anchor, located in the paper and checked against a fresh fetch by `npm run sources:check`. */
const SOURCE_MAP = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "fixtures", "papers", "momentum", "source-map.json"), "utf8")) as {
  readonly manifest: Record<string, unknown>;
  readonly claims: readonly { readonly id: string; readonly anchor: { readonly quote: string } }[];
};
const anchorOf = (claim: Claim) => {
  const id = claim.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  const found = SOURCE_MAP.claims.find((entry) => entry.id === id);
  if (!found || found.anchor.quote !== CLAIMS[claim]) throw new Error(`the source map has no claim ${id} quoting "${CLAIMS[claim]}"`);
  return found.anchor;
};
const need = (...claims: Claim[]) => claims.map(anchorOf);

const c = (id: string) => ({ c: id });
const p = (id: string) => ({ p: id });
const mul = (...args: unknown[]) => ({ op: "mul", args });
const value = (id: string, symbol: string, name: string, range: [number, number], defaultValue: number) => ({ id, symbol, name, unit: {}, range, defaultValue, origin: "teaching-choice", anchors: [] });

/** v ← μ·v − ε·∇f(θ + λ·μ·v), then θ ← θ + v: classical momentum at λ = 0, Nesterov's at λ = 1, as the paper's equations 1 to 4 write them. */
const RULE = {
  name: "momentum, classical or Nesterov's",
  state: [
    { id: "theta", symbol: "θ", name: "Position", initial: { n: 0 }, anchors: [] },
    { id: "v", symbol: "v", name: "Velocity", initial: { n: 0 }, anchors: need("accelerates") },
  ],
  position: "theta",
  hyperparameters: [
    value("eps", "ε", "Learning rate", [0, 0.2], 0.02),
    value("mu", "μ", "Momentum", [0, 0.999], 0.9),
    value("lookahead", "λ", "How far ahead the gradient is taken: 0 classical momentum, 1 Nesterov's", [0, 1], 0),
  ],
  gradientAt: { op: "add", args: [c("theta"), mul(p("lookahead"), p("mu"), c("v"))] },
  update: [
    { of: "v", next: { op: "sub", a: mul(p("mu"), c("v")), b: mul(p("eps"), c("g")) }, anchors: need("correction", "partial") },
    { of: "theta", next: { op: "add", args: [c("theta"), c("v")] }, anchors: need("correction") },
  ],
};
const SURFACE = {
  kind: "quadratic",
  name: "an oblong bowl, 25 times as curved across as along",
  hx: 1,
  hy: 25,
  cx: 0,
  cy: 0,
  gx: 0,
  gy: 0,
  extent: { x: [-6, 6], y: [-3, 3] },
  start: [value("x0", "x₀", "Where the ball starts, along the valley", [-6, 6], -5), value("y0", "y₀", "Where the ball starts, up the valley's side", [-3, 3], 1.5)],
  origin: "teaching-choice",
  anchors: need("oblong"),
};
const binding = (params: Record<string, number> = {}) => ({ type: "update-rule", solver: { id: "learning.landscape", version: "1.0.0" }, model: { optimizer: RULE, surface: SURFACE }, params, perWatchSecond: 12 });

const ELEMENTS = ["control-value", "range-numbers", "range-words", "readout-number", "equation", "analogy"];
const variant = (text: string, show: string[], extra: Record<string, unknown> = {}) => ({ text, show, hide: ELEMENTS.filter((element) => !show.includes(element)), ...extra });
const beginner = (text: string, analogy: string) => variant(text, ["range-words", "analogy"], { analogy, origin: "teaching-choice", anchors: [] });
const intermediate = (text: string) => variant(text, ["control-value", "range-numbers", "readout-number"], { origin: "teaching-choice", anchors: [] });
const advanced = (text: string, equation: string, origin: string, anchors: unknown[]) => variant(text, ["control-value", "range-numbers", "readout-number", "equation"], { equation, origin, anchors });

const MOMENTUM = (defaultValue: number) => ({ actionId: "momentum", label: "Momentum", targetVariable: "mu", range: [0, 0.99], unit: "dimensionless", defaultValue, origin: "paper-derived", anchors: need("accelerates") });
const MOMENTUM_SLIDER = { step: 0.01, ends: ["None", "A lot"] };
const STEP = (defaultValue: number) => ({ actionId: "learning-rate", label: "Step size", targetVariable: "eps", range: [0.005, 0.07], unit: "dimensionless", defaultValue, origin: "paper-derived", anchors: need("correction") });
const STEP_SLIDER = { step: 0.005, ends: ["Small steps", "Big steps"] };
const DISTANCE = { metricId: "distance", label: "Distance from the lowest point", shortLabel: "Distance to the bottom", unit: "dimensionless", decimals: 2, origin: "computed-observation" };
const MOVED = { metricId: "moved", label: "How far the last step moved the ball", shortLabel: "Step length", unit: "dimensionless", decimals: 3, origin: "computed-observation" };
const LOSS = { metricId: "loss", label: "The loss where the ball stands", shortLabel: "Loss", unit: "dimensionless", decimals: 2, origin: "computed-observation" };

const trend = (rising: string, falling: string) => ({ rising: { beginner: rising, measured: "rising" }, falling: { beginner: falling, measured: "falling" }, steady: "holding", within: 0.01 });
const DISTANCE_GUIDE = {
  readings: [
    { atLeast: 4, words: "the ball is still far up the valley" },
    { atLeast: 1.5, words: "the ball is on its way down the valley" },
    { atLeast: 0.2, words: "the ball is near the bottom" },
    { atLeast: 0, words: "the ball has all but reached the bottom" },
  ],
  trend: trend("and it is moving away", "and it is still closing in"),
};
const MOVED_GUIDE = {
  readings: [
    { atLeast: 0.4, words: "each step carries the ball a long way" },
    { atLeast: 0.1, words: "each step moves the ball a fair way" },
    { atLeast: 0.01, words: "each step moves the ball a little" },
    { atLeast: 0, words: "the ball has all but stopped" },
  ],
  trend: trend("and its steps are growing", "and its steps are shrinking"),
};
const LOSS_GUIDE = {
  readings: [
    { atLeast: 20, words: "the ball is high on the valley's side" },
    { atLeast: 5, words: "the ball is part of the way down" },
    { atLeast: 0.5, words: "the ball is low in the valley" },
    { atLeast: 0, words: "the ball is at the bottom" },
  ],
  trend: trend("and the loss is rising", "and the loss is falling"),
};
const MOMENTUM_GUIDE = {
  raised: "You gave the ball more momentum{to}, so more of each step's speed carries into the next.",
  lowered: "You gave the ball less momentum{to}, so less of each step's speed carries into the next.",
};
const STEP_GUIDE = {
  raised: "You made each step bigger{to}, so the slope pushes the ball further each time.",
  lowered: "You made each step smaller{to}, so the slope pushes the ball less far each time.",
};
const EQUATION = "v ← μ·v − ε·∇f(θ + λ·μ·v),  θ ← θ + v";

const levels = [
  {
    id: "hook",
    order: 1,
    kind: "hook",
    title: "Momentum crosses the valley",
    goal: "Change the ball's momentum, and watch how fast it reaches the bottom of a long, narrow valley.",
    bonus: false,
    binding: binding(),
    manipulable: MOMENTUM(0.9),
    slider: MOMENTUM_SLIDER,
    observable: DISTANCE,
    counterfactual: {
      prompt: "What if it had no momentum: plain gradient descent?",
      altParams: { mu: 0 },
      expectedQualitativeEffect: "With no momentum the ball creeps along the valley's floor: at step 36 it is more than 0.5 further from the lowest point.",
      origin: "teaching-choice",
      isSpeculative: false,
      anchors: [],
      difference: { metricId: "distance", label: "Distance from the lowest point at step 36", unit: "dimensionless", summary: { kind: "at", time: 36 }, time: 42, claim: { kind: "each", relation: "higher", by: 0.5 } },
    },
    setup: [],
    explanation: {
      beginner: beginner(
        "The ball rolls downhill one step at a time. Each step, the slope under it says which way is down. With momentum, the ball also keeps some of the speed it already had, so along a long gentle valley its speed builds up, and it gets to the bottom sooner.",
        "Like a sledge on a long, gentle hill: it starts slowly, but it keeps its speed from one moment to the next and soon runs fast.",
      ),
      intermediate: intermediate(
        "Each step adds the slope's push to a velocity, and the velocity moves the ball. Momentum sets how much of the last velocity is kept: at 0 each step starts afresh, at 0.9 most of it carries over. Along the valley's floor the slope keeps pointing the same way, so the velocity grows, step after step.",
      ),
      advanced: advanced(
        "Classical momentum keeps a velocity v: each step decays it by μ and adds −ε times the gradient, then moves θ by v. At λ = 0 the gradient is taken where the ball stands. In a direction where the gradient keeps its sign, v grows towards ε·|∇f|/(1 − μ), ten times a plain step at μ = 0.9.",
        EQUATION,
        "paper-derived",
        need("correction", "accelerates"),
      ),
    },
    caption: { text: "Momentum accumulates a velocity in directions that keep reducing the loss", origin: "paper-derived", anchors: need("accelerates") },
    guide: { idle: "The ball starts high on the valley's side. Watch it roll down, and along the floor to the bottom.", ...MOMENTUM_GUIDE, ...DISTANCE_GUIDE },
    guidedExploration: {
      predictPrompt: "With no momentum at all, would the ball be further from the bottom at step 36?",
      choices: ["Further away", "About as close"],
      interveneActionId: "momentum",
      observeMetricId: "distance",
      explainPrompt: "Why does keeping some speed help along the valley's floor?",
      explanation: { text: "The paper finds that both the initialization and the momentum are crucial.", origin: "paper-derived", anchors: need("crucial") },
    },
    furtherReading: [],
    carryForward: "Momentum keeps part of the ball's speed from step to step, so it speeds up wherever the slope keeps pointing the same way.",
  },
  {
    id: "background",
    order: 2,
    kind: "background",
    title: "Speed builds up",
    goal: "Change the step size, and watch how long each step becomes as the ball runs along the valley's floor.",
    bonus: false,
    binding: binding({ y0: 0.3 }),
    manipulable: STEP(0.02),
    slider: STEP_SLIDER,
    observable: MOVED,
    counterfactual: {
      prompt: "What if the momentum were halved, to 0.5?",
      altParams: { mu: 0.5 },
      expectedQualitativeEffect: "With half the momentum less speed carries over: the longest step within 60 steps is more than 0.1 shorter.",
      origin: "teaching-choice",
      isSpeculative: false,
      anchors: [],
      difference: { metricId: "moved", label: "The longest step within 60 steps", unit: "dimensionless", summary: { kind: "peak" }, time: 60, claim: { kind: "each", relation: "lower", by: 0.1 } },
    },
    setup: [],
    explanation: {
      beginner: beginner(
        "This time the ball starts low on the valley's side, so it mostly rolls along the floor. Each step is pushed by the slope and carries on with the speed it had, so the steps grow longer and longer until the ball nears the bottom.",
        "Like pushing a child on a swing: small pushes, each in time with the last, add up to a big swing.",
      ),
      intermediate: intermediate(
        "Along the valley's floor the slope keeps pointing the same way. Each step adds the same small push to a velocity that keeps most of itself, so the steps lengthen. The step size scales every push; momentum sets how much of the velocity survives from one step to the next.",
      ),
      advanced: advanced(
        "On a constant slope c, v_k = −ε·c·(1 − μ^k)/(1 − μ): the steps grow towards ε·c/(1 − μ). At μ = 0.5 that limit is twice a plain step; at μ = 0.9, ten times. Directions of low curvature change their gradient slowly, so momentum amplifies them.",
        "v_k = −ε·c·(1 − μᵏ)/(1 − μ)",
        "teaching-choice",
        [],
      ),
    },
    caption: { text: "Directions of low curvature persist, and momentum amplifies them", origin: "paper-derived", anchors: need("amplified") },
    guide: { idle: "The ball starts low on the valley's side. Watch its steps grow as it runs along the floor.", ...STEP_GUIDE, ...MOVED_GUIDE },
    guidedExploration: {
      predictPrompt: "With half the momentum, would the ball's longest step be shorter?",
      choices: ["Shorter", "About as long"],
      interveneActionId: "learning-rate",
      observeMetricId: "moved",
      explainPrompt: "Why do the steps keep growing while the slope keeps pointing the same way?",
      explanation: { text: "The paper says directions of low curvature tend to persist across iterations and are amplified by classical momentum.", origin: "paper-derived", anchors: need("amplified") },
    },
    furtherReading: [],
    carryForward: "Where the slope keeps pointing the same way, momentum lets the steps grow, up to ε/(1 − μ) times the slope.",
  },
  {
    id: "idea",
    order: 3,
    kind: "idea",
    title: "Ringing on the steep walls",
    goal: "Change the momentum, and watch the ball swing from wall to wall of the valley on its way down.",
    bonus: false,
    binding: binding({ eps: 0.03 }),
    manipulable: MOMENTUM(0.9),
    slider: MOMENTUM_SLIDER,
    observable: MOVED,
    counterfactual: {
      prompt: "What if it took the gradient a step ahead, as Nesterov's method does?",
      altParams: { lookahead: 1 },
      expectedQualitativeEffect: "Looking ahead, the ball stops swinging from wall to wall: its path within 96 steps is more than 2 shorter.",
      origin: "teaching-choice",
      isSpeculative: false,
      anchors: [],
      difference: { metricId: "moved", label: "The path's length within 96 steps", unit: "dimensionless", summary: { kind: "total" }, time: 96, claim: { kind: "each", relation: "lower", by: 2 } },
    },
    setup: [],
    explanation: {
      beginner: beginner(
        "Across the valley the walls are steep. With a lot of momentum the ball overshoots the floor, climbs the other wall, and swings back, again and again, before it settles. Nesterov's method looks a little ahead before it pushes, and catches the swing early.",
        "Like steering a bicycle: if you correct only where you are, you weave; if you look a little ahead, you ride straight.",
      ),
      intermediate: intermediate(
        "Classical momentum takes the gradient where the ball stands. Nesterov's accelerated gradient first moves the ball by its momentum, μ·v, and takes the gradient there. On a steep wall that gradient already points back, so the velocity is corrected before the overshoot, not after.",
      ),
      advanced: advanced(
        "With λ = 1 the gradient is taken at θ + μ·v. On a direction of curvature h this multiplies the kept velocity by μ·(1 − ε·h) rather than μ, a smaller effective momentum where the curvature is high, which damps the oscillation.",
        EQUATION,
        "paper-derived",
        need("partial"),
      ),
    },
    caption: { text: "Classical momentum oscillates along the steep direction; Nesterov's method avoids it", origin: "paper-derived", anchors: need("oscillations") },
    guide: { idle: "The ball starts high on the valley's side. Watch how it swings across the floor.", ...MOMENTUM_GUIDE, ...MOVED_GUIDE },
    guidedExploration: {
      predictPrompt: "If the ball took the gradient a step ahead, would its path be shorter?",
      choices: ["Shorter", "About as long"],
      interveneActionId: "momentum",
      observeMetricId: "moved",
      explainPrompt: "Why does looking a step ahead stop the swinging?",
      explanation: {
        text: "The paper reports that on a two-dimensional oblong bowl, classical momentum oscillates along the steep direction while Nesterov's method avoids these oscillations almost entirely.",
        origin: "paper-derived",
        anchors: need("oscillations"),
      },
    },
    furtherReading: [],
    carryForward: "Taking the gradient a step ahead, at θ + μ·v, damps the swing across a steep valley.",
  },
  {
    id: "evaluation",
    order: 4,
    kind: "evaluation",
    title: "Too much momentum",
    goal: "Change the momentum, and watch how close to the bottom the ball comes to rest.",
    bonus: false,
    binding: binding(),
    manipulable: MOMENTUM(0.8),
    slider: MOMENTUM_SLIDER,
    observable: DISTANCE,
    counterfactual: {
      prompt: "What if the momentum were turned up to 0.99?",
      altParams: { mu: 0.99 },
      expectedQualitativeEffect: "With nearly all its speed kept, the ball keeps overshooting: at step 150 it is more than 0.5 further from the lowest point.",
      origin: "teaching-choice",
      isSpeculative: false,
      anchors: [],
      difference: { metricId: "distance", label: "Distance from the lowest point at step 150", unit: "dimensionless", summary: { kind: "at", time: 150 }, time: 150, claim: { kind: "each", relation: "higher", by: 0.5 } },
    },
    setup: [],
    explanation: {
      beginner: beginner(
        "Momentum helps the ball get going, but it also keeps the ball going. With too much, the ball rolls past the bottom, up the other side and back, and takes a long time to settle.",
        "Like a heavy cart on a dip in the road: it does not stop at the bottom, it rolls back and forth for a long time.",
      ),
      intermediate: intermediate(
        "Each step keeps a share μ of the velocity. At 0.8 a swing dies away in a few dozen steps; at 0.99 it keeps almost all of itself, so the ball overshoots the bottom and swings for hundreds of steps before it settles.",
      ),
      advanced: advanced(
        "When the swing is underdamped, each step shrinks it by about √μ: 0.89 at μ = 0.8, but 0.995 at μ = 0.99. After 150 steps that leaves under a millionth of the swing at μ = 0.8, and nearly half at μ = 0.99.",
        "|swing after k steps| ∝ (√μ)ᵏ",
        "teaching-choice",
        [],
      ),
    },
    caption: { text: "Momentum can be too aggressive for fine convergence", origin: "paper-derived", anchors: need("aggressive") },
    guide: { idle: "The ball starts high on the valley's side. Watch where it comes to rest.", ...MOMENTUM_GUIDE, ...DISTANCE_GUIDE },
    guidedExploration: {
      predictPrompt: "With momentum at 0.99, would the ball be further from the bottom at step 150?",
      choices: ["Further away", "About as close"],
      interveneActionId: "momentum",
      observeMetricId: "distance",
      explainPrompt: "Why does keeping nearly all the speed stop the ball from settling?",
      explanation: { text: "The paper describes the overly aggressive nature of classical momentum and Nesterov's method late in training, which reducing the momentum overcomes.", origin: "paper-derived", anchors: need("aggressive") },
    },
    furtherReading: [],
    carryForward: "Too much momentum keeps the ball swinging past the bottom; less lets it settle.",
  },
  {
    id: "result",
    order: 5,
    kind: "result",
    title: "Momentum must be tuned",
    goal: "Change the step size of plain gradient descent, and watch the loss as the ball comes down.",
    bonus: false,
    binding: binding({ mu: 0 }),
    manipulable: STEP(0.06),
    slider: STEP_SLIDER,
    observable: LOSS,
    counterfactual: {
      prompt: "What if momentum 0.9 were added to this big step?",
      altParams: { mu: 0.9 },
      expectedQualitativeEffect: "Added to a step already big for the steep walls, momentum sets the ball swinging: over 60 steps the loss is higher by more than 0.5 on average.",
      origin: "teaching-choice",
      isSpeculative: false,
      anchors: [],
      difference: { metricId: "loss", label: "The loss on average over 60 steps", unit: "dimensionless", summary: { kind: "mean" }, time: 60, claim: { kind: "each", relation: "higher", by: 0.5 } },
    },
    setup: [],
    explanation: {
      beginner: beginner(
        "Momentum is not free. With big steps, plain gradient descent already comes down the steep walls quickly. Adding a lot of momentum on top makes the ball overshoot and swing, so it does worse, not better.",
        "Like pushing a swing harder while it is already high: the push and the swing together carry it too far.",
      ),
      intermediate: intermediate(
        "The best momentum depends on the step size and on how curved the valley is. A step size that suits plain descent on the steep walls, with 0.9 of the velocity kept, overshoots each wall and rings, and the loss stays high for longer.",
      ),
      advanced: advanced(
        "Across the valley, ε·h = 0.06 × 25 = 1.5: plain descent shrinks the swing by |1 − 1.5| = 0.5 a step. With μ = 0.9 the roots of λ² − (1 + μ − ε·h)·λ + μ = 0 are complex, of modulus √0.9 ≈ 0.95, so the swing dies away far more slowly.",
        "λ² − (1 + μ − ε·h)·λ + μ = 0",
        "teaching-choice",
        [],
      ),
    },
    caption: { text: "Networks train markedly worse when momentum is absent or poorly tuned", origin: "paper-derived", anchors: need("poorlyTuned") },
    guide: { idle: "No momentum this time, and big steps. Watch the loss as the ball comes down.", ...STEP_GUIDE, ...LOSS_GUIDE },
    guidedExploration: {
      predictPrompt: "If momentum 0.9 were added to this big step, would the loss stay higher?",
      choices: ["Higher", "About as low"],
      interveneActionId: "learning-rate",
      observeMetricId: "loss",
      explainPrompt: "Why can adding momentum make things worse?",
      explanation: { text: "The paper finds that well-initialized networks perform markedly worse when the momentum is absent or poorly tuned.", origin: "paper-derived", anchors: need("poorlyTuned") },
    },
    furtherReading: [],
    carryForward: "Momentum helps only when it is tuned to the step size and to the shape of the valley.",
  },
];

/** The WorldSpec, as plain data for the builder to check. */
export const momentumWorld = () => ({
  schemaVersion: "worldspec/3",
  status: "reviewed",
  title: "Momentum Valley",
  source: SOURCE_MAP.manifest,
  digest: {
    question: "Why does momentum speed up gradient descent, and when does it get in the way?",
    hookResult: { text: "Momentum lets descent build up speed in directions that keep reducing the loss, and training does markedly worse when it is absent or poorly tuned.", anchors: need("accelerates", "poorlyTuned") },
    causalChain: [
      { id: "velocity", claim: "Classical momentum accumulates a velocity in directions of persistent reduction in the objective.", dependsOn: [], anchors: need("accelerates"), origin: "paper-derived" },
      { id: "amplified", claim: "Directions of low curvature persist across iterations, so momentum amplifies them.", dependsOn: ["velocity"], anchors: need("amplified"), origin: "paper-derived" },
      { id: "oscillations", claim: "In directions of high curvature, classical momentum oscillates; Nesterov's method avoids these oscillations almost entirely.", dependsOn: ["velocity"], anchors: need("oscillations"), origin: "paper-derived" },
      { id: "tolerant", claim: "So Nesterov's method tolerates larger values of μ than classical momentum.", dependsOn: ["oscillations"], anchors: need("tolerant", "stably"), origin: "paper-derived" },
    ],
  },
  routing: {
    tier: "A",
    family: "learning",
    reason: "The paper's methods are update rules, classical momentum and Nesterov's accelerated gradient, which the learning family runs as data on a two-dimensional surface.",
    primitive: { status: "released" },
  },
  design: { world: "landscape", palette: "cream-teal", density: "comfortable", sections: levels.map((level) => ({ levelId: level.id, chartType: "line", motion: "none" })) },
  timeUnit: "step",
  openingSeed: 0,
  levels,
  primitivesUsed: [{ id: "learning.landscape", version: "1.0.0" }],
  checks: {
    suiteIds: ["worldspec-schema", "builder-bindings", "learning-checks"],
    suiteVersions: { "worldspec-schema": "worldspec/3", "builder-bindings": "1", "learning-checks": "1" },
  },
  limits: [
    {
      text: "A miniature: two dimensions stand in for the millions a deep network's loss has. The paper's experiments, deep autoencoders and recurrent networks trained for many hours, are not reproduced, and none of its results is.",
      origin: "teaching-choice",
      anchors: [],
    },
    { text: "The valley, its curvatures, the step sizes, the momenta and the ball's starting points are teaching choices, not the paper's.", origin: "teaching-choice", anchors: [] },
    { text: "The paper raises the momentum slowly during training, by a schedule; here each run keeps one momentum throughout.", origin: "teaching-choice", anchors: [] },
    {
      text: "The surface has no noise and the rule no chance, so the same settings always give the same run. Each level's statement is checked on the world's own settings and starting point and on 19 others, each within a tenth of them, not on 20 seeds.",
      origin: "teaching-choice",
      anchors: [],
    },
  ],
});

/** The fixture's text, as `npm run fixture:momentum` writes it. */
export const momentumJson = (): string => `${JSON.stringify(momentumWorld(), null, 2)}\n`;
