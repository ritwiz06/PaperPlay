/**
 * The arithmetic attention needs, built from +, −, ×, ÷ and exact bit operations alone (ADR-0054):
 * ECMAScript lets Math.exp, Math.log, Math.sin, Math.cos, Math.pow and ** differ in their last bits
 * between engines, and a softmax built on them could weigh two words differently on two browsers.
 * These follow fdlibm's reductions with Taylor polynomials long enough to stay within a few units in
 * the last place of the true value; what matters here is that every engine gives the same bits.
 */

const view = new DataView(new ArrayBuffer(8));

/** 2^k, exactly, built from its bits: k from −1074 to 1023, 0 below and Infinity above. */
export function pow2(k: number): number {
  if (k > 1023) return Number.POSITIVE_INFINITY;
  if (k < -1074) return 0;
  if (k < -1022) return pow2(k + 1022) * pow2(-1022);
  view.setUint32(0, (k + 1023) * 1048576);
  view.setUint32(4, 0);
  return view.getFloat64(0);
}

const factorials = (count: number): number[] => {
  const out = [1];
  for (let n = 1; n <= count; n++) out.push((out[n - 1] ?? 1) * n);
  return out;
};
/** 1/n! for n up to 20, each a correctly rounded division of exact integers. */
const INVERSE_FACTORIAL = factorials(20).map((value) => 1 / value);

// ln 2 split so that k × LN2_HI is exact for the k exp and ln meet (fdlibm's ln2_hi and ln2_lo).
const LN2_HI = 6.9314718036912381649e-1;
const LN2_LO = 1.9082149292705877e-10;
const INV_LN2 = 1.4426950408889634;
const SQRT2 = 1.4142135623730951;

/** e^x. */
export function exp(x: number): number {
  if (Number.isNaN(x)) return Number.NaN;
  if (x > 709.782712893384) return Number.POSITIVE_INFINITY;
  if (x < -745.1332191019412) return 0;
  // x = k ln 2 + r, |r| ≤ ln 2 / 2, then e^r by its series to the 14th power.
  const k = Math.round(x * INV_LN2);
  const r = x - k * LN2_HI - k * LN2_LO;
  let sum = INVERSE_FACTORIAL[14] ?? 0;
  for (let n = 13; n >= 0; n--) sum = sum * r + (INVERSE_FACTORIAL[n] ?? 0);
  return k > 1023 ? sum * pow2(k - 1) * 2 : k < -1022 ? sum * pow2(k + 54) * pow2(-54) : sum * pow2(k);
}

/** The natural logarithm. */
export function ln(x: number): number {
  if (Number.isNaN(x) || x < 0) return Number.NaN;
  if (x === 0) return Number.NEGATIVE_INFINITY;
  if (x === Number.POSITIVE_INFINITY) return x;
  view.setFloat64(0, x);
  const high = view.getUint32(0);
  let e = (high >>> 20) - 1023;
  // A subnormal x: scaled into the normal range first, exactly.
  if (e === -1023) return ln(x * pow2(54)) - 54 * LN2_HI - 54 * LN2_LO;
  view.setUint32(0, (high & 0x000fffff) | 0x3ff00000);
  let m = view.getFloat64(0);
  if (m > SQRT2) {
    m /= 2;
    e += 1;
  }
  // ln m = 2 atanh(s), s = (m − 1)/(m + 1), |s| ≤ 0.172: its odd series to the 23rd power.
  const s = (m - 1) / (m + 1);
  const s2 = s * s;
  let series = 0;
  for (let n = 23; n >= 1; n -= 2) series = series * s2 + 1 / n;
  return e * LN2_HI + (2 * s * series + e * LN2_LO);
}

// π/2 in three parts, for Cody and Waite's reduction (fdlibm's pio2_1, pio2_2, pio2_2t).
const PIO2_1 = 1.5707963267341256;
const PIO2_2 = 6.0771005063039660e-11;
const PIO2_2T = 2.0222662487959506e-21;
const INV_PIO2 = 6.3661977236758138e-1;

