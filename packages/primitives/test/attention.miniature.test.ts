import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { attentionToy, readWeights, WeightsManifest, type AttentionParams } from "../src/attention/index.ts";

// The miniature's trained weights (ADR-0057): the bytes training/train.py exported, run by
// attention.toy's TypeScript, against PyTorch's own outputs on 20 held-out inputs (check.json).

const root = join(import.meta.dirname, "..", "..", "..");
interface Check {
  readonly inputs: number[][];
  readonly weights: number[][][][];
  readonly scores: number[][][];
  readonly predictions: number[][];
}
const load = (name: string) => {
  const folder = join(root, "fixtures", "weights", name);
  const manifest = WeightsManifest.parse(JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8")));
  const bytes = new Uint8Array(readFileSync(join(folder, "weights.bin")));
  const check = JSON.parse(readFileSync(join(folder, "check.json"), "utf8")) as Check;
  return { manifest, bytes, weights: readWeights(bytes, manifest), check };
};
const MODELS = ["miniature-2-heads", "miniature-1-head"] as const;

/** The setting a trained miniature runs in: the task's eight digits, its weights, its width. */
export const miniatureParams = (name: (typeof MODELS)[number], tokens: readonly number[]): AttentionParams => {
  const { manifest, weights } = load(name);
  return { tokens: [...tokens], vocab: manifest.architecture.vocab, dModel: manifest.architecture.dModel, heads: manifest.architecture.heads, scaled: 1, positional: 1, causal: 0, recurrent: 0, weights, task: "previous-plus-mirror" };
};

/** Every number a forward pass gives, as the hex of its bits, hashed: the same string in Node and the browser. */
export const digestOf = (state: ReturnType<typeof attentionToy.init>): string => {
  const view = new DataView(new ArrayBuffer(8));
  const bits = [...state.output.flat(), ...state.heads.flatMap((head) => head.weights.flat()), ...state.scores.flat()]
    .map((value) => {
      view.setFloat64(0, value);
      return view.getBigUint64(0).toString(16).padStart(16, "0");
    })
    .join("");
  return createHash("sha256").update(bits).digest("hex");
};

/**
 * How closely PyTorch's float32 and the TypeScript's float64 must agree: attention weights, each in
 * [0, 1], within 1e-5; scores within 5e-5 of the largest score in their row, since float32's rounding
 * grows with the numbers it rounds (scores reach about 155). Measured on 2026-10-25: weights within
 * 2.6e-6, scores within 1.3e-5 of their row's largest, every answer the same, the narrowest winning
 * margin 3.3.
 */
export const WEIGHT_TOLERANCE = 1e-5;
export const SCORE_TOLERANCE = 5e-5;

describe("[R01] the miniature's trained weights (ADR-0057)", () => {
  it("are the bytes their manifests name, by sha256", () => {
    for (const name of MODELS) {
      const { manifest, bytes } = load(name);
      expect(createHash("sha256").update(bytes).digest("hex"), name).toBe(manifest.sha256);
    }
  });

  it(`run in attention.toy as in PyTorch on 20 held-out inputs: attention weights within ${WEIGHT_TOLERANCE}, scores within ${SCORE_TOLERANCE} of their row's largest, and the same answer at every position`, () => {
    for (const name of MODELS) {
      const { check } = load(name);
      check.inputs.forEach((tokens, at) => {
        const state = attentionToy.init(miniatureParams(name, tokens), 1);
        state.heads.forEach((head, h) => head.weights.forEach((row, i) => row.forEach((weight, j) => expect(Math.abs(weight - (check.weights[at]?.[h]?.[i]?.[j] ?? Number.NaN))).toBeLessThan(WEIGHT_TOLERANCE))));
        state.scores.forEach((row, i) => {
          const scale = Math.max(1, ...(check.scores[at]?.[i] ?? []).map(Math.abs));
          row.forEach((score, d) => expect(Math.abs(score - (check.scores[at]?.[i]?.[d] ?? Number.NaN))).toBeLessThan(SCORE_TOLERANCE * scale));
        });
        expect(state.predictions, `${name}, input ${at}`).toEqual(check.predictions[at]);
      });
    }
  });

  it("pins one held-out input's bits, [5, 4, 8, 6, 1, 7, 7, 0], which the browser must reproduce (tests/e2e/miniature.spec.ts)", () => {
    const { check } = load("miniature-2-heads");
    expect(check.inputs[0]).toEqual([5, 4, 8, 6, 1, 7, 7, 0]);
    expect(digestOf(attentionToy.init(miniatureParams("miniature-2-heads", check.inputs[0] ?? []), 1))).toBe("0793fcc704ad35c433e7b06e569b962bc2c0b52c33906170d4c77b8f12f91170");
  });

  it("scores each input's answers against the task", () => {
    const { check } = load("miniature-2-heads");
    const accuracies = check.inputs.map((tokens) => attentionToy.measure(attentionToy.init(miniatureParams("miniature-2-heads", tokens), 1)).accuracy);
    expect(accuracies.every((accuracy) => accuracy >= 0 && accuracy <= 1)).toBe(true);
  });
});
