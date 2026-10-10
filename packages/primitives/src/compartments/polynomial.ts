import type { Expr } from "@paperplay/contracts";

// Polynomial expansion, by MODEL.md P1. Coefficients are exact rationals over BigInt, because a
// symbolic proof must not rest on rounding: in doubles, 1e16 + 1 − 1e16 is 0, and a term that
// does not cancel would read as one that does.

/** An exact rational num/den: den > 0 and the two share no factor. Every finite double is one. */
export interface Rational {
  readonly num: bigint;
  readonly den: bigint;
}

/** A parameter or compartment, as a polynomial's variable. */
export interface PolySymbol {
  readonly kind: "p" | "c";
  readonly id: string;
}

export interface Factor {
  readonly symbol: PolySymbol;
  /** At least 1. */
  readonly power: number;
}

/** A coefficient times its factors, which are sorted with each symbol at most once. With no factors, a constant. */
export interface Term {
  readonly coefficient: Rational;
  readonly factors: readonly Factor[];
}

/** A sum of terms with like terms combined, none with a zero coefficient, in a fixed order. The zero polynomial has no terms. */
export interface Polynomial {
  readonly terms: readonly Term[];
}

export type Expansion = { readonly polynomial: true; readonly value: Polynomial } | { readonly polynomial: false; readonly reason: string };

/** P1's bounds: past them an expansion is abandoned as too large, and nothing is claimed for it. */
export const EXPANSION_LIMITS = Object.freeze({ terms: 4096, power: 64, coefficientBits: 4096 });
const COEFFICIENT_LIMIT = 1n << BigInt(EXPANSION_LIMITS.coefficientBits);

/** Thrown inside an expansion that passes EXPANSION_LIMITS, and caught at its top. */
class TooLarge extends Error {}

const abs = (value: bigint): bigint => (value < 0n ? -value : value);

function gcd(a: bigint, b: bigint): bigint {
  let [x, y] = [abs(a), abs(b)];
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

function rational(num: bigint, den: bigint): Rational {
  if (den === 0n) throw new RangeError("a rational number needs a non-zero denominator");
  const sign = den < 0n ? -1n : 1n;
  const divisor = gcd(num, den);
  const result = { num: (sign * num) / divisor, den: (sign * den) / divisor };
  if (abs(result.num) >= COEFFICIENT_LIMIT || result.den >= COEFFICIENT_LIMIT) throw new TooLarge();
  return result;
}

const ZERO: Rational = { num: 0n, den: 1n };
const ONE: Rational = { num: 1n, den: 1n };
const addRational = (a: Rational, b: Rational): Rational => rational(a.num * b.den + b.num * a.den, a.den * b.den);
const multiplyRational = (a: Rational, b: Rational): Rational => rational(a.num * b.num, a.den * b.den);

/** The exact value of a finite double, read from its bits: sign × mantissa × 2^exponent. */
export function rationalOf(value: number): Rational {
  if (!Number.isFinite(value)) throw new RangeError(`only a finite number is a rational, not ${value}`);
  if (value === 0) return ZERO;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const bits = view.getBigUint64(0);
  const sign = bits >> 63n === 1n ? -1n : 1n;
  const biased = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n);
  // A subnormal (biased exponent 0) has no hidden leading 1 and the smallest exponent.
  const mantissa = biased === 0 ? fraction : fraction | (1n << 52n);
  const exponent = (biased === 0 ? 1 : biased) - 1075;
  return exponent >= 0 ? rational(sign * (mantissa << BigInt(exponent)), 1n) : rational(sign * mantissa, 1n << BigInt(-exponent));
}

const symbolKey = (symbol: PolySymbol): string => `${symbol.kind}:${symbol.id}`;
const monomialKey = (factors: readonly Factor[]): string => factors.map((factor) => `${symbolKey(factor.symbol)}^${factor.power}`).join("·");

/** Terms by monomial key, while an expansion is under way. */
type Terms = Map<string, Term>;

function freeze(terms: Terms): Polynomial {
  const sorted = [...terms.entries()].filter(([, term]) => term.coefficient.num !== 0n).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return { terms: sorted.map(([, term]) => term) };
}

function termsOf(polynomial: Polynomial): Terms {
  return new Map(polynomial.terms.map((term) => [monomialKey(term.factors), term]));
}

function addInto(terms: Terms, term: Term): void {
  const key = monomialKey(term.factors);
  const existing = terms.get(key);
  terms.set(key, existing ? { coefficient: addRational(existing.coefficient, term.coefficient), factors: term.factors } : term);
  if (terms.size > EXPANSION_LIMITS.terms) throw new TooLarge();
}

function sum(a: Polynomial, b: Polynomial): Polynomial {
  const terms = termsOf(a);
  for (const term of b.terms) addInto(terms, term);
  return freeze(terms);
}

/** Merges two sorted factor lists, adding the powers of a symbol both hold. */
function mergeFactors(a: readonly Factor[], b: readonly Factor[]): Factor[] {
  const powers = new Map<string, Factor>();
  for (const factor of [...a, ...b]) {
    const key = symbolKey(factor.symbol);
    const power = (powers.get(key)?.power ?? 0) + factor.power;
    if (power > EXPANSION_LIMITS.power) throw new TooLarge();
    powers.set(key, { symbol: factor.symbol, power });
  }
  return [...powers.entries()].sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)).map(([, factor]) => factor);
}

