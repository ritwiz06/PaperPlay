// Transformer attention mechanism toy: multi-head self-attention over a small set of tokens.
// Implements the core Attention and MultiHead formulas from the paper, with softmax temperature
// as the learner-controllable parameter to explore attention spread vs sharpness.
// Plain JavaScript, no imports, chance only from mulberry32 seeded by init.

function generator(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NUM_TOKENS = 8;
const HIDDEN_DIM = 8;
const NUM_HEADS = 4;

const mechanism = {
  title: "Multi-head attention over tokens",
  kit: "towers",
  params: [
    { id: "temperature", label: "Softmax temperature", unit: "", min: 0.1, max: 4, default: 1 }
  ],
  measurements: [
    { id: "entropy", label: "Attention spread", unit: "bits", meaning: "Higher entropy means attention is more evenly spread across tokens." },
    { id: "maxWeight", label: "Peak attention weight", unit: "", meaning: "The largest attention weight assigned to a single token." }
  ],
  steps: 1,
  stepLabel: "iteration",
  init(seed, params) {
    const next = generator(seed);
    // Initialize token embeddings (Q, K, V) randomly per token
    const tokens = [];
    for (let i = 0; i < NUM_TOKENS; i++) {
      const q = [], k = [], v = [];
      for (let d = 0; d < HIDDEN_DIM; d++) {
        q.push(next() * 2 - 1);
        k.push(next() * 2 - 1);
        v.push(next() * 2 - 1);
      }
      tokens.push({ q, k, v, label: `t${i+1}` });
    }
    // Initialize projection matrices for multi-head (simplified: shared across heads)
    const W_O = [];
    for (let i = 0; i < HIDDEN_DIM; i++) {
      const row = [];
      for (let j = 0; j < HIDDEN_DIM; j++) row.push(next() * 0.1);
      W_O.push(row);
    }
    return { tokens, W_O, params, stepCount: 0, next };
  },
  step(state, params) {
    // One attention pass per step (steps=1, but step function required)
    const { tokens, W_O, params: oldParams, next } = state;
    const temperature = params.temperature;
    
    // Compute attention scores and weights for each head
    const headOutputs = [];
    for (let h = 0; h < NUM_HEADS; h++) {
      // Simplified: use same Q,K,V for all heads (paper uses projections, but we skip for toy)
      const scores = [];
      for (let i = 0; i < NUM_TOKENS; i++) {
        const row = [];
        for (let j = 0; j < NUM_TOKENS; j++) {
          // Dot product Q[i] · K[j]
          let dot = 0;
          for (let d = 0; d < HIDDEN_DIM; d++) dot += tokens[i].q[d] * tokens[j].k[d];
          row.push(dot / Math.sqrt(HIDDEN_DIM / NUM_HEADS)); // scale per head
        }
        scores.push(row);
      }
      
      // Softmax with temperature: softmax(x / T)
      const weights = [];
      for (let i = 0; i < NUM_TOKENS; i++) {
        const maxScore = Math.max(...scores[i]);
        const expScores = scores[i].map(s => Math.exp((s - maxScore) / temperature));
        const sumExp = expScores.reduce((a, b) => a + b, 0);
        weights.push(expScores.map(e => e / sumExp));
      }
      
      // Compute output for this head: weighted sum of V
      const headOut = [];
      for (let i = 0; i < HIDDEN_DIM; i++) headOut.push(0);
      for (let i = 0; i < NUM_TOKENS; i++) {
        for (let j = 0; j < NUM_TOKENS; j++) {
          for (let d = 0; d < HIDDEN_DIM; d++) {
            headOut[d] += weights[i][j] * tokens[j].v[d];
          }
        }
      }
      headOutputs.push(headOut);
    }
    
    // Concatenate heads and apply output projection W_O
    const output = [];
    for (let d = 0; d < HIDDEN_DIM; d++) {
      let sum = 0;
      for (let h = 0; h < NUM_HEADS; h++) {
        sum += headOutputs[h][d];
      }
      // Apply W_O (simplified: just scale)
      output.push(sum * 0.5);
    }
    
    // Update tokens with new values (simulating one layer) - use generator for noise
    const newTokens = tokens.map((t, i) => ({
      ...t,
      v: output.map(x => x + next() * 0.02 - 0.01) // small noise for visual variation
    }));
    
    return { tokens: newTokens, W_O, params, stepCount: state.stepCount + 1, next };
  },
  measure(state) {
    // Compute attention weights for first head (representative)
    const temperature = state.params.temperature;
    const tokens = state.tokens;
    
    // Recompute weights for measurement (same as in step)
    const scores = [];
    for (let i = 0; i < NUM_TOKENS; i++) {
      const row = [];
      for (let j = 0; j < NUM_TOKENS; j++) {
        let dot = 0;
        for (let d = 0; d < HIDDEN_DIM; d++) dot += tokens[i].q[d] * tokens[j].k[d];
        row.push(dot / Math.sqrt(HIDDEN_DIM / NUM_HEADS));
      }
      scores.push(row);
    }
    
    const weights = [];
    for (let i = 0; i < NUM_TOKENS; i++) {
      const maxScore = Math.max(...scores[i]);
      const expScores = scores[i].map(s => Math.exp((s - maxScore) / temperature));
      const sumExp = expScores.reduce((a, b) => a + b, 0);
      weights.push(expScores.map(e => e / sumExp));
    }
    
    // Compute entropy of attention distribution for first token (i=0)
    // H = -Σ p log2(p), handle p=0 as 0
    let entropy = 0;
    for (let j = 0; j < NUM_TOKENS; j++) {
      const p = weights[0][j];
      if (p > 0) entropy -= p * Math.log2(p);
    }
    
    // Max weight for first token
    const maxWeight = Math.max(...weights[0]);
    
    return { entropy, maxWeight };
  },
  frame(state) {
    // Visualize attention weights as beams between towers
    const temperature = state.params.temperature;
    const tokens = state.tokens;
    
    // Recompute weights for visualization
    const scores = [];
    for (let i = 0; i < NUM_TOKENS; i++) {
      const row = [];
      for (let j = 0; j < NUM_TOKENS; j++) {
        let dot = 0;
        for (let d = 0; d < HIDDEN_DIM; d++) dot += tokens[i].q[d] * tokens[j].k[d];
        row.push(dot / Math.sqrt(HIDDEN_DIM / NUM_HEADS));
      }
      scores.push(row);
    }
    
    const weights = [];
    for (let i = 0; i < NUM_TOKENS; i++) {
      const maxScore = Math.max(...scores[i]);
      const expScores = scores[i].map(s => Math.exp((s - maxScore) / temperature));
      const sumExp = expScores.reduce((a, b) => a + b, 0);
      weights.push(expScores.map(e => e / sumExp));
    }
    
    // Create towers with heights based on token values (simplified)
    const towers = [];
    for (let i = 0; i < NUM_TOKENS; i++) {
      const height = Math.abs(tokens[i].v[0] || 0.5);
      towers.push({ 
        label: tokens[i].label, 
        height: Math.min(1, Math.max(0.1, height)), 
        group: i % 6 
      });
    }
    
    // Create beams showing attention weights from first token to others
    const beams = [];
    for (let j = 0; j < NUM_TOKENS; j++) {
      if (j !== 0 && weights[0][j] > 0.05) {
        beams.push({
          from: 0,
          to: j,
          weight: weights[0][j],
          group: j % 6
        });
      }
    }
    
    return { towers, beams };
  }
};
