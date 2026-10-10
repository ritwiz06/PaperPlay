/**
 * The town kit's pure half (ADR-0029): a compartment model's state as a town of figures. The
 * figures are a picture of the model's shares, not a second model: each stands for an equal
 * share of the people, coloured by the compartment it is counted in, and none of them meets,
 * infects or cures another. Where they walk is a pattern of the model's time alone. Presentation
 * only.
 */
import type { OrbitCamera } from "../../camera.ts";
import { frameCamera, type BaseEmphasis, type FrameDescription, type StageKit } from "../../frame.ts";
import type { Vec3 } from "../../vec.ts";
import { townDay, type TownPalette } from "./palettes.ts";

/** Figures in the town: each stands for one in this many of the people. */
export const FIGURES = 120;
/** The town's field, in world units: the stage frames it as it frames the valley's. */
export const TOWN_SIZE = 28;
/** How high a figure stands, in world units. */
export const FIGURE_HEIGHT = 1.2;
/** Houses stand round the plaza at this radius, and figures walk inside it. */
export const HOUSE_RADIUS = 12.5;
export const WALK_RADIUS = 10;
export const HOUSES = 9;
/** How far a figure strays from its home spot, and how many turns of its loop a unit of model time takes, at most. */
const STRAY = 1.8;
const PACE = 0.12;

/** What the stage draws a compartment model from: its shares now and a step ago, and the model's time. */
export interface TownInput {
  /** Each compartment's share of the whole, in the model's order, at the state before and the state now. */
  readonly previous: readonly number[];
  readonly current: readonly number[];
  readonly alpha: number;
  /** The model's time at the two states, in its own unit. */
  readonly timeBefore: number;
  readonly timeNow: number;
}

export interface FigurePose {
  /** World position, Y up; the town is centred on the origin. */
  readonly position: Vec3;
  /** Rotation about world Y, facing the way it walks. */
  readonly yaw: number;
  /** The compartment it is counted in, by its place in the model's order. */
  readonly compartment: number;
  readonly color: string;
  /** Whether it stands in a ring: the second compartment's figures, ill, so the cue is not colour alone. */
  readonly ring: boolean;
}

export interface HousePose {
  readonly position: Vec3;
  readonly yaw: number;
  readonly roof: string;
}

/** The town's look, apart from emphasis: none yet beyond its palette. */
export type TownLook = Readonly<Record<string, never>>;

export type TownFrame = FrameDescription<
  {
    readonly figures: readonly FigurePose[];
    /** How many figures each compartment has, in the model's order, none left out. */
    readonly counts: readonly number[];
    readonly houses: readonly HousePose[];
  },
  TownPalette
>;

/** A fixed hash, so the town and its figures' paths are the same on every load; the model never sees it. */
function hashed(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Walker {
  readonly home: readonly [number, number];
  readonly phase: number;
  readonly speed: number;
  readonly reach: number;
}

/** Each figure's home spot and loop, and the order figures are counted out in, fixed for every town. */
const WALKERS: readonly Walker[] = (() => {
  const random = hashed(0x70a7);
  return Array.from({ length: FIGURES }, () => {
    const angle = random() * 2 * Math.PI;
    const distance = Math.sqrt(random()) * WALK_RADIUS;
    return { home: [Math.cos(angle) * distance, Math.sin(angle) * distance] as const, phase: random() * 2 * Math.PI, speed: (0.5 + random() * 0.5) * PACE, reach: (0.4 + random() * 0.6) * STRAY };
  });
})();
const ORDER: readonly number[] = (() => {
  const random = hashed(0x0dde);
  const order = Array.from({ length: FIGURES }, (_, index) => index);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j] as number, order[i] as number];
  }
  return order;
})();

/**
 * How many of the figures each share comes to: by largest remainder, so they always add up to
 * FIGURES. A share below zero counts as none; with nothing at all, every figure is in the first.
 */
