// A small simulation of the Transformer's multi-head attention mechanism, showing how attention weights
// are computed and how they change with temperature. The "towers" kit represents tokens, and beams
// represent attention weights between them. The simulation uses a fixed set of queries, keys, and values
// to demonstrate the attention pattern dynamics.

function generator(seed) {
  // mulberry32: a small seeded generator, the same numbers for the same seed.
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mechanism = {
  title: "Transformer multi-head attention",
  kit: "towers",
  params: [
    { id: "temperature", label: "Softmax temperature", unit: "", min: 0.1, max: 4, default: 1 },
    { id: "heads", label: "Number of heads", unit: "", min: 1, max: 4, default: 2, integer: true },
  ],
  measurements: [
    { id: "entropy", label: "Spread of attention", unit: "bits", meaning: "Entropy of the attention weights, measuring how spread out the attention is." },
    { id: "maxWeight", label: "Max attention weight", unit: "", meaning: "The highest attention weight in the current step." },
  ],
  steps: 200,
  stepLabel: "iteration",
  init(seed, params) {
    const next = generator(seed);
    // Create 8 tokens with random embeddings (queries, keys, values)
    const tokens = [];
    for (let i = 0; i < 8; i += 1) {
      tokens.push({
        q: [next(), next(), next(), next()], // query vector (d_model=4 for simplicity)
        k: [next(), next(), next(), next()], // key vector
        v: [next(), next(), next(), next()], // value vector
      });
    }
    return { tokens, params, next, step: 0 };
  },
  step(state, params) {
    const { tokens, next } = state;
    const d_k = 4; // dimension of keys (simplified)
    const heads = params.heads;
    const temperature = params.temperature;

    // Multi-head attention: split embeddings into heads and compute attention
    const newTokens = [];
    const attentionWeights = Array(8).fill().map(() => Array(8).fill(0));
    let totalEntropy = 0;
    let maxWeight = 0;

    for (let i = 0; i < 8; i += 1) {
      const headWeights = Array(heads).fill().map(() => Array(8).fill(0));
      const headEntropies = Array(heads).fill(0);

      for (let h = 0; h < heads; h += 1) {
        // Split embeddings for this head (simplified: just use different parts of the vector)
        const q = tokens[i].q[h % 4];
        const scores = [];

        // Compute attention scores for all tokens (Eq. 1)
        for (let j = 0; j < 8; j += 1) {
          const k = tokens[j].k[h % 4];
          // Dot product of query and key, scaled by sqrt(d_k)
          const score = (q * k) / Math.sqrt(d_k);
          scores.push(score);
        }

        // Softmax with temperature (Eq. 1)
        const maxScore = Math.max(...scores);
        const expScores = scores.map(s => Math.exp((s - maxScore) / temperature));
        const sumExp = expScores.reduce((a, b) => a + b, 0);
        const weights = expScores.map(s => s / sumExp);

        // Store weights and compute entropy for this head
        for (let j = 0; j < 8; j += 1) {
          headWeights[h][j] = weights[j];
          attentionWeights[i][j] += weights[j] / heads; // average across heads
          if (weights[j] > maxWeight) maxWeight = weights[j];
        }

        // Compute entropy for this head
        const entropy = -weights.reduce((sum, w) => sum + (w > 0 ? w * Math.log2(w) : 0), 0);
        headEntropies[h] = entropy;
      }

      // Average entropy across heads
      const avgEntropy = headEntropies.reduce((a, b) => a + b, 0) / heads;
      totalEntropy += avgEntropy;
    }

    // Update tokens by applying attention (simplified: just add small random changes)
    for (let i = 0; i < 8; i += 1) {
      newTokens.push({
        q: tokens[i].q.map(v => Math.max(0, Math.min(1, v + (next() - 0.5) * 0.05))),
        k: tokens[i].k.map(v => Math.max(0, Math.min(1, v + (next() - 0.5) * 0.05))),
        v: tokens[i].v.map(v => Math.max(0, Math.min(1, v + (next() - 0.5) * 0.05))),
      });
    }

    return {
      tokens: newTokens,
      params,
      next,
      step: state.step + 1,
      attentionWeights,
      entropy: totalEntropy / 8, // average entropy per token
      maxWeight,
    };
  },
  measure(state) {
    return {
      entropy: state.entropy,
      maxWeight: state.maxWeight,
    };
  },
  frame(state) {
    // Towers represent tokens, beams represent attention weights
    const towers = state.tokens.map((_, i) => ({
      label: `T${i + 1}`,
      height: 0.5 + 0.5 * Math.sin(state.step * 0.1 + i), // simple animation
      group: i % 5, // cycle through 5 colors
    }));

    const beams = [];
    // Show attention from each token to others (limit to top 2 for clarity)
    for (let i = 0; i < 8; i += 1) {
      const weights = state.attentionWeights[i];
      const sorted = weights
        .map((w, j) => ({ w, j }))
        .filter((_, idx) => idx !== i) // exclude self-attention for clarity
        .sort((a, b) => b.w - a.w)
        .slice(0, 2); // top 2 attention targets

      for (const { w, j } of sorted) {
        if (w > 0.1) { // only show significant attention
          beams.push({
            from: i,
            to: j,
            weight: w,
            group: i % 5,
          });
        }
      }
    }

    return { towers, beams };
  },
};
