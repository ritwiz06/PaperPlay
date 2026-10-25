import { z } from "zod";
import { assertSeed, mulberry32 } from "../prng.ts";
import type { Primitive, PrimitiveDescription } from "../types.ts";
import { deepFreeze } from "../variables.ts";
import { cos, exp, ln, orderFreeSum, sin, softmax, sqrt } from "./math.ts";

/**
 * attention.toy@1.0.0 (ADR-0054): one self-attention layer of a small transformer, deterministic in
 * pure TypeScript. Each token's embedding, with a sinusoidal positional encoding that can be turned
 * off, is projected per head into queries, keys and values; each query's scaled dot products with
 * the keys, divided by √dk unless that is switched off and with future positions masked when the
 * causal mask is on, go through a softmax built on the primitive's own exp; the heads' weighted
 * values are joined and projected back. Its weights come from its seed until trained weights arrive
 * as data. It has no time: a step leaves the state as it was, and a level compares two settings.
 */

const bit = z.union([z.literal(0), z.literal(1)]);

export const AttentionParams = z
  .strictObject({
    /** The input, as token ids below `vocab`, such as the digits of "previous plus mirror". */
    tokens: z.array(z.int().min(0)).min(2).max(16),
    vocab: z.int().min(2).max(64),
    dModel: z.int().min(1).max(64),
    heads: z.int().min(1).max(8),
    /** 1: the dot products are divided by √dk, as the paper's §3.2.1; 0: they are not. */
    scaled: bit,
    /** 1: a sinusoidal positional encoding is added to each embedding (§3.5); 0: none. */
    positional: bit,
    /** 1: no position attends to a later one (§3.2.3). */
    causal: bit,
    /** 1: path length is counted as a recurrent layer's, |i − j|, the paper's Table 1; attention itself is unchanged. */
    recurrent: bit,
  })
  .refine((params) => params.dModel % params.heads === 0, { error: "dModel must divide into the heads evenly" })
  .refine((params) => params.tokens.every((token) => token < params.vocab), { error: "every token must be below vocab" });
export type AttentionParams = z.infer<typeof AttentionParams>;

const Matrix = z.array(z.array(z.number()));
export const AttentionState = z.strictObject({
  tokens: z.array(z.int()),
  /** Each position's input: its embedding, plus its positional encoding when that is on. */
  inputs: Matrix,
  heads: z.array(z.strictObject({ logits: Matrix, weights: Matrix })),
  output: Matrix,
  /** How far the output moves from the shuffled output when the input is reversed: 0 when attention cannot see order. */
  shuffleGap: z.number(),
  recurrent: bit,
  causal: bit,
});
export type AttentionState = z.infer<typeof AttentionState>;

export type AttentionObservables = Readonly<{ meanEntropy: number; logitSpread: number; futureWeight: number; maxWeight: number; meanPathLength: number; shuffleGap: number }>;

/** The weights a seed gives: each uniform in ±1/√dModel, drawn in a fixed order. */
interface Weights {
  readonly embedding: readonly (readonly number[])[];
  readonly heads: readonly { readonly q: readonly (readonly number[])[]; readonly k: readonly (readonly number[])[]; readonly v: readonly (readonly number[])[] }[];
  readonly out: readonly (readonly number[])[];
}

function weightsOf(params: AttentionParams, seed: number): Weights {
  const random = mulberry32(seed);
  const scale = 1 / sqrt(params.dModel);
  const matrix = (rows: number, columns: number): number[][] => Array.from({ length: rows }, () => Array.from({ length: columns }, () => (2 * random.next() - 1) * scale));
  const dk = params.dModel / params.heads;
  const embedding = matrix(params.vocab, params.dModel);
  const heads = Array.from({ length: params.heads }, () => ({ q: matrix(params.dModel, dk), k: matrix(params.dModel, dk), v: matrix(params.dModel, dk) }));
  return { embedding, heads, out: matrix(params.dModel, params.dModel) };
}

const LN_10000 = ln(10000);

