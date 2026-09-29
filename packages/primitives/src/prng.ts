export interface Prng {
  /** The next raw 32-bit output. */
  nextUint32(): number;
  /** The next value in [0, 1), exactly nextUint32() / 2^32. */
  next(): number;
}

/** Throws a RangeError unless `seed` is an integer in [0, 2^32 − 1]. */
export function assertSeed(seed: number): void {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError(`seed must be an unsigned 32-bit integer, got ${seed}`);
  }
}

/**
 * mulberry32 (Tommy Ettinger, public domain): a 32-bit state advanced with integer
 * operations only, so every JavaScript engine produces the same sequence.
 */
export function mulberry32(seed: number): Prng {
  assertSeed(seed);
  let state = seed >>> 0;
  const nextUint32 = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return (z ^ (z >>> 14)) >>> 0;
  };
  return { nextUint32, next: () => nextUint32() / 4294967296 };
}