export function figureCounts(shares: readonly number[], figures = FIGURES): number[] {
  const clean = shares.map((share) => (Number.isFinite(share) && share > 0 ? share : 0));
  const total = clean.reduce((sum, share) => sum + share, 0);
  if (total <= 0) return clean.map((_, index) => (index === 0 ? figures : 0));
  const exact = clean.map((share) => (share / total) * figures);
  const counts = exact.map(Math.floor);
  let left = figures - counts.reduce((sum, count) => sum + count, 0);
  const byRemainder = exact.map((value, index) => ({ index, remainder: value - Math.floor(value) })).sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of byRemainder) {
    if (left <= 0) break;
    counts[index] = (counts[index] ?? 0) + 1;
    left--;
  }
  return counts;
}

/**
 * Which compartment each figure is counted in. Figures are counted out in one fixed order, the
 * last compartment's first, so as a run moves people from the first compartment to the last, as
 * an epidemic does, each figure only ever moves forward, never back.
 */
export function figureCompartments(counts: readonly number[]): number[] {
  const of = new Array<number>(FIGURES).fill(0);
  let at = 0;
  for (let compartment = counts.length - 1; compartment >= 0; compartment--) {
    for (let k = 0; k < (counts[compartment] ?? 0) && at < FIGURES; k++) of[ORDER[at++] as number] = compartment;
  }
  return of;
}

/** The houses round the plaza: where each stands, facing the middle, and its roof. */
function housesOf(palette: TownPalette): HousePose[] {
  return Array.from({ length: HOUSES }, (_, index) => {
    const angle = (index / HOUSES) * 2 * Math.PI + 0.2;
    const radius = HOUSE_RADIUS + (index % 2) * 0.6;
    return {
      position: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius] as Vec3,
      yaw: -angle - Math.PI / 2,
      roof: palette.roofs[index % palette.roofs.length] ?? palette.wall,
    };
  });
}

/** (shares, camera, palette, emphasis, look) → frame. Pure: reads its inputs, writes nothing. */
export function describeTown(input: TownInput, camera: OrbitCamera, palette: TownPalette, emphasis: BaseEmphasis = {}): TownFrame {
  const { previous, current, alpha } = input;
  const shares = current.map((share, index) => (previous[index] ?? share) + alpha * (share - (previous[index] ?? share)));
  const counts = figureCounts(shares);
  const compartments = figureCompartments(counts);
  const time = input.timeBefore + alpha * (input.timeNow - input.timeBefore);
  const figures = WALKERS.map((walker, index): FigurePose => {
    const turn = walker.phase + walker.speed * 2 * Math.PI * time;
    const x = walker.home[0] + walker.reach * Math.cos(turn);
    const z = walker.home[1] + walker.reach * Math.sin(turn);
    const compartment = compartments[index] ?? 0;
    return {
      position: [x, 0, z],
      // Facing along the loop, tangent to it.
      yaw: -turn,
      compartment,
      color: palette.figures[Math.min(compartment, palette.figures.length - 1)] ?? palette.wall,
      ring: compartment === 1,
    };
  });
  const rings = emphasis.cursor ? [{ key: "cursor", position: [emphasis.cursor.x - TOWN_SIZE / 2, 0, emphasis.cursor.y - TOWN_SIZE / 2] as Vec3, radius: 1.2, color: palette.cursor }] : [];
  return {
    camera: frameCamera(camera, camera.target ?? [0, FIGURE_HEIGHT / 2, 0]),
    field: { width: TOWN_SIZE, depth: TOWN_SIZE, altitude: FIGURE_HEIGHT },
    palette,
    figures,
    counts,
    houses: housesOf(palette),
    rings,
  };
}

/** The town kit's pure half, as the stage asks for it. */
export const townStage: StageKit<TownInput, BaseEmphasis, TownLook, TownFrame> = Object.freeze({
  id: "town",
  palette: townDay,
  defaultTarget: [0, FIGURE_HEIGHT / 2, 0] as Vec3,
  wraps: false,
  describe: (input: TownInput, camera: OrbitCamera, palette: TownPalette, emphasis?: BaseEmphasis) => describeTown(input, camera, palette, emphasis),
  extent: () => ({ width: TOWN_SIZE, height: TOWN_SIZE }),
  // The town holds still: there is no flock to follow.
  focus: () => null,
  lookName: () => "plain",
  marks: (frame: TownFrame) => ({ figuresByCompartment: frame.counts.join(" ") }),
});
