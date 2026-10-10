import type { Expr } from "@paperplay/contracts";
import { describe, expect, it } from "vitest";
import { addPolynomials, differentiate, expand, formatPolynomial, isZeroPolynomial, multiplyPolynomials, rationalOf, type Expansion, type Polynomial } from "../src/compartments/index.ts";
import { add, c, div, exp, log, mul, n, neg, p, pow, sub } from "./compartments.examples.ts";

/** The expansion, which the test expects to be a polynomial. */
function poly(expr: Expr): Polynomial {
  const expansion = expand(expr);
  if (!expansion.polynomial) throw new Error(`expected a polynomial, got: ${expansion.reason}`);
  return expansion.value;
}
const text = (expr: Expr): string => formatPolynomial(poly(expr));
const reason = (expansion: Expansion): string => (expansion.polynomial ? "a polynomial" : expansion.reason);

describe("[R01] compartments.ode polynomials: exact rationals", () => {
  it("reads a double's exact value from its bits", () => {
    expect(rationalOf(0)).toEqual({ num: 0n, den: 1n });
    expect(rationalOf(0.5)).toEqual({ num: 1n, den: 2n });
    expect(rationalOf(-3)).toEqual({ num: -3n, den: 1n });
    expect(rationalOf(2 ** 60)).toEqual({ num: 2n ** 60n, den: 1n });
    expect(rationalOf(0.1)).toEqual({ num: 3602879701896397n, den: 2n ** 55n });
    expect(rationalOf(5e-324)).toEqual({ num: 1n, den: 2n ** 1074n });
    expect(() => rationalOf(Infinity)).toThrow(RangeError);
  });
});

describe("[R01] compartments.ode polynomials: expansion (MODEL.md P1)", () => {
  it("combines like terms and cancels exactly", () => {
    expect(text(add(c("s"), c("s"), mul(n(2), c("s"))))).toBe("4 × s");
    expect(isZeroPolynomial(poly(sub(mul(p("beta"), c("s"), c("i")), mul(c("i"), p("beta"), c("s")))))).toBe(true);
    expect(isZeroPolynomial(poly(sub(pow(add(c("s"), c("i")), n(2)), add(pow(c("s"), n(2)), mul(n(2), c("s"), c("i")), pow(c("i"), n(2))))))).toBe(true);
    expect(text(mul(add(c("x"), n(1)), sub(c("x"), n(1))))).toBe("−1 + x^2");
  });

  it("orders a term's factors, compartments before parameters, and its terms by them", () => {
    expect(text(neg(mul(p("beta"), c("s"), c("i"))))).toBe("−i × s × beta");
    // Terms sort by their factors: i·s·beta comes before i·gamma, since s comes before any parameter.
    expect(text(sub(mul(p("gamma"), c("i")), mul(p("beta"), c("s"), c("i"))))).toBe("−i × s × beta + i × gamma");
  });

  it("is exact where doubles round: a term that does not cancel never reads as one that does", () => {
    // In doubles 1e16 + 1 − 1e16 is 0; exactly, it is 1.
    expect(text(sub(add(n(1e16), n(1)), n(1e16)))).toBe("1");
    expect(text(sub(add(n(0.1), n(0.2)), n(0.3)))).toBe(`1/${2n ** 55n}`);
    expect(isZeroPolynomial(poly(sub(mul(div(c("x"), n(3)), n(3)), c("x"))))).toBe(true);
    expect(text(div(c("x"), n(4)))).toBe("1/4 × x");
    expect(text(div(c("x"), n(-0.5)))).toBe("−2 × x");
  });

  it("says why an expression is not a polynomial", () => {
    expect(reason(expand(exp(c("x"))))).toBe("it uses exp");
    expect(reason(expand(mul(p("k"), log(c("x")))))).toBe("it uses log");
    expect(reason(expand(div(c("x"), p("capacity"))))).toBe("it divides by an expression that is not a number");
    expect(reason(expand(div(c("x"), n(0))))).toBe("it divides by zero");
    expect(reason(expand(pow(c("x"), n(0.5))))).toMatch(/power that is not a whole number/);
    expect(reason(expand(pow(c("x"), n(-1))))).toMatch(/power that is not a whole number/);
    expect(reason(expand(pow(c("x"), p("k"))))).toMatch(/power that is not a whole number/);
    expect(text(pow(c("x"), n(0)))).toBe("1");
  });

  it("abandons an expansion that grows too large, rather than hang or claim anything", () => {
    expect(reason(expand(pow(add(c("a"), c("b"), c("c"), c("d")), n(64))))).toMatch(/too large to expand/);
    expect(reason(expand(pow(c("x"), n(65))))).toMatch(/too large to expand/);
    expect(reason(expand(pow(pow(n(2), n(64)), n(64))))).toMatch(/too large to expand/);
    expect(text(pow(c("x"), n(64)))).toBe("x^64");
  });
});

describe("[R01] compartments.ode polynomials: arithmetic and derivatives", () => {
  it("adds and multiplies exactly", () => {
    const sum = addPolynomials(poly(c("s")), poly(neg(c("s"))));
    expect(sum.polynomial && isZeroPolynomial(sum.value)).toBe(true);
    const product = multiplyPolynomials(poly(add(c("s"), c("i"))), poly(sub(c("s"), c("i"))));
    expect(product.polynomial ? formatPolynomial(product.value) : product.reason).toBe("−i^2 + s^2");
  });

  it("differentiates by a symbol", () => {
    const of = (expr: Expr, id: string): string => {
      const derivative = differentiate(poly(expr), { kind: "c", id });
      return derivative.polynomial ? formatPolynomial(derivative.value) : derivative.reason;
    };
    expect(of(add(c("s"), mul(n(2), c("i")), mul(p("beta"), c("s"))), "s")).toBe("1 + beta");
    expect(of(pow(c("s"), n(3)), "s")).toBe("3 × s^2");
    expect(of(mul(c("s"), c("i")), "r")).toBe("0");
  });
});