function product(a: Polynomial, b: Polynomial): Polynomial {
  const terms: Terms = new Map();
  for (const left of a.terms) {
    for (const right of b.terms) addInto(terms, { coefficient: multiplyRational(left.coefficient, right.coefficient), factors: mergeFactors(left.factors, right.factors) });
  }
  return freeze(terms);
}

const scale = (polynomial: Polynomial, by: Rational): Polynomial =>
  freeze(new Map(polynomial.terms.map((term) => [monomialKey(term.factors), { coefficient: multiplyRational(term.coefficient, by), factors: term.factors }])));
const constant = (value: Rational): Polynomial => freeze(new Map([["", { coefficient: value, factors: [] }]]));
const variable = (symbol: PolySymbol): Polynomial => ({ terms: [{ coefficient: ONE, factors: [{ symbol, power: 1 }] }] });

/** Thrown inside an expansion that meets something P1 does not expand, with the reason in words. */
class NotPolynomial extends Error {}

function expandNode(expr: Expr): Polynomial {
  if ("n" in expr) return constant(rationalOf(expr.n));
  if ("p" in expr) return variable({ kind: "p", id: expr.p });
  if ("c" in expr) return variable({ kind: "c", id: expr.c });
  switch (expr.op) {
    case "add":
      return expr.args.map(expandNode).reduce(sum);
    case "mul":
      return expr.args.map(expandNode).reduce(product);
    case "sub":
      return sum(expandNode(expr.a), scale(expandNode(expr.b), { num: -1n, den: 1n }));
    case "neg":
      return scale(expandNode(expr.a), { num: -1n, den: 1n });
    case "div": {
      if (!("n" in expr.b)) throw new NotPolynomial("it divides by an expression that is not a number");
      if (expr.b.n === 0) throw new NotPolynomial("it divides by zero");
      const divisor = rationalOf(expr.b.n);
      return scale(expandNode(expr.a), rational(divisor.den, divisor.num));
    }
    case "pow": {
      const exponent = "n" in expr.b ? expr.b.n : undefined;
      if (exponent === undefined || !Number.isInteger(exponent) || exponent < 0) throw new NotPolynomial("it raises to a power that is not a whole number ≥ 0 written as a number");
      if (exponent > EXPANSION_LIMITS.power) throw new TooLarge();
      const base = expandNode(expr.a);
      let result = constant(ONE);
      for (let k = 0; k < exponent; k++) result = product(result, base);
      return result;
    }
    case "exp":
    case "log":
      throw new NotPolynomial(`it uses ${expr.op}`);
  }
}

const TOO_LARGE = `it is too large to expand (more than ${EXPANSION_LIMITS.terms} terms, a power above ${EXPANSION_LIMITS.power}, or a coefficient of ${EXPANSION_LIMITS.coefficientBits} bits)`;

/** Runs an expansion step, turning P1's two ways out into a reason. */
function attempt(work: () => Polynomial): Expansion {
  try {
    return { polynomial: true, value: work() };
  } catch (error) {
    if (error instanceof TooLarge) return { polynomial: false, reason: TOO_LARGE };
    if (error instanceof NotPolynomial) return { polynomial: false, reason: error.message };
    throw error;
  }
}

/** P1: the expression's expansion into a polynomial over its parameters and compartments, or why it is not one. */
export function expand(expr: Expr): Expansion {
  return attempt(() => expandNode(expr));
}

/** a + b, exactly; or, past EXPANSION_LIMITS, the reason it was abandoned. */
export const addPolynomials = (a: Polynomial, b: Polynomial): Expansion => attempt(() => sum(a, b));

/** a × b, exactly; or, past EXPANSION_LIMITS, the reason it was abandoned. */
export const multiplyPolynomials = (a: Polynomial, b: Polynomial): Expansion => attempt(() => product(a, b));

/** ∂polynomial/∂symbol, exactly: each term holding the symbol to the power k becomes k times it to the power k − 1. */
export const differentiate = (polynomial: Polynomial, symbol: PolySymbol): Expansion =>
  attempt(() => {
    const terms: Terms = new Map();
    for (const term of polynomial.terms) {
      const factor = term.factors.find((candidate) => symbolKey(candidate.symbol) === symbolKey(symbol));
      if (!factor) continue;
      const factors = term.factors.flatMap((other) => (other === factor ? (factor.power > 1 ? [{ symbol, power: factor.power - 1 }] : []) : [other]));
      addInto(terms, { coefficient: multiplyRational(term.coefficient, rational(BigInt(factor.power), 1n)), factors });
    }
    return freeze(terms);
  });

export const isZeroPolynomial = (polynomial: Polynomial): boolean => polynomial.terms.length === 0;

function formatRational(value: Rational): string {
  return value.den === 1n ? String(value.num) : `${value.num}/${value.den}`;
}

/** A polynomial in ordinary notation, for messages: "2 × beta × i × s", "0". Terms in their fixed order. */
export function formatPolynomial(polynomial: Polynomial): string {
  if (polynomial.terms.length === 0) return "0";
  return polynomial.terms
    .map((term, index) => {
      const negative = term.coefficient.num < 0n;
      const size: Rational = { num: abs(term.coefficient.num), den: term.coefficient.den };
      const factors = term.factors.map((factor) => (factor.power === 1 ? factor.symbol.id : `${factor.symbol.id}^${factor.power}`));
      const unit = size.num === 1n && size.den === 1n && factors.length > 0;
      const body = [...(unit ? [] : [formatRational(size)]), ...factors].join(" × ");
      return index === 0 ? `${negative ? "−" : ""}${body}` : `${negative ? "−" : "+"} ${body}`;
    })
    .join(" ");
}
