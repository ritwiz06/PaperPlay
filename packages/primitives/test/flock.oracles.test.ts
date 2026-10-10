// Runs the hand-derived oracle fixtures in fixtures/oracles/flock.planar.weighted/.
// The expected behaviour lives in the fixtures (derived from MODEL.md); this harness
// only drives the public primitive API and compares. It shares no helpers with src/.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { registry } from "../src/index.ts";
import { flockPlanarWeighted, flockReadsAsOneGroup, type FlockParams, type FlockState } from "../src/agents/flock/index.ts";

const flock = flockPlanarWeighted;
const FIXTURES = new URL("../../../fixtures/oracles/flock.planar.weighted/", import.meta.url);
const REQUIRED = [
  "flock.rules-off.agreement-frozen",
  "flock.alignment-only.orders-global-flock",
  "flock.replay.same-seed-same-events-bitwise",
];

const Num = z.number();
const Entity = z.strictObject({ id: z.string().min(1), x: Num, y: Num });
const AgentJson = z.strictObject({ x: Num, y: Num, vx: Num, vy: Num });
const StateJson = z
  .strictObject({
    width: Num,
    height: Num,
    stepIndex: z.int().nonnegative(),
    agents: z.array(AgentJson).min(2),
    beacons: z.array(Entity),
    obstacles: z.array(Entity),
  })
  .refine(
    (state) =>
      [...state.agents, ...state.beacons, ...state.obstacles].every(
        (p) => p.x >= 0 && p.x < state.width && p.y >= 0 && p.y < state.height,
      ),
    "every point must lie inside [0, width) × [0, height)",
  );
const Params = z.record(z.string(), Num);
const Metric = z.enum(["directionalAgreement", "meanNeighbourDistance", "clusterCount"]);
const Transform = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("reflect-diagonal") }),
  z.strictObject({ type: z.literal("reverse-order") }),
  z.strictObject({ type: z.literal("translate"), by: z.tuple([Num, Num]) }),
]);
const common = {
  oracle: z.literal("oracle/1"),
  id: z.string().min(1),
  primitive: z.strictObject({ id: z.literal("flock.planar.weighted"), version: z.literal("3.1.0") }),
  basis: z.enum(["derived", "expected-qualitative"]),
  claim: z.string().min(1),
  derivation: z.array(z.string().min(1)).min(1),
};
const Fixture = z.discriminatedUnion("kind", [
  z.strictObject({
    ...common,
    kind: z.literal("one-step"),
    params: Params,
    dt: Num,
    state: StateJson,
    expected: z.strictObject({ agents: z.array(AgentJson) }),
    tolerance: Num,
  }),
  z.strictObject({
    ...common,
    kind: z.literal("measure"),
    state: StateJson,
    expected: z.strictObject({ directionalAgreement: Num, meanNeighbourDistance: Num, clusterCount: z.int(), strayShare: Num, groupSpread: Num, birdsAtObstacles: z.int() }),
    tolerance: Num,
  }),
  z.strictObject({
    ...common,
    kind: z.literal("conserved-velocity-sum"),
    params: Params,
    dt: Num,
    state: StateJson,
    steps: z.int().positive(),
    tolerance: Num,
  }),
  z.strictObject({
    ...common,
    kind: z.literal("frozen-observable"),
    params: Params,
    dt: Num,
    seeds: z.array(z.int()).min(1),
    steps: z.int().positive(),
    metric: Metric,
  }),
  z.strictObject({
    ...common,
    kind: z.literal("threshold"),
    params: Params,
    dt: Num,
    seeds: z.array(z.int()).min(1),
    steps: z.int().nonnegative(),
    metric: Metric,
    at: z.enum(["initial", "final"]),
    comparison: z.enum(["lt", "gt"]),
    value: Num,
  }),
  z.strictObject({
    ...common,
    kind: z.literal("metamorphic"),
    params: Params,
    dt: Num,
    seed: z.int(),
    steps: z.int().positive(),
    beacons: z.array(Entity),
    obstacles: z.array(Entity),
    transform: Transform,
    tolerance: Num,
  }),
  z.strictObject({
    ...common,
    kind: z.literal("replay"),
    params: Params,
    dt: Num,
    seed: z.int(),
    steps: z.int().positive(),
    events: z.array(z.strictObject({ step: z.int().nonnegative(), variable: z.string(), value: Num })),
  }),
]);
type Fixture = z.infer<typeof Fixture>;
type Of<K extends Fixture["kind"]> = Extract<Fixture, { kind: K }>;

