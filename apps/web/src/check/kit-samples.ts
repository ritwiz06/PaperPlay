/**
 * Hand-made frames, one for each generic scene kit (ADR-0058), for /check/kits. They are pictures
 * of what a generated mechanism's frames look like, not results: each is shaped by a formula
 * here and parsed against its kit, as a module's frames are, before it is drawn.
 */
import { parseFrame, type MechanismFrame, type MechanismKit } from "@paperplay/contracts";

export interface KitSample {
  readonly kit: MechanismKit;
  readonly title: string;
  /** What the sample shows, in a sentence. */
  readonly note: string;
  /** The canvas's words for a screen reader. */
  readonly label: string;
  readonly frame: unknown;
}

/** A small seeded generator, so the samples look the same on every load and in every screenshot. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);

const WORDS = ["the", "small", "brown", "fox", "jumped", "over", "lazy", "dogs"];
const HEAD_ONE = [0.08, 0.18, 1, 0.42, 0.06, 0.03, 0.05, 0.22];
const HEAD_TWO = [0.02, 0.04, 0.1, 0.16, 0.92, 0.38, 0.05, 0.12];

const towers = {
  towers: WORDS.map((label, index) => ({ label, height: 0.35 + 0.6 * Math.abs(Math.sin(index * 1.7 + 0.4)) })),
  beams: [...HEAD_ONE.map((weight, to) => ({ from: 3, to, weight, group: 0 })), ...HEAD_TWO.map((weight, to) => ({ from: 3, to, weight, group: 1 }))],
};

const grid = (() => {
  const [rows, cols] = [24, 24];
  const cells: number[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const blob = Math.exp(-((r - 10) ** 2 + (c - 13) ** 2) / (2 * 4.2 ** 2));
      const trail = 0.35 * Math.exp(-((r - 16) ** 2 + (c - 7) ** 2) / (2 * 3 ** 2));
      cells.push(clamp01(blob + trail));
    }
  }
  return { rows, cols, cells };
})();

const particles = (() => {
  const random = seeded(7);
  const flocks = [
    { x: 0.3, y: 0.3, heading: 0.5, spread: 0.17 },
    { x: 0.7, y: 0.6, heading: 2.6, spread: 0.16 },
    { x: 0.34, y: 0.76, heading: -0.9, spread: 0.13 },
  ];
  return {
    particles: Array.from({ length: 300 }, (_, index) => {
      const flock = flocks[index % 3] as (typeof flocks)[number];
      const angle = random() * Math.PI * 2;
      const distance = flock.spread * Math.sqrt(random());
      return {
        x: clamp01(flock.x + Math.cos(angle) * distance),
        y: clamp01(flock.y + Math.sin(angle) * distance),
        heading: flock.heading + (random() - 0.5) * 0.5,
        group: index % 3,
      };
    }),
  };
})();

const network = (() => {
  const labels = "ABCDEFGHIJKL".split("");
  const nodes = labels.map((label, index) => {
    const ring = index < 6 ? 0 : 1;
    const angle = ((index % 6) / 6) * Math.PI * 2 + ring * 0.5;
    const [cx, cy] = ring === 0 ? [0.27, 0.34] : [0.73, 0.66];
    return { x: clamp01(cx + Math.cos(angle) * 0.21), y: clamp01(cy + Math.sin(angle) * 0.21), value: ((index * 5) % 11) / 10, label, group: ring };
  });
  const edges = [
    ...[0, 1, 2, 3, 4, 5].map((index) => ({ from: index, to: (index + 1) % 6, weight: 0.3 + 0.1 * index })),
    ...[6, 7, 8, 9, 10, 11].map((index) => ({ from: index, to: 6 + ((index - 5) % 6), weight: 0.9 - 0.1 * (index - 6) })),
    { from: 0, to: 3, weight: 0.15 },
    { from: 7, to: 10, weight: 0.2 },
    { from: 2, to: 9, weight: 1 },
    { from: 4, to: 11, weight: 0.05 },
  ];
  return { nodes, edges };
})();

const landscape = (() => {
  const size = 32;
  const heights = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => {
      const [x, y] = [c / (size - 1), r / (size - 1)];
      const bowl = 1.6 * ((x - 0.58) ** 2 + 1.4 * (y - 0.46) ** 2);
      const ripple = 0.06 * Math.sin(x * 9) * Math.cos(y * 7);
      return clamp01(bowl + ripple + 0.05);
    }),
  );
  return {
    heights,
    marks: [
      { x: 0.12, y: 0.85, label: "start" },
      { x: 0.57, y: 0.47, label: "after 40 steps", group: 1 },
    ],
  };
})();

const charts = {
  bars: [
    { label: "baseline", value: 0.42 },
    { label: "dropout", value: 0.55 },
    { label: "wider", value: 0.61 },
    { label: "deeper", value: 0.73 },
    { label: "both", value: 0.88 },
  ],
};

export const KIT_SAMPLES: readonly KitSample[] = [
  { kit: "towers", title: "Towers and beams", note: "Eight words as towers; two heads' attention from the fourth word as arcs.", label: "Eight towers, one per word, with arcs from the word fox to every word, two colours for two heads.", frame: towers },
  { kit: "grid", title: "Grid", note: "A 24 by 24 grid of a spreading blob, as a heatmap.", label: "A 24 by 24 heatmap with one large bright blob and a fainter one below it.", frame: grid },
  { kit: "particles", title: "Particles", note: "Three hundred birds in three flocks, each with its heading.", label: "Three hundred dots in three flocks, each flock heading its own way.", frame: particles },
  { kit: "network", title: "Network", note: "Twelve nodes in two rings, joined by edges of different weights.", label: "Twelve labelled nodes in two rings of six, joined by edges of different weights.", frame: network },
  { kit: "landscape", title: "Landscape", note: "A 32 by 32 bowl, with where a run started and where it had reached.", label: "A bowl-shaped landscape with a ring at the start and a ring near the lowest point.", frame: landscape },
  { kit: "charts", title: "Charts", note: "Five bars, one for each variant.", label: "A bar chart of five bars rising from baseline to both.", frame: charts },
];

/** Each sample parsed as a module's frame is: the frame to draw, or what is wrong with it. */
export function parsedSample(sample: KitSample): { readonly frame: MechanismFrame } | { readonly problems: readonly string[] } {
  const parsed = parseFrame(sample.kit, sample.frame);
  return parsed.ok ? { frame: parsed.frame } : { problems: parsed.problems };
}
