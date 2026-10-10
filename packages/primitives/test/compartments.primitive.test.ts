import type { ModelSpec } from "@paperplay/contracts";
import { describe, expect, it } from "vitest";
import { compartmentModel, type CompartmentModel, type CompartmentParams, type CompartmentState } from "../src/compartments/index.ts";
import { runEvents, type Primitive } from "../src/index.ts";
import { c, compartment, deepFreeze, defaults, exp, log, model, mul, n, neg, p, parameter, sirPeople } from "./compartments.examples.ts";

function run(subject: CompartmentModel, params: CompartmentParams, steps: number, start: CompartmentState = subject.init(params, 0)): CompartmentState[] {
  const states = [start];
  for (let k = 0; k < steps; k++) states.push(subject.step(states[k] as CompartmentState, params, subject.fixedTimestep));
  return states;
}

/** Every number in both runs is the same IEEE-754 value (Object.is), not merely close. */
function bitwiseEqual(a: readonly CompartmentState[], b: readonly CompartmentState[]): boolean {
  const numbers = (states: readonly CompartmentState[]) => states.flatMap((state) => [state.stepIndex, ...Object.values(state.compartments)]);
  const [left, right] = [numbers(a), numbers(b)];
  return left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
}

/** dx/dt = −ω y, dy/dt = ω x from (1, 0): a rotation, whose RK4 step can be worked by hand. */
const rotation = (): ModelSpec =>
  model({
    compartments: [compartment("x", {}, n(1), "x", false), compartment("y", {}, n(0), "y", false)],
    parameters: [parameter("omega", { time: -1 }, [0, 2], 1, "ω", "Turning rate")],
    rates: { x: neg(mul(p("omega"), c("y"))), y: mul(p("omega"), c("x")) },
    dt: 0.5,
  });

