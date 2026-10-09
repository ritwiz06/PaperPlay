/**
 * The screen around a HUD (ADR-0008): the largest rectangle the HUD leaves free, which the
 * stage frames the field in, and how much of the screen the HUD covers. Pixels, measured from
 * the top left. Presentation only.
 */
import { FIT_ASPECT, FULL_WINDOW, projectToNdc, type ViewWindow } from "./camera.ts";
import type { FrameDescription } from "./frame.ts";
import type { Vec3 } from "./vec.ts";

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

const clip = (value: number, size: number): number => Math.min(Math.max(value, 0), size);

/**
 * The largest rectangle that overlaps none of the boxes, each kept `margin` pixels away. Of
 * the candidates bounded by the screen's and the boxes' edges, it keeps the one the field
 * would look largest in: the field is FIT_ASPECT wide for each unit high, so a rectangle's
 * worth is min(height, width / FIT_ASPECT). Ties go to the larger area.
 */
export function largestFreeRect(screen: Size, boxes: readonly Rect[], margin = 0): Rect {
  const grown = boxes.map((box) => ({
    left: box.x - margin,
    top: box.y - margin,
    right: box.x + box.width + margin,
    bottom: box.y + box.height + margin,
  }));
  const xs = [...new Set([0, screen.width, ...grown.flatMap((box) => [clip(box.left, screen.width), clip(box.right, screen.width)])])].sort((a, b) => a - b);
  const ys = [...new Set([0, screen.height, ...grown.flatMap((box) => [clip(box.top, screen.height), clip(box.bottom, screen.height)])])].sort((a, b) => a - b);
  let best: Rect = { x: 0, y: 0, width: 0, height: 0 };
  let bestWorth = -1;
  let bestArea = -1;
  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      const [x0, x1] = [xs[i] as number, xs[j] as number];
      for (let k = 0; k < ys.length; k++) {
        for (let l = k + 1; l < ys.length; l++) {
          const [y0, y1] = [ys[k] as number, ys[l] as number];
          if (grown.some((box) => x0 < box.right && x1 > box.left && y0 < box.bottom && y1 > box.top)) continue;
          const [width, height] = [x1 - x0, y1 - y0];
          const worth = Math.min(height, width / FIT_ASPECT);
          const area = width * height;
          if (worth > bestWorth || (worth === bestWorth && area > bestArea)) {
            best = { x: x0, y: y0, width, height };
            bestWorth = worth;
            bestArea = area;
          }
        }
      }
    }
  }
  return best;
}

/** The share of the screen the boxes cover, counting overlaps once and ignoring what lies off screen. */
export function coveredFraction(screen: Size, boxes: readonly Rect[]): number {
  const clipped = boxes
    .map((box) => ({ left: clip(box.x, screen.width), right: clip(box.x + box.width, screen.width), top: clip(box.y, screen.height), bottom: clip(box.y + box.height, screen.height) }))
    .filter((box) => box.right > box.left && box.bottom > box.top);
  const xs = [...new Set(clipped.flatMap((box) => [box.left, box.right]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const [x0, x1] = [xs[i] as number, xs[i + 1] as number];
    const spans = clipped.filter((box) => box.left <= x0 && box.right >= x1).map((box) => [box.top, box.bottom] as const).sort((a, b) => a[0] - b[0]);
    let covered = 0;
    let reach = Number.NEGATIVE_INFINITY;
    for (const [top, bottom] of spans) {
      if (bottom <= reach) continue;
      covered += bottom - Math.max(top, reach);
      reach = bottom;
    }
    area += covered * (x1 - x0);
  }
  return area / (screen.width * screen.height);
}

/** The window a free rectangle makes on a canvas of this size; the whole canvas if the rectangle is empty. */
export function windowFromRect(screen: Size, rect: Rect | null | undefined): ViewWindow {
  if (!rect || rect.width <= 0 || rect.height <= 0 || screen.width <= 0 || screen.height <= 0) return FULL_WINDOW;
  const left = clip(rect.x, screen.width) / screen.width;
  const top = clip(rect.y, screen.height) / screen.height;
  const width = (clip(rect.x + rect.width, screen.width) - clip(rect.x, screen.width)) / screen.width;
  const height = (clip(rect.y + rect.height, screen.height) - clip(rect.y, screen.height)) / screen.height;
  return width > 0 && height > 0 ? { left, top, width, height } : FULL_WINDOW;
}

/** Where the flight field lands on a canvas of this size: the box around its corners on the ground and at flight height. */
export function fieldBoundsOnScreen(frame: FrameDescription, screen: Size): Rect {
  const { width, depth, altitude } = frame.field;
  const corners: Vec3[] = [-width / 2, width / 2].flatMap((x) => [-depth / 2, depth / 2].flatMap((z) => [[x, 0, z] as Vec3, [x, altitude, z] as Vec3]));
  const points = corners.map((corner) => {
    const [x, y] = projectToNdc(frame.camera.view, frame.camera.projection, corner);
    return [((x + 1) / 2) * screen.width, ((1 - y) / 2) * screen.height] as const;
  });
  const left = Math.min(...points.map(([x]) => x));
  const top = Math.min(...points.map(([, y]) => y));
  return { x: left, y: top, width: Math.max(...points.map(([x]) => x)) - left, height: Math.max(...points.map(([, y]) => y)) - top };
}
