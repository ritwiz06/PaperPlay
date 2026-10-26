import { z } from "zod";

/**
 * Trained weights for attention.toy (ADR-0057), as training/train.py exports them: every tensor in
 * the primitive's layout, where a layer multiplies rows by a matrix on the right. The miniature is
 * one transformer block: the attention layer, a residual, a feed-forward layer and a readout.
 */
const Matrix = z.array(z.array(z.number()));
export const TrainedWeights = z.strictObject({
  embedding: Matrix,
  heads: z.array(z.strictObject({ q: Matrix, k: Matrix, v: Matrix })).min(1),
  out: Matrix,
  ff1: Matrix,
  ff1Bias: z.array(z.number()),
  ff2: Matrix,
  ff2Bias: z.array(z.number()),
  readout: Matrix,
  readoutBias: z.array(z.number()),
});
export type TrainedWeights = z.infer<typeof TrainedWeights>;

/** What manifest.json says of weights.bin: each tensor's name, shape and place, and the file's hash. */
export const WeightsManifest = z.object({
  schemaVersion: z.literal("weights/1"),
  name: z.string(),
  task: z.string(),
  architecture: z.object({ vocab: z.int(), length: z.int(), dModel: z.int(), dFF: z.int(), heads: z.int() }),
  dtype: z.literal("float32"),
  byteOrder: z.literal("little"),
  bytes: z.int(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  tensors: z.array(z.object({ name: z.string(), shape: z.array(z.int()), offset: z.int(), count: z.int() })),
});
export type WeightsManifest = z.infer<typeof WeightsManifest>;

/** The weights in weights.bin, each float32 read exactly into a double; a wrong size or shape is refused. */
export function readWeights(bytes: Uint8Array, manifest: WeightsManifest): TrainedWeights {
  if (bytes.byteLength !== manifest.bytes) throw new RangeError(`weights.bin holds ${bytes.byteLength} bytes; its manifest says ${manifest.bytes}`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tensor = (name: string): number[][] => {
    const entry = manifest.tensors.find((candidate) => candidate.name === name);
    if (!entry) throw new RangeError(`weights.bin has no tensor ${name}`);
    const [rows, columns] = entry.shape.length === 1 ? [1, entry.shape[0] ?? 0] : [entry.shape[0] ?? 0, entry.shape[1] ?? 0];
    if (rows * columns !== entry.count) throw new RangeError(`${name}'s shape does not hold its ${entry.count} values`);
    return Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, column) => view.getFloat32(entry.offset + 4 * (row * columns + column), true)));
  };
  const vector = (name: string): number[] => tensor(name)[0] ?? [];
  const { heads } = manifest.architecture;
  return {
    embedding: tensor("embedding"),
    heads: Array.from({ length: heads }, (_, head) => ({ q: tensor(`head${head}.q`), k: tensor(`head${head}.k`), v: tensor(`head${head}.v`) })),
    out: tensor("out"),
    ff1: tensor("ff1"),
    ff1Bias: vector("ff1.bias"),
    ff2: tensor("ff2"),
    ff2Bias: vector("ff2.bias"),
    readout: tensor("readout"),
    readoutBias: vector("readout.bias"),
  };
}

/** "Previous digit plus mirrored digit": at position i, (x[i − 1] + x[n − 1 − i]) mod 10, the digit before 0 the last. */
export function previousPlusMirror(tokens: readonly number[]): number[] {
  const n = tokens.length;
  return tokens.map((_, i) => ((tokens[(i - 1 + n) % n] ?? 0) + (tokens[n - 1 - i] ?? 0)) % 10);
}