/** The sinusoidal positional encoding of §3.5: sin and cos at wavelengths from 2π to 10000 × 2π. */
export function positionalEncoding(position: number, dModel: number): number[] {
  return Array.from({ length: dModel }, (_, index) => {
    const pair = Math.floor(index / 2);
    const angle = position * exp(-((2 * pair) / dModel) * LN_10000);
    return index % 2 === 0 ? sin(angle) : cos(angle);
  });
}

/** Rows times a matrix, each entry a dot product over the features, in their order. */
const times = (rows: readonly (readonly number[])[], matrix: readonly (readonly number[])[]): number[][] =>
  rows.map((row) => (matrix[0] ?? []).map((_, column) => row.reduce((sum, value, index) => sum + value * (matrix[index]?.[column] ?? 0), 0)));

/** One forward pass: the inputs, each head's logits and weights, and the output. */
function forward(params: AttentionParams, weights: Weights, tokens: readonly number[]) {
  const dk = params.dModel / params.heads;
  const divide = params.scaled === 1 ? sqrt(dk) : 1;
  const inputs = tokens.map((token, position) => {
    const embedded = weights.embedding[token] ?? [];
    if (params.positional === 0) return [...embedded];
    const encoding = positionalEncoding(position, params.dModel);
    return embedded.map((value, index) => value + (encoding[index] ?? 0));
  });
  const heads = weights.heads.map((head) => {
    const queries = times(inputs, head.q);
    const keys = times(inputs, head.k);
    const values = times(inputs, head.v);
    const logits = queries.map((query) => keys.map((key) => query.reduce((sum, value, index) => sum + value * (key[index] ?? 0), 0) / divide));
    const weightsOfRow = logits.map((row, i) => softmax(row, (j) => params.causal === 1 && j > i));
    // Each query's weighted values, summed over positions in an order that does not depend on theirs.
    const mixed = weightsOfRow.map((row) => Array.from({ length: dk }, (_, d) => orderFreeSum(row.map((weight, j) => weight * (values[j]?.[d] ?? 0)))));
    return { logits, weights: weightsOfRow, mixed };
  });
  const joined = tokens.map((_, position) => heads.flatMap((head) => head.mixed[position] ?? []));
  return { inputs, heads: heads.map(({ logits, weights: rows }) => ({ logits, weights: rows })), output: times(joined, weights.out) };
}

/** The entropy of one row of weights, in nats: 0 when it rests on one position, ln n when spread evenly. */
export function entropyOf(row: readonly number[]): number {
  return 0 - orderFreeSum(row.map((weight) => (weight > 0 ? weight * ln(weight) : 0)));
}

/** How many layers information needs to go from position `from` to `to`: 1 for attention, |from − to| for a recurrent layer, never under the causal mask when `from` is later. */
export function pathLengthOf(state: Pick<AttentionState, "recurrent" | "causal">, from: number, to: number): number {
  if (from === to) return 0;
  if (state.causal === 1 && from > to) return Number.POSITIVE_INFINITY;
  return state.recurrent === 1 ? Math.abs(from - to) : 1;
}

function init(params: AttentionParams, seed: number): AttentionState {
  assertSeed(seed);
  const parsed = AttentionParams.parse(params);
  const weights = weightsOf(parsed, seed);
  const pass = forward(parsed, weights, parsed.tokens);
  // The input reversed: where attention sees no order, its output is the output reversed, exactly.
  const reversed = forward(parsed, weights, [...parsed.tokens].reverse());
  const n = parsed.tokens.length;
  const shuffleGap = Math.max(...pass.output.flatMap((row, i) => row.map((value, d) => Math.abs((reversed.output[n - 1 - i]?.[d] ?? 0) - value))));
  return deepFreeze({ tokens: [...parsed.tokens], ...pass, shuffleGap, recurrent: parsed.recurrent, causal: parsed.causal });
}

const mean = (values: readonly number[]): number => (values.length === 0 ? 0 : orderFreeSum(values) / values.length);