/** sin r and cos r for |r| ≤ π/4, by their series to the 19th and 20th powers. */
function kernel(r: number): { readonly sin: number; readonly cos: number } {
  const r2 = r * r;
  let sin = 0;
  for (let n = 19; n >= 3; n -= 2) sin = (sin + (n % 4 === 3 ? -1 : 1) * (INVERSE_FACTORIAL[n] ?? 0)) * r2;
  let cos = 0;
  for (let n = 20; n >= 2; n -= 2) cos = (cos + (n % 4 === 2 ? -1 : 1) * (INVERSE_FACTORIAL[n] ?? 0)) * r2;
  return { sin: r + r * sin, cos: 1 + cos };
}

function reduced(x: number): { readonly sin: number; readonly cos: number } {
  const k = Math.round(x * INV_PIO2);
  const { sin, cos } = kernel(x - k * PIO2_1 - k * PIO2_2 - k * PIO2_2T);
  const quadrant = ((k % 4) + 4) % 4;
  return quadrant === 0 ? { sin, cos } : quadrant === 1 ? { sin: cos, cos: -sin } : quadrant === 2 ? { sin: -sin, cos: -cos } : { sin: -cos, cos: sin };
}

/** sin x, for the moderate x a positional encoding needs (|x| up to about 10^5). */
export const sin = (x: number): number => (Number.isFinite(x) ? reduced(x).sin : Number.NaN);
/** cos x, likewise. */
export const cos = (x: number): number => (Number.isFinite(x) ? reduced(x).cos : Number.NaN);

/** √x by Newton's method from a guess halving x's exponent: six steps reach the double nearest. */
export function sqrt(x: number): number {
  if (Number.isNaN(x) || x < 0) return Number.NaN;
  if (x === 0 || x === Number.POSITIVE_INFINITY) return x;
  view.setFloat64(0, x);
  const e = ((view.getUint32(0) >>> 20) & 0x7ff) - 1023;
  let guess = pow2(Math.floor(e / 2));
  for (let step = 0; step < 8; step++) guess = (guess + x / guess) / 2;
  // Newton's last step can rest one unit off the root: take the neighbour whose exact square is closest.
  const miss = (candidate: number): number => {
    const [square, error] = exactSquare(candidate);
    return Math.abs(x - square - error);
  };
  return [below(guess), guess, above(guess)].reduce((best, candidate) => (miss(candidate) < miss(best) ? candidate : best));
}

/** a² as a pair of doubles whose sum is exact (Dekker, with Veltkamp's split), from + − × alone. */
function exactSquare(a: number): readonly [number, number] {
  const split = 134217729 * a;
  const high = split - (split - a);
  const low = a - high;
  const square = a * a;
  return [square, high * high - square + 2 * high * low + low * low];
}

/** The positive doubles either side of a positive, finite x, by a step of one in its bits. */
function step(x: number, by: 1 | -1): number {
  view.setFloat64(0, x);
  const high = view.getUint32(0);
  const low = view.getUint32(4);
  const next = low + by;
  view.setUint32(0, next > 0xffffffff ? high + 1 : next < 0 ? high - 1 : high);
  view.setUint32(4, next > 0xffffffff ? 0 : next < 0 ? 0xffffffff : next);
  return view.getFloat64(0);
}
const below = (x: number): number => step(x, -1);
const above = (x: number): number => step(x, 1);

/**
 * A sum that does not depend on the order of its terms: they are added smallest first. A softmax's
 * denominator and a weighted sum of values are sums over positions, so with this, shuffling the
 * input shuffles the output exactly, not merely to within rounding.
 */
export function orderFreeSum(terms: readonly number[]): number {
  const sorted = [...terms].sort((a, b) => a - b);
  let total = 0;
  for (const term of sorted) total += term;
  return total;
}

/** The softmax of a row, `masked` positions excluded and given weight exactly 0. */
export function softmax(row: readonly number[], masked: (index: number) => boolean = () => false): number[] {
  const open = row.map((_, index) => !masked(index));
  let max = Number.NEGATIVE_INFINITY;
  row.forEach((value, index) => {
    if (open[index] && value > max) max = value;
  });
  const exps = row.map((value, index) => (open[index] ? exp(value - max) : 0));
  const total = orderFreeSum(exps.filter((_, index) => open[index]));
  return exps.map((value, index) => (open[index] ? value / total : 0));
}
