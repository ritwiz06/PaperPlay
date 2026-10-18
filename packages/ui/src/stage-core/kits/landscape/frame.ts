/**
 * The landscape kit's pure half (ADR-0047): an optimizer's run as a ball on its loss surface. The
 * surface is drawn as terrain, its height growing with the loss; the ball stands where the
 * optimizer stands after each step, and its trail shows where it has been. In a fork the other
 * world's ball is drawn on the same surface, so the two optimizers are compared where the learner
 * already looks. Presentation only: the surface's shape is read from the spec, and nothing here
 * steps or measures.
 */
import { portraitFit, viewAspect, type OrbitCamera } from "../../camera.ts";
import { mixHex } from "../../color.ts";
import { frameCamera, type BaseEmphasis, type FrameDescription, type StageKit } from "../../frame.ts";
import type { Vec3 } from "../../vec.ts";
import { landscapeDay, type LandscapePalette } from "./palettes.ts";

/** The surface's longer side, in world units: the stage frames it as it frames the town. */
export const LANDSCAPE_SIZE = 28;
/** The terrain's highest point, in world units. */
export const TERRAIN_HEIGHT = 5;
/** The terrain's grid: this many cells along its longer side. */
export const TERRAIN_CELLS = 64;
export const BALL_RADIUS = 0.45;
/** At most this many points of a trail are drawn, the latest kept. */
export const TRAIL_POINTS = 240;

/** The surface as the kit draws it: its shape and the part of the plane shown. */
export interface SurfaceShape {
  readonly hx: number;
  readonly hy: number;
  readonly cx: number;
  readonly cy: number;
  readonly gx: number;
  readonly gy: number;
  readonly extent: { readonly x: readonly [number, number]; readonly y: readonly [number, number] };
}

/** One optimizer on the surface: where it stood a step ago and now, and where it has been. */
export interface BallInput {
  /** This world's ball, or the What-if's. */
  readonly role: "here" | "there";
  readonly previous: readonly [number, number];
  readonly current: readonly [number, number];
  /** Its positions so far, oldest first, the current one last. */
  readonly trail: readonly (readonly [number, number])[];
}

/** What the stage draws a learning toy from. */
export interface LandscapeInput {
  readonly surface: SurfaceShape;
  readonly balls: readonly BallInput[];
  readonly alpha: number;
}

export interface BallPose {
  readonly role: "here" | "there";
  readonly position: Vec3;
  readonly color: string;
}

/** The terrain, a grid of heights and colours; its key changes only when its shape does, so it is built once. */
export interface TerrainShape {
  readonly key: string;
  readonly columns: number;
  readonly rows: number;
  readonly width: number;
  readonly depth: number;
  /** Row by row, from the far edge; each a world height. */
  readonly heights: readonly number[];
  readonly colors: readonly string[];
}

export type LandscapeFrame = FrameDescription<
  {
    readonly terrain: TerrainShape;
    readonly balls: readonly BallPose[];
    /** Each ball's trail, in world coordinates, a little above the terrain. */
    readonly trails: readonly { readonly role: "here" | "there"; readonly points: readonly Vec3[]; readonly color: string }[];
  },
  LandscapePalette
>;

const lossOf = (surface: SurfaceShape, x: number, y: number): number => 0.5 * surface.hx * (x - surface.cx) ** 2 + 0.5 * surface.hy * (y - surface.cy) ** 2 + surface.gx * x + surface.gy * y;

/** The scale from the plane to the world: the surface's longer side spans LANDSCAPE_SIZE. */
function scaleOf(surface: SurfaceShape): number {
  return LANDSCAPE_SIZE / Math.max(surface.extent.x[1] - surface.extent.x[0], surface.extent.y[1] - surface.extent.y[0]);
}

/**
 * The surface's height in the world: the square root of the loss's rise above the lowest drawn,
 * scaled to TERRAIN_HEIGHT at the highest. The square root keeps a steep wall and a gentle floor
 * both visible; the order of heights is the loss's, their spacing is not, and the kit says so.
 */
function heightOf(surface: SurfaceShape): (x: number, y: number) => number {
  const { x, y } = surface.extent;
  const corners = [lossOf(surface, x[0], y[0]), lossOf(surface, x[1], y[0]), lossOf(surface, x[0], y[1]), lossOf(surface, x[1], y[1])];
  const low = Math.min(lossOf(surface, Math.min(Math.max(surface.cx, x[0]), x[1]), Math.min(Math.max(surface.cy, y[0]), y[1])), ...corners);
  const high = Math.max(...corners);
  const span = Math.sqrt(Math.max(high - low, 1e-12));
  return (px, py) => (TERRAIN_HEIGHT * Math.sqrt(Math.max(lossOf(surface, px, py) - low, 0))) / span;
}

/** A point of the plane in the world: x across, the plane's y into the screen, the height up. */
function worldOf(surface: SurfaceShape): (x: number, y: number, lift?: number) => Vec3 {
  const scale = scaleOf(surface);
  const midX = (surface.extent.x[0] + surface.extent.x[1]) / 2;
  const midY = (surface.extent.y[0] + surface.extent.y[1]) / 2;
  const height = heightOf(surface);
  return (x, y, lift = 0) => {
    // A ball beyond the drawn surface stands at its edge, so it never leaves the stage.
    const cx = Math.min(Math.max(x, surface.extent.x[0]), surface.extent.x[1]);
    const cy = Math.min(Math.max(y, surface.extent.y[0]), surface.extent.y[1]);
    return [(cx - midX) * scale, height(cx, cy) + lift, (midY - cy) * scale];
  };
}