describe("[R01] compartments.ode: the primitive", () => {
  const sir = compartmentModel(sirPeople());
  const params = defaults(sirPeople());

  it("is compartments.ode@1.0.0, stepping at the model's declared step, and satisfies the Primitive interface", () => {
    const asPrimitive: Primitive<CompartmentParams, CompartmentState> = sir;
    expect(asPrimitive.id).toBe("compartments.ode");
    expect(asPrimitive.version).toBe("1.0.0");
    expect(sir.fixedTimestep).toBe(0.1);
  });

  it("starts from each compartment's initial value, keyed in compartment order (E5)", () => {
    const start = sir.init(params, 0);
    expect(start).toEqual({ stepIndex: 0, compartments: { s: 999, i: 1, r: 0 } });
    expect(Object.keys(start.compartments)).toEqual(["s", "i", "r"]);
  });

  it("checks the seed, and ignores it, because the model has no randomness", () => {
    expect(bitwiseEqual([sir.init(params, 0)], [sir.init(params, 4294967295)])).toBe(true);
    for (const seed of [-1, 1.5, 2 ** 32]) expect(() => sir.init(params, seed), String(seed)).toThrow(RangeError);
  });

  it("takes one RK4 step exactly as MODEL.md E3 writes it, coupling the components in order", () => {
    // Worked by hand for h = 0.5 and ω = 1: k1 = (0, 1), k2 = (−h/2, 1), k3 = (−h/2, 1 − h²/4),
    // k4 = (−h + h³/4, 1 − h²/2), so x′ = 1 − h²/2 + h⁴/24 and y′ = h − h³/6.
    const turning = compartmentModel(rotation());
    const next = turning.step(turning.init({ omega: 1 }, 0), { omega: 1 }, 0.5);
    expect(next.stepIndex).toBe(1);
    expect(next.compartments.x).toBeCloseTo(1 - 0.125 + 0.0625 / 24, 14);
    expect(next.compartments.y).toBeCloseTo(0.5 - 0.125 / 6, 14);
  });

  it("never steps coarser than its declared step, nor by a step that is not a positive number", () => {
    const start = sir.init(params, 0);
    for (const dt of [0, -0.1, 0.10000000000000002, 1, Number.NaN, Infinity]) expect(() => sir.step(start, params, dt), String(dt)).toThrow(RangeError);
    expect(sir.step(start, params, 0.05).stepIndex).toBe(1);
  });

  it("refuses a step or a start that is not a finite number, rather than return one (E4, E5)", () => {
    const blowUp = compartmentModel(
      model({ compartments: [compartment("x", {}, n(800))], parameters: [parameter("k", { time: -1 }, [0, 1], 1)], rates: { x: mul(p("k"), exp(c("x"))) } }),
    );
    expect(() => blowUp.step(blowUp.init({ k: 1 }, 0), { k: 1 }, 0.1)).toThrow(/x \(x\) would become Infinity at step 1, not a finite number/);
    const logStart = compartmentModel(model({ compartments: [compartment("x", {}, log(p("a")))], parameters: [parameter("a", {}, [0, 1], 0.5)], rates: { x: n(0) } }));
    expect(() => logStart.init({ a: 0 }, 0)).toThrow(/the initial value of x \(x\) is -Infinity/);
  });

  it("needs every parameter, as a finite number", () => {
    const { beta: _beta, ...missing } = params;
    expect(() => sir.init(missing, 0)).toThrow(/parameter beta must be a finite number/);
    expect(() => sir.step(sir.init(params, 0), { ...params, gamma: Number.NaN }, 0.1)).toThrow(RangeError);
  });

  it("measures its observables from the state alone, in the spec's order (E6)", () => {
    const observed = sir.measure(sir.init(params, 0));
    expect(Object.keys(observed)).toEqual(["infectious", "infectiousShare"]);
    expect(observed).toEqual({ infectious: 1, infectiousShare: 1 / 1000 });
  });

  it("replays bit for bit, and from a JSON round trip of its state", () => {
    const first = run(sir, params, 600);
    expect(bitwiseEqual(first, run(sir, params, 600))).toBe(true);
    const restored = sir.stateSchema.parse(JSON.parse(JSON.stringify(first[0])));
    expect(bitwiseEqual(first, run(sir, params, 600, restored))).toBe(true);
    expect(bitwiseEqual(first, run(compartmentModel(sirPeople()), params, 600))).toBe(true);
  });

  it("runs through the shared run loop like any primitive", () => {
    const result = runEvents(
      { primitive: sir, params, actions: { transmission: "beta" } },
      { initialState: sir.init(params, 0), events: [{ kind: "param", step: 50, actionId: "transmission", value: 0.8 }], totalSteps: 200, sampleInterval: 20, timestep: sir.fixedTimestep },
    );
    expect(result.observables.infectious).toHaveLength(11);
    expect(result.finalState.stepIndex).toBe(200);
  });
});

