import { flockDefaultParams, flockPlanarWeighted as flock } from "@paperplay/primitives/flock";
import { describe, expect, it } from "vitest";
import {
  coveredFraction,
  DEFAULT_CAMERA,
  describeFrame,
  fieldBoundsOnScreen,
  groundPointAt,
  largestFreeRect,
  projectToNdc,
  valleyDay,
  windowFromRect,
  withViewport,
  type Rect,
} from "../src/stage-core/index.ts";

const state = flock.init(flockDefaultParams, 4);
const input = { previous: state, current: state, alpha: 1, timestep: flock.fixedTimestep };
const inside = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x - 1e-6 && inner.y >= outer.y - 1e-6 && inner.x + inner.width <= outer.x + outer.width + 1e-6 && inner.y + inner.height <= outer.y + outer.height + 1e-6;

// HUD layouts like the shell's at rest: the top row, and the level card (bottom left on a
// desktop, across the bottom on a phone).
const LAYOUTS = [
  {
    name: "desktop 1440 × 900",
    viewport: { width: 1440, height: 900 },
    hud: [
      { x: 16, y: 16, width: 270, height: 66 },
      { x: 508, y: 16, width: 428, height: 52 },
      { x: 1196, y: 16, width: 228, height: 46 },
      { x: 16, y: 600, width: 460, height: 284 },
      { x: 16, y: 540, width: 48, height: 48 },
    ],
  },
  {
    name: "phone 390 × 844",
    viewport: { width: 390, height: 844 },
    hud: [
      { x: 10, y: 16, width: 210, height: 48 },
      { x: 278, y: 16, width: 102, height: 44 },
      { x: 70, y: 72, width: 250, height: 46 },
      { x: 10, y: 728, width: 370, height: 100 },
      { x: 10, y: 672, width: 48, height: 48 },
    ],
  },
] as const;

describe("the screen the HUD leaves free", () => {
  it("is the whole viewport when nothing covers it", () => {
    expect(largestFreeRect({ width: 800, height: 600 }, [])).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  it("never overlaps a HUD box, margins included", () => {
    for (const { viewport, hud } of LAYOUTS) {
      const free = largestFreeRect(viewport, hud, 12);
      for (const box of hud) {
        const apart =
          free.x + free.width <= box.x - 12 + 1e-9 ||
          free.x >= box.x + box.width + 12 - 1e-9 ||
          free.y + free.height <= box.y - 12 + 1e-9 ||
          free.y >= box.y + box.height + 12 - 1e-9;
        expect(apart, JSON.stringify({ free, box })).toBe(true);
      }
    }
  });

  it("takes the room beside a bottom-left card on a desktop, and the band between the bars on a phone", () => {
    const [desktop, phone] = LAYOUTS;
    const wide = largestFreeRect(desktop.viewport, desktop.hud, 12);
    expect(wide.x).toBeGreaterThan(476);
    expect(wide.height).toBeGreaterThan(700);
    const tall = largestFreeRect(phone.viewport, phone.hud, 12);
    expect(tall.y).toBeGreaterThanOrEqual(118);
    expect(tall.y + tall.height).toBeLessThanOrEqual(672);
  });

  it("measures how much of the screen boxes cover, counting overlaps once and ignoring what lies off screen", () => {
    expect(coveredFraction({ width: 100, height: 100 }, [])).toBe(0);
    expect(coveredFraction({ width: 100, height: 100 }, [{ x: 0, y: 0, width: 50, height: 100 }])).toBe(0.5);
    const overlapping = [
      { x: 0, y: 0, width: 50, height: 50 },
      { x: 25, y: 25, width: 50, height: 50 },
    ];
    expect(coveredFraction({ width: 100, height: 100 }, overlapping)).toBe(0.4375);
    expect(coveredFraction({ width: 100, height: 100 }, [{ x: 80, y: 80, width: 50, height: 50 }])).toBe(0.04);
  });
});

describe("the HUD-aware camera fit", () => {
  for (const { name, viewport, hud } of LAYOUTS) {
    it(`frames the whole flight field inside the free rectangle at ${name}`, () => {
      const free = largestFreeRect(viewport, hud, 12);
      const camera = { ...withViewport(DEFAULT_CAMERA, viewport.width, viewport.height), window: windowFromRect(viewport, free) };
      const frame = describeFrame(input, camera, valleyDay);
      const bounds = fieldBoundsOnScreen(frame, viewport);
      expect(inside(free, bounds), JSON.stringify({ free, bounds })).toBe(true);
      // And it uses the room: the field fills at least half the free rectangle's width or height.
      expect(Math.max(bounds.width / free.width, bounds.height / free.height)).toBeGreaterThan(0.5);
    });
  }

  it("keeps picking exact: a ground point projects into the window and unprojects back onto itself", () => {
    const { viewport, hud } = LAYOUTS[1];
    const camera = { ...withViewport(DEFAULT_CAMERA, viewport.width, viewport.height), window: windowFromRect(viewport, largestFreeRect(viewport, hud, 12)) };
    const frame = describeFrame(input, camera, valleyDay);
    for (const [x, y] of [[16, 16], [3, 28], [29, 5]] as const) {
      const [nx, ny] = projectToNdc(frame.camera.view, frame.camera.projection, [x - 16, 0, y - 16]);
      const back = groundPointAt(frame, [nx, ny]);
      expect(back?.x).toBeCloseTo(x, 9);
      expect(back?.y).toBeCloseTo(y, 9);
    }
  });

  it("is the old full-screen view when the window is the whole canvas, or missing, or empty", () => {
    const camera = withViewport(DEFAULT_CAMERA, 1440, 900);
    const plain = describeFrame(input, camera, valleyDay).camera;
    expect(describeFrame(input, { ...camera, window: windowFromRect({ width: 1440, height: 900 }, { x: 0, y: 0, width: 1440, height: 900 }) }, valleyDay).camera.projection).toEqual(plain.projection);
    expect(windowFromRect({ width: 1440, height: 900 }, null)).toEqual({ left: 0, top: 0, width: 1, height: 1 });
    expect(windowFromRect({ width: 1440, height: 900 }, { x: 10, y: 10, width: 0, height: 50 })).toEqual({ left: 0, top: 0, width: 1, height: 1 });
  });
});