const fixtures: Fixture[] = readdirSync(FIXTURES)
  .filter((file) => file.endsWith(".json"))
  .sort()
  .map((file) => Fixture.parse(JSON.parse(readFileSync(new URL(file, FIXTURES), "utf8"))));

const paramsOf = (raw: Record<string, number>): FlockParams => flock.paramSchema.parse(raw);

/** Signed difference on a ring of circumference `size`, the short way round. */
function ringDelta(a: number, b: number, size: number): number {
  const d = (((a - b) % size) + size) % size;
  return d > size / 2 ? d - size : d;
}

function wrapInto(value: number, size: number): number {
  const wrapped = ((value % size) + size) % size;
  return wrapped >= size ? 0 : wrapped;
}

function transformState(transform: z.infer<typeof Transform>, state: FlockState): FlockState {
  switch (transform.type) {
    case "reflect-diagonal":
      return {
        width: state.height,
        height: state.width,
        stepIndex: state.stepIndex,
        agents: state.agents.map((a) => ({ x: a.y, y: a.x, vx: a.vy, vy: a.vx })),
        beacons: state.beacons.map((p) => ({ id: p.id, x: p.y, y: p.x })),
        obstacles: state.obstacles.map((p) => ({ id: p.id, x: p.y, y: p.x })),
      };
    case "reverse-order":
      return { ...state, agents: [...state.agents].reverse() };
    case "translate": {
      const [dx, dy] = transform.by;
      const move = (p: { x: number; y: number }) => ({ x: wrapInto(p.x + dx, state.width), y: wrapInto(p.y + dy, state.height) });
      return {
        ...state,
        agents: state.agents.map((a) => ({ ...a, ...move(a) })),
        beacons: state.beacons.map((p) => ({ id: p.id, ...move(p) })),
        obstacles: state.obstacles.map((p) => ({ id: p.id, ...move(p) })),
      };
    }
  }
}

function runOneStep(f: Of<"one-step">): void {
  const next = flock.step(f.state, paramsOf(f.params), f.dt);

  expect(next.stepIndex).toBe(f.state.stepIndex + 1);
  expect(next.beacons).toEqual(f.state.beacons);
  expect(next.obstacles).toEqual(f.state.obstacles);
  expect(next.agents).toHaveLength(f.expected.agents.length);
  f.expected.agents.forEach((expected, k) => {
    const actual = next.agents[k];
    for (const key of ["x", "y", "vx", "vy"] as const) {
      expect(Math.abs((actual?.[key] ?? Number.NaN) - expected[key]), `bird ${k} ${key}`).toBeLessThanOrEqual(f.tolerance);
    }
  });
}

function runMeasure(f: Of<"measure">): void {
  const observed = flock.measure(f.state);

  expect(Math.abs(observed.directionalAgreement - f.expected.directionalAgreement)).toBeLessThanOrEqual(f.tolerance);
  expect(Math.abs(observed.meanNeighbourDistance - f.expected.meanNeighbourDistance)).toBeLessThanOrEqual(f.tolerance);
  expect(observed.clusterCount).toBe(f.expected.clusterCount);
  expect(observed.strayShare).toBeCloseTo(f.expected.strayShare, 12);
  expect(Math.abs(observed.groupSpread - f.expected.groupSpread)).toBeLessThanOrEqual(f.tolerance);
  expect(observed.birdsAtObstacles).toBe(f.expected.birdsAtObstacles);
  // O1: the flock reads as one group when it has exactly one group holding at least half the birds.
  expect(flockReadsAsOneGroup(observed)).toBe(f.expected.clusterCount === 1 && f.expected.strayShare <= 0.5);
}

function runConservedVelocitySum(f: Of<"conserved-velocity-sum">): void {
  const params = paramsOf(f.params);
  const sum = (s: FlockState) => s.agents.reduce((acc, a) => ({ x: acc.x + a.vx, y: acc.y + a.vy }), { x: 0, y: 0 });
  const start = sum(f.state);
  let state: FlockState = f.state;
  let worst = 0;
  for (let t = 0; t < f.steps; t++) {
    state = flock.step(state, params, f.dt);
    const now = sum(state);
    worst = Math.max(worst, Math.abs(now.x - start.x), Math.abs(now.y - start.y));
  }
  expect(worst).toBeLessThanOrEqual(f.tolerance);
}

function runFrozenObservable(f: Of<"frozen-observable">): void {
  const params = paramsOf(f.params);
  const moved: string[] = [];
  for (const seed of f.seeds) {
    let state = flock.init(params, seed);
    const initial = flock.measure(state)[f.metric];
    for (let t = 1; t <= f.steps; t++) {
      state = flock.step(state, params, f.dt);
      const value = flock.measure(state)[f.metric];
      if (!Object.is(value, initial)) {
        moved.push(`seed ${seed} step ${t}: ${initial} → ${value}`);
        break;
      }
    }
  }
  expect(moved).toEqual([]);
}