function measure(state: AttentionState): AttentionObservables {
  const n = state.tokens.length;
  const rows = state.heads.flatMap((head) => head.weights);
  const pairs = Array.from({ length: n * n }, (_, index) => [Math.floor(index / n), index % n] as const).filter(([i, j]) => i !== j);
  const reachable = pairs.map(([i, j]) => pathLengthOf(state, j, i)).filter(Number.isFinite);
  return {
    meanEntropy: mean(rows.map(entropyOf)),
    // The spread of a row's logits, its highest less its lowest among the positions it may see.
    logitSpread: mean(state.heads.flatMap((head) => head.logits.map((row, i) => {
      const seen = row.filter((_, j) => !(state.causal === 1 && j > i));
      return Math.max(...seen) - Math.min(...seen);
    }))),
    futureWeight: mean(state.heads.map((head) => orderFreeSum(head.weights.flatMap((row, i) => row.filter((_, j) => j > i))) / n)),
    maxWeight: mean(rows.map((row) => Math.max(...row))),
    meanPathLength: mean(reachable),
    shuffleGap: state.shuffleGap,
  };
}

function describe(): PrimitiveDescription {
  const bitVariable = (meaning: string) => ({ unit: "on or off", meaning, range: [0, 1] as const, defaultValue: 1, phase: "init" as const, integer: true });
  return {
    variables: {
      vocab: { unit: "tokens", meaning: "How many different tokens there are", range: [2, 64], defaultValue: 10, phase: "init", integer: true },
      dModel: { unit: "numbers", meaning: "How many numbers describe each token", range: [1, 64], defaultValue: 16, phase: "init", integer: true },
      heads: { unit: "heads", meaning: "How many attention heads share those numbers", range: [1, 8], defaultValue: 2, phase: "init", integer: true },
      scaled: bitVariable("Whether the dot products are divided by the square root of each head's width"),
      positional: bitVariable("Whether each token is told its position"),
      causal: { ...bitVariable("Whether a token may attend only to itself and earlier tokens"), defaultValue: 0 },
      recurrent: { ...bitVariable("Whether path length is counted as a recurrent layer's"), defaultValue: 0 },
    },
    observables: {
      meanEntropy: { unit: "nats", meaning: "How evenly each token spreads its attention, averaged: 0 on one token, ln n evenly" },
      logitSpread: { unit: "logit", meaning: "The highest dot product less the lowest in each row, averaged" },
      futureWeight: { unit: "share", meaning: "The share of attention on later tokens" },
      maxWeight: { unit: "share", meaning: "The largest weight in each row, averaged" },
      meanPathLength: { unit: "layers", meaning: "How many layers information needs between two tokens, averaged over the pairs it can reach" },
      shuffleGap: { unit: "output", meaning: "How far the output for the reversed input is from the output reversed: 0 when attention cannot see order" },
    },
    assumptions: [
      "One self-attention layer; no feed-forward layer, residual or normalisation.",
      "Weights drawn from the seed, uniform in ±1/√dModel, until trained weights arrive as data.",
      "The miniature: the mechanism at toy scale, not the paper's model or its results.",
    ],
  };
}

const DEFAULTS: AttentionParams = { tokens: [3, 1, 4, 1, 5, 9, 2, 6], vocab: 10, dModel: 16, heads: 2, scaled: 1, positional: 1, causal: 0, recurrent: 0 };

export const attentionToy: Primitive<AttentionParams, AttentionState, AttentionObservables> & { readonly defaults: AttentionParams } = Object.freeze({
  id: "attention.toy",
  version: "1.0.0",
  family: "attention" as const,
  chance: true,
  fixedTimestep: 1,
  time: { unit: "second" as const, perWatchSecond: 1 },
  space: { kind: "none" as const },
  queries: {
    /** One head's weights, a row for each query position. */
    weights: (state: AttentionState, head: number) => state.heads[head]?.weights ?? [],
    rowEntropy: (state: AttentionState, head: number, row: number) => entropyOf(state.heads[head]?.weights[row] ?? []),
    pathLength: (state: AttentionState, from: number, to: number) => pathLengthOf(state, from, to),
    shuffleGap: (state: AttentionState) => state.shuffleGap,
  },
  paramSchema: AttentionParams,
  stateSchema: AttentionState,
  defaults: DEFAULTS,
  init,
  // No time passes in one layer's forward pass: a step leaves the state as it was.
  step: (state: AttentionState) => state,
  measure,
  describe,
});
