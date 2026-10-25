import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { attentionToy, cos, entropyOf, exp, ln, orderFreeSum, sin, softmax, sqrt, type AttentionParams } from "../src/attention/index.ts";

// attention.toy@1.0.0's oracles (ADR-0054), each written by hand from the paper's definitions
// before the primitive ran: what must hold for any weights, so they hold for seeded random ones.

const base: AttentionParams = { tokens: [3, 1, 4, 1, 5, 9, 2, 6], vocab: 10, dModel: 8, heads: 2, scaled: 1, positional: 1, causal: 0, recurrent: 0 };
const run = (overrides: Partial<AttentionParams> = {}, seed = 7) => attentionToy.init({ ...base, ...overrides }, seed);

describe("[R01] attention.toy's own arithmetic", () => {
  it("never asks the engine for exp, log, sin, cos, a power or a square root, whose last bits may differ between browsers", () => {
    const folder = join(import.meta.dirname, "..", "src", "attention");
    for (const file of readdirSync(folder).filter((name) => name.endsWith(".ts"))) {
      const code = readFileSync(join(folder, file), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(code, file).not.toMatch(/Math\.(exp|expm1|log|log2|log10|log1p|sin|cos|tan|pow|sqrt|cbrt|hypot)\b|\*\*/);
    }
  });

  it("agrees with the engine's functions to within a few units in the last place", () => {
    for (let x = -30; x <= 30; x += 0.37) expect(Math.abs(exp(x) / Math.exp(x) - 1)).toBeLessThan(4e-16);
    for (let x = 1e-6; x < 1e6; x *= 3.7) expect(Math.abs(ln(x) - Math.log(x))).toBeLessThan(4e-16 * Math.max(1, Math.abs(Math.log(x))));
    for (let x = -60; x <= 60; x += 0.73) {
      expect(Math.abs(sin(x) - Math.sin(x))).toBeLessThan(2e-15);
      expect(Math.abs(cos(x) - Math.cos(x))).toBeLessThan(2e-15);
    }
    for (let x = 1; x <= 1024; x++) expect(sqrt(x)).toBe(Math.sqrt(x));
  });

  it("gives exact answers where the true answer is a double: e⁰ = 1, ln 1 = 0, √4 = 2, √16 = 4", () => {
    expect(exp(0)).toBe(1);
    expect(ln(1)).toBe(0);
    expect(sqrt(4)).toBe(2);
    expect(sqrt(16)).toBe(4);
  });

  it("sums terms in an order of their own, so any order of the same terms gives the same sum", () => {
    const terms = [0.1, 1e16, -1e16, 0.2, 0.3];
    expect(orderFreeSum(terms)).toBe(orderFreeSum([...terms].reverse()));
    expect(orderFreeSum(terms)).toBe(orderFreeSum([0.3, -1e16, 0.1, 1e16, 0.2]));
  });
});

describe("[R01] attention.toy's oracles, by hand", () => {
  it("softmax is unchanged by adding a constant to every logit: exactly, for logits the constant moves exactly", () => {
    const logits = [0.5, -1.25, 2, 0.75];
    expect(softmax(logits.map((value) => value + 8))).toEqual(softmax(logits));
    const rough = [0.3141, -2.718, 1.414, 0.577];
    softmax(rough.map((value) => value + 3.3)).forEach((weight, index) => expect(weight).toBeCloseTo(softmax(rough)[index] ?? Number.NaN, 15));
  });

  it("equal keys give uniform weights, each exactly 1/n", () => {
    const same = run({ tokens: [7, 7, 7, 7, 7], positional: 0 });
    for (const head of same.heads) for (const row of head.weights) expect(row).toEqual([0.2, 0.2, 0.2, 0.2, 0.2]);
    expect(entropyOf([0.25, 0.25, 0.25, 0.25])).toBeCloseTo(Math.log(4), 15);
    expect(entropyOf([1, 0, 0])).toBe(0);
  });

  it("dividing by √dk lowers the logits' spread by exactly that factor: exactly where √dk is a power of two, and to rounding otherwise", () => {
    // dModel 8 over 2 heads: dk = 4, √dk = 2, so dividing is exact.
    const scaled = run({ scaled: 1 });
    const unscaled = run({ scaled: 0 });
    scaled.heads.forEach((head, h) => head.logits.forEach((row, i) => row.forEach((logit, j) => expect(logit * 2).toBe(unscaled.heads[h]?.logits[i]?.[j]))));
    expect(attentionToy.measure(unscaled).logitSpread).toBe(2 * attentionToy.measure(scaled).logitSpread);
    // dModel 6 over 2 heads: dk = 3.
    const three = run({ dModel: 6, scaled: 1 });
    const threeOff = run({ dModel: 6, scaled: 0 });
    expect(attentionToy.measure(threeOff).logitSpread / attentionToy.measure(three).logitSpread).toBeCloseTo(Math.sqrt(3), 13);
  });

  it("without positional encoding, shuffling the input shuffles the output the same way, exactly", () => {
    const order = [5, 2, 7, 0, 3, 6, 1, 4];
    const before = run({ positional: 0 });
    const after = run({ positional: 0, tokens: order.map((index) => base.tokens[index] ?? 0) });
    order.forEach((from, to) => expect(after.output[to]).toEqual(before.output[from]));
    expect(before.shuffleGap).toBe(0);
    // With it, order shows: the reversed input's output is not the output reversed.
    expect(run({ positional: 1 }).shuffleGap).toBeGreaterThan(1e-3);
  });

  it("with the causal mask, every weight on a later position is exactly 0, and each row still sums to 1", () => {
    const masked = run({ causal: 1 });
    for (const head of masked.heads)
      head.weights.forEach((row, i) => {
        row.forEach((weight, j) => {
          if (j > i) expect(weight).toBe(0);
        });
        expect(orderFreeSum(row)).toBeCloseTo(1, 15);
      });
    expect(attentionToy.measure(masked).futureWeight).toBe(0);
    expect(attentionToy.measure(run({ causal: 0 })).futureWeight).toBeGreaterThan(0.1);
  });

  it("the path between any two positions is 1 layer long; a recurrent layer's is |i − j|; the mask closes later to earlier", () => {
    const state = run();
    const n = base.tokens.length;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) expect(attentionToy.queries?.pathLength?.(state as never, i as never, j as never)).toBe(i === j ? 0 : 1);
    expect(attentionToy.measure(state).meanPathLength).toBe(1);
    const recurrent = run({ recurrent: 1 });
    expect(attentionToy.queries?.pathLength?.(recurrent as never, 1 as never, 6 as never)).toBe(5);
    expect(attentionToy.measure(recurrent).meanPathLength).toBe(3);
    expect(attentionToy.queries?.pathLength?.(run({ causal: 1 }) as never, 6 as never, 1 as never)).toBe(Number.POSITIVE_INFINITY);
  });

  it("is the same bit for bit from the same seed, different from another, and a step changes nothing", () => {
    expect(run({}, 7)).toEqual(run({}, 7));
    expect(run({}, 8).output).not.toEqual(run({}, 7).output);
    const state = run();
    expect(attentionToy.step(state, { ...base }, 1)).toBe(state);
  });

  it("pins one forward pass's exact bits, which any engine must reproduce: the weights and output from the defaults, seed 7", () => {
    const state = attentionToy.init(attentionToy.defaults, 7);
    const view = new DataView(new ArrayBuffer(8));
    const bits = [...state.output.flat(), ...state.heads.flatMap((head) => head.weights.flat())]
      .map((value) => {
        view.setFloat64(0, value);
        return view.getBigUint64(0).toString(16).padStart(16, "0");
      })
      .join("");
    expect(createHash("sha256").update(bits).digest("hex")).toBe("85b1b5c8f300e4e39c59c6c991e1b44bb2f12edeb1d334e87aa94303b643b1ce");
  });

  it("refuses a model width that does not divide among its heads, and a token beyond its vocabulary", () => {
    expect(() => run({ dModel: 7, heads: 2 })).toThrow(/divide/);
    expect(() => run({ tokens: [1, 12] })).toThrow(/vocab/);
  });
});
