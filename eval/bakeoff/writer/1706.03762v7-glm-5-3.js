// "Attention Is All You Need" (Vaswani et al., 2017) — the Transformer. This toy keeps only the
// mechanism at the paper's heart: scaled dot-product attention (Eq. 1) run as multi-head
// self-attention (Eq. 2) over a short sequence of tokens, with sinusoidal positional encodings
// (Eq. 3) added to the token vectors. Each step is one attention layer: every token gathers
// information from the others, weighted by attention, blended in through a residual connection.
// The learner can move the paper's own knobs — the 1/sqrt(d_k) softmax scale, the number of
// heads h, the key size d_k, and the positional signal — and watch the attention pattern and
// the mixing rate respond. Section 3.2.2 of the paper discusses exactly these trade-offs.

const D = 64;      // d_model for the toy
const DMAX = 16;   // largest key size offered
const HMAX = 8;    // largest head count offered
const R = 2.3;     // every token vector is rescaled to this length (a stand-in for layer norm)
const WORDS = ["the", "cat", "sat", "on", "mat", "and", "dog", "ran", "fast", "big", "red", "sun", "sky", "old", "new", "map"];

// mulberry32, kept as a number in the state so chance survives between steps.
function rand(st) {
  st.rngA = (st.rngA + 0x6d2b79f5) >>> 0;
  let t = st.rngA;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Grow or trim the sequence when the learner changes its length; new tokens get fresh vectors.
function setLength(st, L) {
  const rows = [];
  for (let i = 0; i < Math.min(st.x.length, L); i += 1) rows.push(st.x[i]);
  while (rows.length < L) {
    const row = new Array(D);
    let n = 0;
    for (let d = 0; d < D; d += 1) { row[d] = rand(st) * 2 - 1; n += row[d] * row[d]; }
    const g = R / (Math.sqrt(n) || 1);
    for (let d = 0; d < D; d += 1) row[d] *= g;
    rows.push(row);
  }
  st.x = rows;
  st.L = L;
  const att = [];
  for (let j = 0; j < L; j += 1) att.push(j < st.attRow.length ? st.attRow[j] : 1 / L);
  st.attRow = att;
  st.query = st.stepIndex % L;
}

const mechanism = {
  title: "Multi-head self-attention: the engine of the Transformer",
  kit: "towers",
  params: [
    { id: "temperature", label: "Softmap sharpness (times 1/sqrt(dk))", unit: "", min: 0.1, max: 4, default: 1 },
    { id: "heads", label: "Attention heads (h)", unit: "", min: 1, max: 8, default: 8, integer: true },
    { id: "keyDim", label: "Key size dk", unit: "", min: 2, max: 16, default: 8, integer: true },
    { id: "posStrength", label: "Positional signal strength", unit: "", min: 0, max: 2, default: 1 },
    { id: "seqLen", label: "Tokens in the sequence", unit: "", min: 4, max: 16, default: 12, integer: true },
  ],
  measurements: [
    { id: "entropy", label: "Attention entropy", unit: "bits", meaning: "How spread the query token's attention is, from 0 (all on one token) up to log2 of the sequence length (evenly over all of them)." },
    { id: "peak", label: "Peak attention", unit: "", meaning: "The largest single attention weight the query token gives to any one token." },
    { id: "drift", label: "Representation drift", unit: "", meaning: "How much the token vectors moved in this layer, that is, how fast attention is mixing information across the sequence." },
  ],
  steps: 200,
  stepLabel: "layer",
  init(seed, params) {
    const st = { rngA: seed >>> 0, L: 0, x: [], wq: [], wk: [], query: 0, stepIndex: 0, drift: 0, attRow: [] };
    // Random per-head projections, standing in for the learned W^Q and W^K of Eq. 2.
    for (let h = 0; h < HMAX; h += 1) {
      const q = new Array(D * DMAX), k = new Array(D * DMAX);
      for (let i = 0; i < D * DMAX; i += 1) { q[i] = rand(st) * 2 - 1; k[i] = rand(st) * 2 - 1; }
      st.wq.push(q); st.wk.push(k);
    }
    setLength(st, Math.max(4, Math.min(16, Math.round(params.seqLen))));
    return st;
  },
  step(state, params) {
    const st = Object.assign({}, state);
    const heads = Math.max(1, Math.min(HMAX, Math.round(params.heads)));
    const dk = Math.max(2, Math.min(DMAX, Math.round(params.keyDim)));
    const temp = Math.max(0.1, params.temperature);
    const pos = Math.max(0, params.posStrength);
    if (Math.round(params.seqLen) !== st.L) setLength(st, Math.max(4, Math.min(16, Math.round(params.seqLen))));
    const L = st.L;

    // Embeddings with sinusoidal positional encodings added (the paper's Eq. 3).
    const e = new Array(L);
    for (let i = 0; i < L; i += 1) {
      const row = new Array(D), xr = st.x[i];
      for (let d = 0; d < D; d += 1) {
        const angle = i / Math.pow(10000, (2 * Math.floor(d / 2)) / D);
        row[d] = xr[d] + pos * (d % 2 === 0 ? Math.sin(angle) : Math.cos(angle));
      }
      e[i] = row;
    }

    // Multi-head attention (Eqs. 1 and 2): each head projects to keys and queries of size dk,
    // scores by the scaled dot product, softmaxes, and the heads' attention is averaged.
    const scale = temp / Math.sqrt(dk);
    const A = new Array(L);
    for (let i = 0; i < L; i += 1) A[i] = new Array(L).fill(0);
    for (let h = 0; h < heads; h += 1) {
      const wq = st.wq[h], wk = st.wk[h];
      const Q = [], K = [];
      for (let i = 0; i < L; i += 1) {
        const q = new Array(dk), k = new Array(dk);
        for (let t = 0; t < dk; t += 1) {
          let s1 = 0, s2 = 0;
          for (let d = 0; d < D; d += 1) { s1 += e[i][d] * wq[d * DMAX + t]; s2 += e[i][d] * wk[d * DMAX + t]; }
          q[t] = s1; k[t] = s2;
        }
        Q.push(q); K.push(k);
      }
      for (let i = 0; i < L; i += 1) {
        const logits = new Array(L);
        let top = -Infinity;
        for (let j = 0; j < L; j += 1) {
          let s = 0;
          for (let t = 0; t < dk; t += 1) s += Q[i][t] * K[j][t];
          logits[j] = s * scale;
          if (logits[j] > top) top = logits[j];
        }
        let z = 0;
        for (let j = 0; j < L; j += 1) { logits[j] = Math.exp(logits[j] - top); z += logits[j]; }
        for (let j = 0; j < L; j += 1) A[i][j] += logits[j] / z / heads;
      }
    }

    // One layer: each token's new vector is its attention-weighted sum of the others (the
    // embeddings serve as values), blended in through a residual connection and rescaled.
    const xnew = new Array(L);
    let drift = 0;
    for (let i = 0; i < L; i += 1) {
      const out = new Array(D).fill(0);
      for (let j = 0; j < L; j += 1) {
        const w = A[i][j];
        if (w < 1e-9) continue;
        const ej = e[j];
        for (let d = 0; d < D; d += 1) out[d] += w * ej[d];
      }
      const row = new Array(D);
      let norm = 0, moved = 0;
      for (let d = 0; d < D; d += 1) {
        const delta = 0.5 * (out[d] - st.x[i][d]);
        row[d] = st.x[i][d] + delta;
        norm += row[d] * row[d];
        moved += Math.abs(delta);
      }
      const g = R / (Math.sqrt(norm) || 1);
      for (let d = 0; d < D; d += 1) row[d] *= g;
      xnew[i] = row;
      drift += moved / D;
    }
    st.drift = drift / L;
    st.x = xnew;
    st.query = st.stepIndex % L;
    st.stepIndex += 1;
    st.attRow = A[st.query].slice();
    return st;
  },
  measure(state) {
    let entropy = 0, peak = 0;
    for (const p of state.attRow) {
      if (p > 1e-12) entropy -= p * Math.log2(p);
      if (p > peak) peak = p;
    }
    return { entropy, peak, drift: state.drift };
  },
  frame(state) {
    const L = st => st.L;
    const towers = [], beams = [];
    for (let j = 0; j < state.L; j += 1) {
      const w = state.attRow[j] || 0;
      // Tower height is the attention received, scaled so an even spread fills every tower.
      towers.push({ label: WORDS[j], height: Math.min(1, w * state.L), group: j === state.query ? 1 : 0 });
      if (j !== state.query && w > 0.01) beams.push({ from: state.query, to: j, weight: w, group: 0 });
    }
    return { towers, beams };
  },
};