/** The terrain's grid, from the surface's shape alone. */
export function terrainOf(surface: SurfaceShape, palette: LandscapePalette): TerrainShape {
  const scale = scaleOf(surface);
  const width = (surface.extent.x[1] - surface.extent.x[0]) * scale;
  const depth = (surface.extent.y[1] - surface.extent.y[0]) * scale;
  const columns = Math.max(2, Math.round((TERRAIN_CELLS * width) / LANDSCAPE_SIZE));
  const rows = Math.max(2, Math.round((TERRAIN_CELLS * depth) / LANDSCAPE_SIZE));
  const height = heightOf(surface);
  const heights: number[] = [];
  const colors: string[] = [];
  for (let row = 0; row <= rows; row++) {
    const py = surface.extent.y[1] - (row / rows) * (surface.extent.y[1] - surface.extent.y[0]);
    for (let column = 0; column <= columns; column++) {
      const px = surface.extent.x[0] + (column / columns) * (surface.extent.x[1] - surface.extent.x[0]);
      const h = height(px, py);
      heights.push(h);
      colors.push(mixHex(palette.low, palette.high, h / TERRAIN_HEIGHT));
    }
  }
  return { key: `${JSON.stringify(surface)}|${palette.name}`, columns, rows, width, depth, heights, colors };
}

/** The share of a narrow screen's back-off the landscape takes back, as the town does. */
const PORTRAIT_TAKE_BACK = 0.25;
/** The surface is half as deep as the valley's field, so the camera stands a little closer. */
const CLOSER = 0.8;

/** How far the camera stands, for the landscape: closer than for a valley, and closer still on a narrow screen. Presentation only. */
export function landscapeCamera(camera: OrbitCamera): OrbitCamera {
  const backOff = portraitFit(viewAspect(camera));
  return { ...camera, distance: (camera.distance * CLOSER) / backOff ** PORTRAIT_TAKE_BACK };
}

/** Terrain grids by their key: built once per surface and palette, the same object every frame after. */
const TERRAINS = new Map<string, TerrainShape>();

/** (balls, camera, palette, emphasis) → frame. Pure, apart from reusing a terrain already built for the same surface. */
export function describeLandscape(input: LandscapeInput, camera: OrbitCamera, palette: LandscapePalette, emphasis: BaseEmphasis = {}): LandscapeFrame {
  const key = `${JSON.stringify(input.surface)}|${palette.name}`;
  const terrain = TERRAINS.get(key) ?? terrainOf(input.surface, palette);
  if (!TERRAINS.has(key)) {
    if (TERRAINS.size > 8) TERRAINS.clear();
    TERRAINS.set(key, terrain);
  }
  const world = worldOf(input.surface);
  const colorOf = (role: "here" | "there"): string => (role === "here" ? palette.here : palette.there);
  const balls = input.balls.map((ball): BallPose => {
    const x = ball.previous[0] + input.alpha * (ball.current[0] - ball.previous[0]);
    const y = ball.previous[1] + input.alpha * (ball.current[1] - ball.previous[1]);
    return { role: ball.role, position: world(x, y, BALL_RADIUS), color: colorOf(ball.role) };
  });
  const trails = input.balls.map((ball) => ({ role: ball.role, points: ball.trail.slice(-TRAIL_POINTS).map(([x, y]) => world(x, y, 0.08)), color: colorOf(ball.role) }));
  const rings = emphasis.cursor ? [{ key: "cursor", position: [emphasis.cursor.x - LANDSCAPE_SIZE / 2, 0.1, emphasis.cursor.y - LANDSCAPE_SIZE / 2] as Vec3, radius: 1.2, color: palette.cursor }] : [];
  return {
    camera: frameCamera(landscapeCamera(camera), camera.target ?? [0, TERRAIN_HEIGHT / 3, 0]),
    field: { width: terrain.width, depth: terrain.depth, altitude: TERRAIN_HEIGHT },
    palette,
    terrain,
    balls,
    trails,
    rings,
  };
}

/** The landscape kit's pure half, as the stage asks for it. */
export const landscapeStage: StageKit<LandscapeInput, BaseEmphasis, undefined, LandscapeFrame> = Object.freeze({
  id: "landscape",
  palette: landscapeDay,
  defaultTarget: [0, TERRAIN_HEIGHT / 3, 0] as Vec3,
  wraps: false,
  describe: (input: LandscapeInput, camera: OrbitCamera, palette: LandscapePalette, emphasis?: BaseEmphasis) => describeLandscape(input, camera, palette, emphasis),
  extent: (input: LandscapeInput) => {
    const scale = scaleOf(input.surface);
    return { width: (input.surface.extent.x[1] - input.surface.extent.x[0]) * scale, height: (input.surface.extent.y[1] - input.surface.extent.y[0]) * scale };
  },
  // The surface holds still: the whole of it is in view.
  focus: () => null,
  lookName: () => "plain",
  marks: (frame: LandscapeFrame) => ({ balls: frame.balls.map((ball) => `${ball.role}:${ball.position.map((value) => value.toFixed(2)).join(",")}`).join(" ") }),
});
