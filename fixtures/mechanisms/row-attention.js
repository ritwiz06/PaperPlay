// A hand-written mechanism module (ADR-0058), the reference the sandbox's tests run: one query at a
// time attends over a row of words by scaled dot products, the query moving one word along each
// step. Plain JavaScript, no imports, its randomness drawn from the seed alone.

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

function vectors(next, count, width) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const row = [];
    for (let d = 0; d < width; d += 1) row.push(next() * 2 - 1);
    rows.push(row);
  }
  return rows;
}

function weightsOf(state, params) {
  const query = state.queries[state.at];
  const scale = params.scaled >= 0.5 ? Math.sqrt(state.width) : 1;
  const scores = state.keys.map((key) => key.reduce((sum, value, d) => sum + value * query[d], 0) / scale);
  const top = Math.max(...scores);
  const exps = scores.map((score) => Math.exp(score - top));
  const total = exps.reduce((sum, value) => sum + value, 0);
  return exps.map((value) => value / total);
}

const mechanism = {
  title: "One query attending over a row of words",
  kit: "towers",
  params: [
    { id: "scaled", label: "Divide by the square root of the width", unit: "", min: 0, max: 1, default: 1, integer: true },
    { id: "width", label: "Width of each key", unit: "dimensions", min: 4, max: 64, default: 32, integer: true },
  ],
  measurements: [
    { id: "entropy", label: "Spread of attention", unit: "bits", meaning: "How evenly the query's attention spreads over the words: 0 when it all goes to one word." },
    { id: "peak", label: "Largest weight", unit: "", meaning: "The largest share of attention any one word gets." },
  ],
  steps: 48,
  stepLabel: "word",
  init(seed, params) {
    const next = generator(seed);
    const width = params.width;
    return { at: 0, width, keys: vectors(next, 8, width), queries: vectors(next, 8, width), scaled: params.scaled };
  },
  step(state, params) {
    return { ...state, at: (state.at + 1) % state.queries.length, scaled: params.scaled };
  },
  measure(state) {
    const weights = weightsOf(state, { scaled: state.scaled });
    const entropy = -weights.reduce((sum, w) => sum + (w > 0 ? w * Math.log2(w) : 0), 0);
    return { entropy, peak: Math.max(...weights) };
  },
  frame(state) {
    const weights = weightsOf(state, { scaled: state.scaled });
    return {
      towers: weights.map((weight, index) => ({ label: `word ${index + 1}`, height: weight, group: index === state.at ? 1 : 0 })),
      beams: weights.map((weight, index) => ({ from: state.at, to: index, weight })),
    };
  },
};