function runThreshold(f: Of<"threshold">): void {
  const params = paramsOf(f.params);
  const misses: string[] = [];
  for (const seed of f.seeds) {
    let state = flock.init(params, seed);
    if (f.at === "final") for (let t = 0; t < f.steps; t++) state = flock.step(state, params, f.dt);
    const value = flock.measure(state)[f.metric];
    const holds = f.comparison === "lt" ? value < f.value : value > f.value;
    if (!holds) misses.push(`seed ${seed}: ${f.metric} = ${value}`);
  }
  expect(misses).toEqual([]);
}

function runMetamorphic(f: Of<"metamorphic">): void {
  const params = paramsOf(f.params);
  const start: FlockState = { ...flock.init(params, f.seed), beacons: f.beacons, obstacles: f.obstacles };
  let original = start;
  let transformed = transformState(f.transform, start);
  const mismatches: string[] = [];
  const close = (a: number, b: number, size?: number) =>
    f.tolerance === 0 ? Object.is(a, b) : Math.abs(size === undefined ? a - b : ringDelta(a, b, size)) <= f.tolerance;

  for (let t = 1; t <= f.steps && mismatches.length === 0; t++) {
    original = flock.step(original, params, f.dt);
    transformed = flock.step(transformed, params, f.dt);
    const expected = transformState(f.transform, original);
    expected.agents.forEach((e, k) => {
      const a = transformed.agents[k];
      if (!a) return void mismatches.push(`step ${t}: bird ${k} missing`);
      const same =
        close(a.x, e.x, expected.width) && close(a.y, e.y, expected.height) && close(a.vx, e.vx) && close(a.vy, e.vy);
      if (!same) mismatches.push(`step ${t}: bird ${k} ${JSON.stringify(a)} ≠ ${JSON.stringify(e)}`);
    });
    const [mo, mt] = [flock.measure(original), flock.measure(transformed)];
    if (!close(mo.directionalAgreement, mt.directionalAgreement)) mismatches.push(`step ${t}: directionalAgreement`);
    if (!close(mo.meanNeighbourDistance, mt.meanNeighbourDistance)) mismatches.push(`step ${t}: meanNeighbourDistance`);
    if (mo.clusterCount !== mt.clusterCount) mismatches.push(`step ${t}: clusterCount`);
  }
  expect(mismatches.slice(0, 5)).toEqual([]);
}

function runReplay(f: Of<"replay">): void {
  const trace = (events: Of<"replay">["events"]): number[][] => {
    let params = paramsOf(f.params);
    let state = flock.init(params, f.seed);
    const rows: number[][] = [];
    const record = () => {
      const m = flock.measure(state);
      rows.push([m.directionalAgreement, m.meanNeighbourDistance, m.clusterCount]);
    };
    record();
    for (let step = 0; step < f.steps; step++) {
      for (const event of events.filter((e) => e.step === step)) params = paramsOf({ ...params, [event.variable]: event.value });
      state = flock.step(state, params, f.dt);
      record();
    }
    return rows;
  };

  const first = trace(f.events);
  const second = trace(f.events);
  const differing = first.flatMap((row, t) => row.filter((value, k) => !Object.is(value, second[t]?.[k])).map(() => t));
  expect(differing).toEqual([]);
  // The events must actually change the run, or the replay check would prove nothing.
  expect(trace([])).not.toEqual(first);
}

describe("[R01] flock.planar.weighted oracle fixtures", () => {
  it("includes the brief's three example oracles, each id once", () => {
    const ids = fixtures.map((f) => f.id);
    for (const id of REQUIRED) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names a primitive that the registry resolves", () => {
    for (const f of fixtures) expect(registry.get(f.primitive), f.id).toBe(flock);
  });

  for (const f of fixtures) {
    const label = `${f.id}: ${f.claim}${f.basis === "expected-qualitative" ? " (expected, not derived)" : ""}`;
    it(label, () => {
      switch (f.kind) {
        case "one-step":
          return runOneStep(f);
        case "measure":
          return runMeasure(f);
        case "conserved-velocity-sum":
          return runConservedVelocitySum(f);
        case "frozen-observable":
          return runFrozenObservable(f);
        case "threshold":
          return runThreshold(f);
        case "metamorphic":
          return runMetamorphic(f);
        case "replay":
          return runReplay(f);
      }
    });
  }
});
