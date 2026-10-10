import type { Expr } from "@paperplay/contracts";
import { describe, expect, it } from "vitest";
import { compileExpr, compileMagnitude, formatExpr, type Indices } from "../src/compartments/index.ts";
import { add, c, div, exp, log, mul, n, neg, p, pow, sub } from "./compartments.examples.ts";

const indices: Indices = { compartments: new Map([["x", 0], ["y", 1]]), parameters: new Map([["a", 0], ["b", 1]]) };
const x = Float64Array.from([3, -2]);
const theta = Float64Array.from([0.5, 4]);
const value = (expr: Expr): number => compileExpr(expr, indices)(x, theta);

describe("[R01] compartments.ode expressions: the interpreter (MODEL.md E1)", () => {
  it("evaluates every node", () => {
    expect(value(n(2.5))).toBe(2.5);
    expect(value(p("b"))).toBe(4);
    expect(value(c("y"))).toBe(-2);
    expect(value(add(c("x"), c("y"), p("a")))).toBe(1.5);
    expect(value(mul(c("x"), c("y"), p("b")))).toBe(-24);
    expect(value(sub(c("x"), c("y")))).toBe(5);
    expect(value(div(c("x"), p("b")))).toBe(0.75);
    expect(value(pow(p("b"), p("a")))).toBe(2);
    expect(value(neg(c("x")))).toBe(-3);
    expect(value(exp(n(0)))).toBe(1);
    expect(value(exp(c("x")))).toBe(Math.exp(3));
    expect(value(log(p("b")))).toBe(Math.log(4));
  });

  it("sums and multiplies its arguments left to right, as written", () => {
    // 1e16 + 1 rounds back to 1e16, so the order decides whether the 1 survives.
    expect(value(add(n(1e16), n(1), n(-1e16)))).toBe(0);
    expect(value(add(n(1e16), n(-1e16), n(1)))).toBe(1);
    expect(value(mul(n(2 ** 1023), n(2), n(0.5)))).toBe(Infinity);
    expect(value(mul(n(2 ** 1023), n(0.5), n(2)))).toBe(2 ** 1023);
  });

  it("follows IEEE arithmetic to its edges rather than hiding them", () => {
    expect(value(div(n(1), n(0)))).toBe(Infinity);
    expect(value(log(n(0)))).toBe(-Infinity);
    expect(value(sub(n(0), n(0)))).toBe(0);
    expect(Number.isNaN(value(log(neg(n(1)))))).toBe(true);
  });

  it("gives the same bits for the same inputs, compiled once or twice", () => {
    const expr = sub(mul(p("b"), c("x"), exp(div(c("y"), p("b")))), pow(add(c("x"), n(0.1)), p("a")));
    const [once, again] = [compileExpr(expr, indices), compileExpr(expr, indices)];
    for (let k = 0; k < 50; k++) {
      const state = Float64Array.from([k / 7, 1 - k / 13]);
      const params = Float64Array.from([k / 11, 2 + k / 3]);
      expect(Object.is(once(state, params), once(state, params))).toBe(true);
      expect(Object.is(once(state, params), again(state, params))).toBe(true);
    }
  });

  it("reads its two vectors and writes to neither", () => {
    const [state, params] = [Float64Array.from(x), Float64Array.from(theta)];
    compileExpr(add(mul(c("x"), p("a")), neg(c("y"))), indices)(state, params);
    expect([...state]).toEqual([...x]);
    expect([...params]).toEqual([...theta]);
  });

  it("refuses a name its indices do not hold, when it compiles", () => {
    expect(() => compileExpr(p("gamma"), indices)).toThrow(RangeError);
    expect(() => compileExpr(add(c("x"), c("z")), indices)).toThrow(/compartment z/);
  });
});

describe("[R01] compartments.ode expressions: sizes without cancellation (MODEL.md C4)", () => {
  const size = (expr: Expr): number => compileMagnitude(expr, indices)(x, theta);

  it("adds the sizes a sum or difference would cancel, and multiplies a product's", () => {
    // x = 3, y = −2, a = 0.5, b = 4.
    expect(size(sub(mul(p("b"), c("x")), mul(p("b"), c("x"))))).toBe(24);
    expect(size(add(c("x"), c("y")))).toBe(5);
    expect(size(mul(c("y"), p("b")))).toBe(8);
    expect(size(neg(c("y")))).toBe(2);
    expect(size(div(c("y"), sub(c("x"), p("b"))))).toBe(2);
  });

  it("takes exp, log and pow at their own size", () => {
    expect(size(exp(c("y")))).toBe(Math.exp(-2));
    expect(size(log(p("a")))).toBe(Math.abs(Math.log(0.5)));
    expect(size(pow(c("y"), n(3)))).toBe(8);
  });

  it("is never smaller than the value's size", () => {
    const exprs = [sub(c("x"), c("x")), add(c("y"), n(2)), mul(sub(c("x"), p("b")), c("y")), div(neg(c("x")), add(p("a"), p("b")))];
    for (const expr of exprs) expect(size(expr)).toBeGreaterThanOrEqual(Math.abs(value(expr)));
  });
});

describe("[R01] compartments.ode expressions: written out for messages", () => {
  it("writes ids in ordinary notation, bracketing only where needed", () => {
    expect(formatExpr(add(c("s"), c("i"), c("r")))).toBe("s + i + r");
    expect(formatExpr(sub(mul(p("beta"), c("s"), c("i")), mul(p("gamma"), c("i"))))).toBe("beta × s × i − gamma × i");
    expect(formatExpr(neg(div(mul(p("beta"), c("s"), c("i")), p("population"))))).toBe("−(beta × s × i / population)");
    expect(formatExpr(sub(c("a"), add(c("b"), c("c"))))).toBe("a − (b + c)");
    expect(formatExpr(div(c("a"), mul(c("b"), c("c"))))).toBe("a / (b × c)");
    expect(formatExpr(mul(add(c("a"), c("b")), c("c")))).toBe("(a + b) × c");
    expect(formatExpr(pow(add(c("x"), n(1)), n(2)))).toBe("(x + 1)^2");
    expect(formatExpr(exp(neg(c("x"))))).toBe("exp(−x)");
    expect(formatExpr(mul(n(-2), c("x")))).toBe("−2 × x");
    expect(formatExpr(pow(n(-2), c("x")))).toBe("(−2)^x");
  });
});
