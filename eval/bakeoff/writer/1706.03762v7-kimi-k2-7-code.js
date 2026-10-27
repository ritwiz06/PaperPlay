"use strict";

// A tiny, playable Transformer self-attention toy.
// It follows the equations in "Attention Is All You Need":
//   - Scaled Dot-Product Attention, Equation 1
//   - Multi-Head Attention, Equation 2
//   - Position-wise Feed-Forward Network, Equation 3
// Tokens are towers; attention weights are beams between them.

const TOKENS = 8;      // small sequence length
const D_MODEL = 8;     // toy model dimension

function mulberry32(a) {
  // A small seeded generator. The same seed gives the same sequence.
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalPair(next) {
  // Box-Muller transform for roughly Gaussian weights.
  const u1 = Math.max(1e-7, next());
  const u2 = next();
  const r = Math.sqrt(-2 * Math.log(u1));
  const t = 2 * Math.PI * u2;
  return [r * Math.cos(t), r * Math.sin(t)];
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i] * b[i];
  return s;
}

function matVec(M, v) {
  return M.map(row => dot(row, v));
}

function addVec(a, b) {
  return a.map((x, i) => x + b[i]);
}

function scaleVec(v, s) {
  return v.map(x => x * s);
}

function layerNorm(v) {
  // Layer normalization, as used after each Transformer sub-layer.
  const mean = v.reduce((x, y) => x + y, 0) / v.length;
  let variance = 0;
  for (const x of v) variance += (x - mean) * (x - mean);
  const invStd = 1 / Math.sqrt(variance / v.length + 1e-6);
  return v.map(x => (x - mean) * invStd);
}

function softmax(scores) {
  const max = Math.max(...scores);
  const exps = scores.map(s => Math.exp(Math.max(-80, s - max)));
  const sum = exps.reduce((x, y) => x + y, 0);
  return exps.map(e => e / sum);
}

function makeMatrices(seed, params) {
  // Deterministic projection matrices for every head and the FFN,
  // derived from the init seed and the current parameters.
  const localSeed = (seed + params.numHeads * 0x9e3779b9 + params.keyDim * 0x85ebca77) >>> 0;
  const next = mulberry32(localSeed);

  function randMatrix(rows, cols) {
    const M = [];
    for (let r = 0; r < rows; r += 1) {
      const row = [];
      for (let c = 0; c < cols; c += 2) {
        const [x, y] = normalPair(next);
        row.push(x / Math.sqrt(cols));
        if (c + 1 < cols) row.push(y / Math.sqrt(cols));
      }
      M.push(row);
    }
    return M;
  }

  function randVector(dim) {
    const v = [];
    for (let i = 0; i < dim; i += 2) {
      const [x, y] = normalPair(next);
      v.push(x);
      if (i + 1 < dim) v.push(y);
    }
    return v;
  }

  const heads = [];
  for (let h = 0; h < params.numHeads; h += 1) {
    heads.push({
      Wq: randMatrix(D_MODEL, params.keyDim),
      Wk: randMatrix(D_MODEL, params.keyDim),
      Wv: randMatrix(D_MODEL, D_MODEL),
    });
  }

  const ffn = {
    W1: randMatrix(params.ffInnerDim, D_MODEL),
    b1: randVector(params.ffInnerDim),
    W2: randMatrix(params.ffInnerDim, D_MODEL),
    b2: randVector(D_MODEL),
  };

  return { heads, ffn };
}

function attentionStep(x, matrices, params, rng) {
  // Multi-head self-attention: compute attention weights and weighted values.
  const N = x.length;
  const attention = Array.from({ length: N }, () => new Array(N).fill(0));
  const outputs = Array.from({ length: N }, () => new Array(D_MODEL).fill(0));

  for (let h = 0; h < params.numHeads; h += 1) {
    const head = matrices.heads[h];
    const q = x.map(tok => matVec(head.Wq, tok));
    const k = x.map(tok => matVec(head.Wk, tok));
    const v = x.map(tok => matVec(head.Wv, tok));

    for (let j = 0; j < N; j += 1) {
      const scores = [];
      let allDropped = true;
      for (let i = 0; i < N; i += 1) {
        let s = dot(q[j], k[i]) / Math.sqrt(params.keyDim);
        s /= params.temperature; // learner-facing softmax temperature
        if (rng.next() < params.dropout) {
          s = -1e9; // attention dropout, Section 5.4
        } else {
          allDropped = false;
        }
        scores.push(s);
      }
      if (allDropped) scores.fill(0);
      const weights = softmax(scores);
      for (let i = 0; i < N; i += 1) {
        attention[j][i] += weights[i] / params.numHeads;
        for (let c = 0; c < D_MODEL; c += 1) {
          outputs[j][c] += weights[i] * v[i][c] / params.numHeads;
        }
      }
    }
  }

  return { attention, outputs };
}

