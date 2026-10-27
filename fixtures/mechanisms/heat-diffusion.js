// A hand-written mechanism module (ADR-0058), the example the writer is shown for its shape: heat
// spreading over a square plate by the discrete heat equation, a few hot spots placed by the seed,
// the plate's edge losing heat to the air. Plain JavaScript, no imports, chance from the seed alone.

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

const SIZE = 32;

const mechanism = {
  title: "Heat spreading over a plate",
  kit: "grid",
  params: [
    { id: "diffusion", label: "How fast heat spreads", unit: "per step", min: 0.02, max: 0.24, default: 0.12 },
    { id: "cooling", label: "Heat lost at the edge", unit: "per step", min: 0, max: 0.2, default: 0.05 },
  ],
  measurements: [
    { id: "mean", label: "Average temperature", unit: "", meaning: "The plate's mean temperature, from 0 (cold) to 1 (the hot spots' start)." },
    { id: "hottest", label: "Hottest point", unit: "", meaning: "The temperature of the plate's hottest cell." },
  ],
  steps: 300,
  stepLabel: "step",
  init(seed, params) {
    const next = generator(seed);
    const cells = new Array(SIZE * SIZE).fill(0);
    // Three hot spots, each a small square at full temperature.
    for (let spot = 0; spot < 3; spot += 1) {
      const row = 4 + Math.floor(next() * (SIZE - 8));
      const col = 4 + Math.floor(next() * (SIZE - 8));
      for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) cells[(row + dr) * SIZE + col + dc] = 1;
    }
    return { cells, params };
  },
  step(state, params) {
    // Each cell moves toward its four neighbours' average (the discrete Laplacian, an explicit
    // Euler step, stable for diffusion up to 0.25); an edge cell also loses heat to the air.
    const old = state.cells;
    const cells = new Array(old.length);
    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        const here = old[row * SIZE + col];
        const at = (r, c) => (r < 0 || r >= SIZE || c < 0 || c >= SIZE ? here : old[r * SIZE + c]);
        const laplacian = at(row - 1, col) + at(row + 1, col) + at(row, col - 1) + at(row, col + 1) - 4 * here;
        const edge = row === 0 || col === 0 || row === SIZE - 1 || col === SIZE - 1;
        cells[row * SIZE + col] = Math.max(0, here + params.diffusion * laplacian - (edge ? params.cooling * here : 0));
      }
    }
    return { cells, params };
  },
  measure(state) {
    let total = 0;
    let hottest = 0;
    for (const value of state.cells) {
      total += value;
      if (value > hottest) hottest = value;
    }
    return { mean: total / state.cells.length, hottest };
  },
  frame(state) {
    return { rows: SIZE, cols: SIZE, cells: state.cells.map((value) => Math.min(1, value)) };
  },
};
