/**
 * attention.toy@1.0.0: one self-attention layer of a small transformer, deterministic in pure
 * TypeScript with its own exp, ln, sin, cos and square root (ADR-0054). Its oracles, written by hand
 * from the paper's definitions, are in test/attention.oracles.test.ts.
 */
export { attentionToy, AttentionParams, AttentionState, entropyOf, pathLengthOf, positionalEncoding, type AttentionObservables } from "./primitive.ts";
export { cos, exp, ln, orderFreeSum, pow2, sin, softmax, sqrt } from "./math.ts";