function ffnStep(x, ffn) {
  // Position-wise feed-forward network: ReLU(x W1 + b1) W2 + b2.
  return x.map(tok => {
    const hidden = ffn.b1.map((b, i) => Math.max(0, dot(ffn.W1[i], tok) + b));
    const out = new Array(D_MODEL).fill(0);
    for (let c = 0; c < D_MODEL; c += 1) {
      let s = ffn.b2[c];
      for (let h = 0; h < hidden.length; h += 1) s += ffn.W2[h][c] * hidden[h];
      out[c] = s;
    }
    return out;
  });
}

const mechanism = {
  title: "Transformer self-attention over tokens",
  kit: "towers",
  params: [
    { id: "temperature", label: "Softmax temperature", unit: "", min: 0.1, max: 4, default: 1 },
    { id: "numHeads", label: "Attention heads", unit: "heads", min: 1, max: 8, default: 8, integer: true },
    { id: "keyDim", label: "Key dimension", unit: "dims", min: 1, max: 8, default: 8, integer: true },
    { id: "dropout", label: "Attention dropout", unit: "", min: 0, max: 0.5, default: 0.1 },
    { id: "ffInnerDim", label: "FFN inner dimension", unit: "units", min: 2, max: 32, default: 16, integer: true },
  ],
  measurements: [
    { id: "entropy", label: "Attention entropy", unit: "bits", meaning: "Average uncertainty in the attention distribution over source tokens." },
    { id: "maxAttention", label: "Peak attention weight", unit: "", meaning: "Average largest attention weight per target token, showing how focused attention is." },
    { id: "activationRange", label: "Token activation range", unit: "", meaning: "Spread between the largest and smallest token vector norms after one Transformer layer." },
  ],
  steps: 200,
  stepLabel: "iteration",

  init(seed, params) {
    const s = seed >>> 0;
    const next = mulberry32(s);
    const tokens = [];
    for (let i = 0; i < TOKENS; i += 1) {
      const tok = [];
      for (let c = 0; c < D_MODEL; c += 1) tok.push(next() * 2 - 1);
      tokens.push(tok);
    }
    const rawNorms = tokens.map(v => Math.sqrt(v.reduce((sum, x) => sum + x * x, 0)));
    const attention = Array.from({ length: TOKENS }, () => new Array(TOKENS).fill(0));
    return { a: s, seed: s, tokens, rawNorms, attention };
  },

  step(state, params) {
    // Advance the RNG for dropout and keep its new state.
    let a = state.a;
    const rng = {
      next() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
    };

    const matrices = makeMatrices(state.seed, params);

    // Self-attention sub-layer with residual connection and layer norm.
    const attn = attentionStep(state.tokens, matrices, params, rng);
    let x = state.tokens.map((tok, j) => layerNorm(addVec(tok, attn.outputs[j])));

    // Feed-forward sub-layer with residual connection and layer norm.
    const f = ffnStep(x, matrices.ffn);
    const preNorm = x.map((tok, j) => addVec(tok, f[j]));
    const rawNorms = preNorm.map(v => Math.sqrt(v.reduce((sum, x) => sum + x * x, 0)));
    x = preNorm.map(v => layerNorm(v));

    return { a, seed: state.seed, tokens: x, rawNorms, attention: attn.attention };
  },

  measure(state) {
    const N = state.attention.length;
    let entropy = 0;
    let maxAttention = 0;
    for (let j = 0; j < N; j += 1) {
      const row = state.attention[j];
      let max = 0;
      let ent = 0;
      for (const w of row) {
        if (w > max) max = w;
        if (w > 0) ent -= w * Math.log2(w);
      }
      entropy += ent;
      maxAttention += max;
    }

    const normScale = Math.sqrt(D_MODEL);
    const minNorm = Math.min(...state.rawNorms);
    const maxNorm = Math.max(...state.rawNorms);

    return {
      entropy: entropy / N,
      maxAttention: maxAttention / N,
      activationRange: (maxNorm - minNorm) / normScale,
    };
  },

  frame(state) {
    const normScale = 2 * Math.sqrt(D_MODEL);
    const towers = state.tokens.map((tok, i) => {
      return {
        label: "token " + i,
        height: Math.min(1, state.rawNorms[i] / normScale),
        group: i % 6,
      };
    });

    const beams = [];
    for (let j = 0; j < state.attention.length; j += 1) {
      for (let i = 0; i < state.attention[j].length; i += 1) {
        const w = state.attention[j][i];
        if (w > 0.005) beams.push({ from: i, to: j, weight: w, group: 0 });
      }
    }

    return { towers, beams };
  },
};