describe("[R01] compartments.ode: its schemas", () => {
  const sir = compartmentModel(sirPeople());

  it("accepts the parameters within their ranges, and only those", () => {
    const params = defaults(sirPeople());
    expect(sir.paramSchema.safeParse(params).success).toBe(true);
    expect(sir.paramSchema.safeParse({ ...params, beta: 2.5 }).success).toBe(false);
    expect(sir.paramSchema.safeParse({ ...params, delta: 1 }).success).toBe(false);
    const { gamma: _gamma, ...missing } = params;
    expect(sir.paramSchema.safeParse(missing).success).toBe(false);
  });

  it("reads a state back from JSON, compartments in the spec's order whatever order they arrive in", () => {
    const read = sir.stateSchema.parse({ stepIndex: 3, compartments: { r: 2, i: 1, s: 997 } });
    expect(Object.keys(read.compartments)).toEqual(["s", "i", "r"]);
    for (const bad of [
      { stepIndex: 0, compartments: { s: 1, i: 1 } },
      { stepIndex: 0, compartments: { s: 1, i: 1, r: 0, e: 0 } },
      { stepIndex: -1, compartments: { s: 1, i: 1, r: 0 } },
      { stepIndex: 1.5, compartments: { s: 1, i: 1, r: 0 } },
      { stepIndex: 0, compartments: { s: "1", i: 1, r: 0 } },
      { stepIndex: 0, compartments: { s: 1, i: 1, r: 0 }, time: 0 },
    ]) {
      expect(sir.stateSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("[R01] compartments.ode: describe()", () => {
  const description = compartmentModel(sirPeople()).describe();

  it("describes each parameter with its unit in words, its name and symbol, its range and default", () => {
    expect(description.variables.beta).toEqual({ unit: "per day", meaning: "Transmission rate (β)", range: [0, 2], defaultValue: 0.4, phase: "live", integer: false });
    expect(description.variables.population).toEqual({ unit: "people", meaning: "Population (N)", range: [1, 1e6], defaultValue: 1000, phase: "init", integer: false });
  });

  it("marks a parameter that shapes an initial value init, and every other live", () => {
    expect(Object.fromEntries(Object.entries(description.variables).map(([id, variable]) => [id, variable.phase]))).toEqual({
      beta: "live",
      gamma: "live",
      population: "init",
      seeded: "init",
    });
  });

  it("describes each observable by its label and its unit in words", () => {
    expect(description.observables).toEqual({
      infectious: { unit: "people", meaning: "People infectious" },
      infectiousShare: { unit: "dimensionless", meaning: "Share of people infectious" },
    });
  });

  it("states its assumptions in plain English: deterministic, RK4 at a fixed step, and what the accuracy check refuses", () => {
    const text = description.assumptions.join(" ");
    expect(text).toMatch(/Deterministic/);
    expect(text).toMatch(/no randomness/);
    expect(text).toMatch(/Runge–Kutta method \(RK4\) at a fixed step of 0\.1 days/);
    expect(text).toMatch(/half the step/);
    expect(text).toMatch(/stiff or unstable/);
    expect(text).toMatch(/refuses to draw it rather than draw it wrong/);
  });
});

describe("[R01] compartments.ode: inputs are never written to", () => {
  it("runs from a deep-frozen spec, parameters and state without writing to any of them", () => {
    const spec = deepFreeze(sirPeople());
    const params = deepFreeze(defaults(spec));
    const subject = compartmentModel(spec);
    const start = deepFreeze(subject.init(params, 0));
    const before = JSON.stringify([spec, params, start]);

    const next = subject.step(start, params, subject.fixedTimestep);
    subject.measure(next);
    subject.describe();

    expect(JSON.stringify([spec, params, start])).toBe(before);
    expect(next).not.toBe(start);
  });

  it("returns frozen states, observables, descriptions and itself", () => {
    const subject = compartmentModel(sirPeople());
    const params = defaults(sirPeople());
    const state = subject.init(params, 0);
    expect(Object.isFrozen(subject)).toBe(true);
    expect(Object.isFrozen(state) && Object.isFrozen(state.compartments)).toBe(true);
    expect(Object.isFrozen(subject.measure(state))).toBe(true);
    expect(Object.isFrozen(subject.describe().variables.beta)).toBe(true);
    expect(Object.isFrozen(subject.spec.equations[0]?.rate)).toBe(true);
  });

  it("keeps its own copy of the spec, so a caller's later edit cannot reach it", () => {
    const spec = sirPeople();
    const subject = compartmentModel(spec);
    const params = defaults(spec);
    const first = run(subject, params, 100);
    spec.equations[0] = { ...spec.equations[0], of: "s", rate: n(0) } as ModelSpec["equations"][number];
    spec.parameters[0] = { ...spec.parameters[0], range: [0, 100] } as ModelSpec["parameters"][number];
    expect(bitwiseEqual(first, run(subject, params, 100))).toBe(true);
    expect(subject.spec.equations[0]?.rate).not.toEqual(n(0));
    expect(subject.paramSchema.safeParse({ ...params, beta: 50 }).success).toBe(false);
  });
});
