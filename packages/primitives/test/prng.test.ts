import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { mulberry32 } from "../src/index.ts";

const KnownAnswers = z.strictObject({
  oracle: z.literal("oracle/1"),
  id: z.string(),
  basis: z.literal("derived"),
  kind: z.literal("known-answers"),
  claim: z.string(),
  derivation: z.array(z.string()).min(1),
  outputs: z.record(z.string(), z.array(z.int().min(0).max(0xffff_ffff)).min(1)),
});

const vectors = KnownAnswers.parse(
  JSON.parse(readFileSync(new URL("../../../fixtures/oracles/prng.mulberry32.json", import.meta.url), "utf8")),
);

describe("[R01] mulberry32", () => {
  for (const [seed, outputs] of Object.entries(vectors.outputs)) {
    it(`reproduces the reference outputs for seed ${seed}`, () => {
      const prng = mulberry32(Number(seed));
      expect(outputs.map(() => prng.nextUint32())).toEqual(outputs);
    });
  }

  it("maps each output into [0, 1) as output / 2^32", () => {
    const floats = mulberry32(42);
    const integers = mulberry32(42);
    for (let draw = 0; draw < 1000; draw++) {
      const u = floats.next();
      expect(u).toBe(integers.nextUint32() / 2 ** 32);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });

  it("rejects seeds that are not unsigned 32-bit integers", () => {
    for (const seed of [-1, 1.5, 2 ** 32, Number.NaN]) {
      expect(() => mulberry32(seed), String(seed)).toThrow(RangeError);
    }
  });
});
