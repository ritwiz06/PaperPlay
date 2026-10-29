import type { ChartsFrame, GridFrame, LandscapeFrame, MechanismFrame, MechanismKit, NetworkFrame, ParticlesFrame, TowersFrame } from "@paperplay/contracts";
import { mixHex } from "../../stage-core/color.ts";
import { groupColour, GROUP_COLOURS, mechanismPalette as palette, rampIndex, rampTable, unit } from "./palette.ts";

// The generic scene kits a generated mechanism draws in (ADR-0058), on a 2D canvas. Each reads one
// frame and draws it; none computes, keeps or writes anything, so the drawing can never change what
// the mechanism measured (boundary 1). Every position and value arrives scaled to 0..1, and y grows
// downward, as a grid's and a landscape's rows do. Towers and a network shade their weights within
// each row's own range, as their legend says, so a nearly even row still shows its strongest.

/** The canvas's size in CSS pixels, and how many device pixels make one. */
export interface CanvasSize {
  readonly width: number;
  readonly height: number;
  readonly ratio: number;
}

/** The interface face, as `--font-interface` in fonts.css names it; a canvas cannot read the variable. */
export const MECHANISM_FONT_STACK = `"Fredoka", ui-rounded, system-ui, sans-serif`;

const HEAT = rampTable(palette.heat);
const TERRAIN = rampTable(palette.terrain);

/**
 * What a kit's brightness means, said under its drawing, for the kits that shade within a row:
 * towers, whose beams from one tower form a row, and a network, whose edges from one node do.
 */
const LEGENDS: Partial<Readonly<Record<MechanismKit, string>>> = {
  towers: "Brightness shows each tower's beams relative to that tower's own range, and the towers relative to one another.",
  network: "Brightness shows each node's edges relative to that node's own range.",
};

/** The words under a kit's drawing that say how it shades, or null for a kit whose shades are absolute. */
export function kitLegend(kit: MechanismKit): string | null {
  return LEGENDS[kit] ?? null;
}

/** A row whose weights differ by less than this is even: each of them is drawn at the middle. */
const EVEN_RANGE = 1e-6;

/**
 * Each weight's place within its own row, from 0 at the row's lowest to 1 at its highest, so the
 * strongest of 0.10, 0.11 and 0.12 is drawn as bright as the strongest of 0.1, 0.5 and 0.9. Only
 * brightness reads it: a height or a position is always drawn as given.
 */
export function relativeInRows<T>(items: readonly T[], rowOf: (item: T) => number, weightOf: (item: T) => number): number[] {
  const ranges = new Map<number, { low: number; high: number }>();
  for (const item of items) {
    const [row, weight] = [rowOf(item), unit(weightOf(item))];
    const range = ranges.get(row);
    if (!range) ranges.set(row, { low: weight, high: weight });
    else {
      range.low = Math.min(range.low, weight);
      range.high = Math.max(range.high, weight);
    }
  }
  return items.map((item) => {
    const range = ranges.get(rowOf(item));
    if (!range || range.high - range.low < EVEN_RANGE) return 0.5;
    return (unit(weightOf(item)) - range.low) / (range.high - range.low);
  });
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Draws one frame over the whole canvas: the ground first, then the frame's kit. */
export function drawMechanismFrame(context: CanvasRenderingContext2D, frame: MechanismFrame, size: CanvasSize): void {
  const ratio = Number.isFinite(size.ratio) && size.ratio > 0 ? size.ratio : 1;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.globalAlpha = 1;
  context.fillStyle = palette.ground;
  context.fillRect(0, 0, size.width, size.height);
  if (!(size.width > 0 && size.height > 0)) return;
  const sheet: Sheet = { context, width: size.width, height: size.height, ratio, box: contentBox(size.width, size.height), text: textSize(size.width) };
  context.save();
  switch (frame.kit) {
    case "particles":
      drawParticles(sheet, frame.frame);
      break;
    case "towers":
      drawTowers(sheet, frame.frame);
      break;
    case "grid":
      drawGrid(sheet, frame.frame);
      break;
    case "network":
      drawNetwork(sheet, frame.frame);
      break;
    case "landscape":
      drawLandscape(sheet, frame.frame);
      break;
    case "charts":
      drawCharts(sheet, frame.frame);
      break;
  }
  context.restore();
}

interface Sheet {
  readonly context: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly ratio: number;
  /** Where the drawing goes, inside the margins. */
  readonly box: Box;
  /** The labels' size in CSS pixels: never below 12, so a phone reads them. */
  readonly text: number;
}

const clamp = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), high);

function contentBox(width: number, height: number): Box {
  const margin = clamp(Math.min(width, height) * 0.06, 14, 44);
  return { x: margin, y: margin, w: Math.max(width - 2 * margin, 1), h: Math.max(height - 2 * margin, 1) };
}

function textSize(width: number): number {
  return width < 520 ? 12 : width < 1000 ? 13 : 14;
}

const font = (size: number, weight: 400 | 600 = 400): string => `${weight} ${size}px ${MECHANISM_FONT_STACK}`;

/** The largest square that fits the box, centred in it. */
function squareIn(box: Box): Box {
  const side = Math.min(box.w, box.h);
  return { x: box.x + (box.w - side) / 2, y: box.y + (box.h - side) / 2, w: side, h: side };
}

/** A label cut to a width, ending in an ellipsis when cut. */
function fit(context: CanvasRenderingContext2D, label: string, width: number): string {
  if (context.measureText(label).width <= width) return label;
  for (let length = label.length - 1; length > 0; length -= 1) {
    const cut = `${label.slice(0, length).trimEnd()}…`;
    if (context.measureText(cut).width <= width) return cut;
  }
  return "";
}

/** Words over anything: a cream halo first, then ink. */
function haloText(context: CanvasRenderingContext2D, label: string, x: number, y: number): void {
  context.lineJoin = "round";
  context.lineWidth = 3;
  context.strokeStyle = palette.halo;
  context.strokeText(label, x, y);
  context.fillStyle = palette.text;
  context.fillText(label, x, y);
}

function roundedField(context: CanvasRenderingContext2D, box: Box, radius: number): void {
  context.beginPath();
  context.roundRect(box.x, box.y, box.w, box.h, radius);
}

/** A field's ground: the unit square the frame's positions live in. */
function drawField(sheet: Sheet, field: Box): void {
  const { context } = sheet;
  roundedField(context, field, 12);
  context.fillStyle = palette.field;
  context.fill();
}

const byGroup = <T extends { readonly group?: number | undefined }>(items: readonly T[], fallback: string): Map<string, T[]> => {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const colour = groupColour(item.group, fallback);
    const list = groups.get(colour);
    if (list) list.push(item);
    else groups.set(colour, [item]);
  }
  return groups;
};

// Particles: a dot each, sized by `size`. A heading is a short tail behind the dot, as a comet's,
// so the dot reads as moving the way it heads; a tick ahead of it reads as moving backwards.

function drawParticles(sheet: Sheet, frame: ParticlesFrame): void {
  const { context } = sheet;
  const field = squareIn(sheet.box);
  drawField(sheet, field);
  const count = Math.max(frame.particles.length, 1);
  // Dots shrink as the field fills, so a crowd stays a crowd rather than a blot.
  const base = clamp((field.w / Math.sqrt(count)) * 0.11, 1.6, 6);
  const inset = base * 3;
  const at = (value: number, start: number, extent: number): number => start + inset + unit(value) * (extent - 2 * inset);
  for (const [colour, particles] of byGroup(frame.particles, GROUP_COLOURS[2])) {
    const dots: [number, number, number][] = [];
    const tails: [number, number, number, number][] = [];
    for (const particle of particles) {
      const x = at(particle.x, field.x, field.w);
      const y = at(particle.y, field.y, field.h);
      const radius = particle.size === undefined ? base : base * (0.55 + 0.9 * unit(particle.size));
      dots.push([x, y, radius]);
      if (particle.heading !== undefined && Number.isFinite(particle.heading)) {
        const length = radius * 2.8;
        tails.push([x, y, x - Math.cos(particle.heading) * length, y - Math.sin(particle.heading) * length]);
      }
    }
    // A group's tails go down first, lighter, so its dots sit on top of them.
    if (tails.length > 0) {
      context.beginPath();
      for (const [x0, y0, x1, y1] of tails) {
        context.moveTo(x0, y0);
        context.lineTo(x1, y1);
      }
      context.globalAlpha = 0.55;
      context.lineCap = "round";
      context.lineWidth = clamp(base * 0.6, 1, 2.6);
      context.strokeStyle = colour;
      context.stroke();
      context.globalAlpha = 1;
    }
    context.beginPath();
    for (const [x, y, radius] of dots) {
      context.moveTo(x + radius, y);
      context.arc(x, y, radius, 0, Math.PI * 2);
    }
    context.fillStyle = colour;
    context.fill();
  }
}

// Towers and beams, and the bar chart: a row of slots along a baseline, labelled underneath.

interface Row {
  readonly left: number;
  readonly slot: number;
  /** The baseline's y, and the y a height of 1 reaches. */
  readonly baseline: number;
  readonly top: number;
  readonly labels: LabelBand;
}

interface LabelBand {
  readonly mode: "none" | "flat" | "slanted";
  readonly height: number;
  /** Every how many slots a label is written; the rest are left out when they would collide. */
  readonly every: number;
  /** How long a slanted label may run. */
  readonly length: number;
}

const SLANT = Math.SQRT1_2;

function labelBand(sheet: Sheet, labels: readonly (string | undefined)[], slot: number, room: number): LabelBand {
  const { context, text } = sheet;
  context.font = font(text);
  const widest = Math.max(0, ...labels.map((label) => (label ? context.measureText(label).width : 0)));
  if (widest === 0) return { mode: "none", height: 0, every: 1, length: 0 };
  if (widest <= slot - 6) return { mode: "flat", height: text * 1.9, every: 1, length: slot - 6 };
  // Slanted at 45 degrees, labels sit slot × √½ apart; one in every few is written when that is too close.
  const every = Math.max(1, Math.ceil((text * 1.3) / (slot * SLANT)));
  const length = Math.min(widest, (room - text * 1.2) / SLANT);
  return { mode: "slanted", height: length * SLANT + text * 1.4, every, length };
}

function row(sheet: Sheet, labels: readonly (string | undefined)[], above: (slot: number) => number): Row {
  const { box } = sheet;
  const slot = box.w / Math.max(labels.length, 1);
  const band = labelBand(sheet, labels, slot, box.h * 0.3);
  const baseline = box.y + box.h - band.height;
  const top = box.y + Math.min(above(slot), (baseline - box.y) * 0.55);
  return { left: box.x, slot, baseline, top, labels: band };
}

function drawLabels(sheet: Sheet, layout: Row, labels: readonly (string | undefined)[]): void {
  const { context, text } = sheet;
  const band = layout.labels;
  if (band.mode === "none") return;
  context.font = font(text);
  context.fillStyle = palette.text;
  labels.forEach((label, index) => {
    if (!label || index % band.every !== 0) return;
    const centre = layout.left + (index + 0.5) * layout.slot;
    if (band.mode === "flat") {
      context.textAlign = "center";
      context.textBaseline = "top";
      context.fillText(fit(context, label, band.length), centre, layout.baseline + text * 0.55);
      return;
    }
    // The first slots have less room to their left than the band allows.
    const words = fit(context, label, Math.min(band.length, (centre - 2) / SLANT));
    context.save();
    context.translate(centre + text * 0.25, layout.baseline + text * 0.6);
    context.rotate(-Math.PI / 4);
    context.textAlign = "right";
    context.textBaseline = "middle";
    context.fillText(words, 0, 0);
    context.restore();
  });
}

function drawBaseline(sheet: Sheet, layout: Row, colour: string): void {
  const { context } = sheet;
  const y = Math.round(layout.baseline * sheet.ratio) / sheet.ratio + 0.5 / sheet.ratio;
  context.beginPath();
  context.moveTo(layout.left, y);
  context.lineTo(sheet.box.x + sheet.box.w, y);
  context.lineWidth = 1;
  context.strokeStyle = colour;
  context.stroke();
}

/** A bar from the baseline with rounded top corners and a square foot. */
function bar(context: CanvasRenderingContext2D, x: number, width: number, baseline: number, top: number, radius: number): void {
  const r = Math.max(0, Math.min(radius, width / 2, baseline - top));
  context.moveTo(x, baseline);
  context.lineTo(x, top + r);
  context.arcTo(x, top, x + r, top, r);
  context.lineTo(x + width - r, top);
  context.arcTo(x + width, top, x + width, top + r, r);
  context.lineTo(x + width, baseline);
  context.closePath();
}

/** Where a bar of a value stands in its slot: its left edge and its top. A height of 0 keeps a stub, so its slot still shows where it stands. */
function barAt(layout: Row, index: number, value: number, width: number): [x: number, top: number] {
  return [layout.left + (index + 0.5) * layout.slot - width / 2, layout.baseline - Math.max(unit(value) * (layout.baseline - layout.top), 2)];
}

/** Solid bars from the baseline, each its group's colour. */
function drawBars(sheet: Sheet, layout: Row, items: readonly { readonly value: number; readonly group?: number | undefined }[], width: number, fallback: string): void {
  const { context } = sheet;
  const indexed = items.map((item, index) => ({ ...item, index }));
  for (const [colour, bars] of byGroup(indexed, fallback)) {
    context.beginPath();
    for (const item of bars) {
      const [x, top] = barAt(layout, item.index, item.value, width);
      bar(context, x, width, layout.baseline, top, Math.min(6, width / 3));
    }
    context.fillStyle = colour;
    context.fill();
  }
}

/** A tower's tint of its colour, mixed toward the ground: palest for the shortest tower, deepest for the tallest. */
const TOWER_TINT = { palest: 0.86, deepest: 0.4 } as const;

/**
 * Towers from the baseline, each a tint of its group's colour under a cap of the full colour, so
 * the beams above stay the loudest thing drawn and the cap alone shows the height at 3:1. A
 * tower's height is drawn as given; only its tint is relative, deeper the taller it stands among
 * the frame's towers, so towers of nearly equal height still tell apart.
 */
function drawTowerBars(sheet: Sheet, layout: Row, towers: TowersFrame["towers"], width: number): void {
  const { context } = sheet;
  const cap = clamp(width * 0.12, 3, 5);
  const shades = relativeInRows(towers, () => 0, (tower) => tower.height);
  towers.forEach((tower, index) => {
    const colour = groupColour(tower.group, palette.tower);
    const [x, top] = barAt(layout, index, tower.height, width);
    context.beginPath();
    bar(context, x, width, layout.baseline, top, Math.min(6, width / 3));
    context.fillStyle = mixHex(colour, palette.ground, TOWER_TINT.palest - (TOWER_TINT.palest - TOWER_TINT.deepest) * (shades[index] ?? 0.5));
    context.fill();
    context.save();
    context.clip();
    context.fillStyle = colour;
    context.fillRect(x, top, width, cap);
    context.restore();
  });
}

function drawTowers(sheet: Sheet, frame: TowersFrame): void {
  const { context } = sheet;
  const count = frame.towers.length;
  // The beams from one tower are its row: each beam's strength is its place within that row's range.
  const joined = frame.beams.filter((beam) => beam.from < count && beam.to < count);
  const strengths = relativeInRows(joined, (beam) => beam.from, (beam) => beam.weight);
  const valid = joined.map((beam, index) => ({ ...beam, strength: strengths[index] ?? 0.5 })).filter((beam) => beam.weight > 0);
  const widestSpan = Math.max(0, ...valid.map((beam) => Math.abs(beam.from - beam.to)));
  // Room above the tallest tower for the widest beam's arc, or for a beam's loop back to its own tower.
  const layout = row(
    sheet,
    frame.towers.map((tower) => tower.label),
    (slot) => (valid.length === 0 ? 0 : Math.max(widestSpan * slot * 0.34, slot * 0.7, 18) + 6),
  );
  const width = Math.min(layout.slot * 0.62, 56);
  const span = layout.baseline - layout.top;
  const topOf = (index: number): number => layout.baseline - Math.max(unit(frame.towers[index]?.height ?? 0) * span, 2);
  const centre = (index: number): number => layout.left + (index + 0.5) * layout.slot;
  const arcRoom = layout.top - sheet.box.y;

  drawBaseline(sheet, layout, palette.rule);
  drawTowerBars(sheet, layout, frame.towers, width);

  // Beams, faintest first so the strongest lie on top; each one's strength in its row is its width and its opacity.
  const scale = clamp(layout.slot / 48, 0.6, 1.25);
  const order = [...valid].sort((a, b) => a.strength - b.strength);
  context.lineCap = "round";
  for (const beam of order) {
    context.globalAlpha = 0.1 + 0.8 * beam.strength;
    context.lineWidth = (0.7 + 3.3 * beam.strength) * scale;
    context.strokeStyle = groupColour(beam.group, GROUP_COLOURS[0]);
    context.beginPath();
    const [x0, x1] = [centre(beam.from), centre(beam.to)];
    const [y0, y1] = [topOf(beam.from) - 3, topOf(beam.to) - 3];
    if (beam.from === beam.to) {
      const radius = clamp(layout.slot * 0.28, 4, 14);
      context.arc(x0, y0 - radius, radius, Math.PI / 2, Math.PI / 2 + Math.PI * 2);
    } else {
      // The arc clears every tower it passes over, and rises with the distance it spans.
      const [low, high] = beam.from < beam.to ? [beam.from, beam.to] : [beam.to, beam.from];
      let highest = Math.min(y0, y1);
      for (let index = low + 1; index < high; index += 1) highest = Math.min(highest, topOf(index) - 3);
      const lift = Math.min(Math.abs(x1 - x0) * 0.34, arcRoom - 4) + Math.min(6, arcRoom * 0.1);
      const peak = Math.max(highest - lift, sheet.box.y + 2);
      const control = (8 * peak - y0 - y1) / 6;
      context.moveTo(x0, y0);
      context.bezierCurveTo(x0, control, x1, control, x1, y1);
    }
    context.stroke();
  }
  context.globalAlpha = 1;
  drawLabels(sheet, layout, frame.towers.map((tower) => tower.label));
}

function drawCharts(sheet: Sheet, frame: ChartsFrame): void {
  const { context } = sheet;
  const labels = frame.bars.map((item) => item.label);
  const layout = row(sheet, labels, () => sheet.text * 0.5);
  const span = layout.baseline - layout.top;
  const right = layout.left + layout.slot * frame.bars.length;
  // Quiet guides at each quarter; the values are the module's own scale, so no numbers are written.
  context.beginPath();
  for (const quarter of [0.25, 0.5, 0.75, 1]) {
    const y = Math.round((layout.baseline - quarter * span) * sheet.ratio) / sheet.ratio + 0.5 / sheet.ratio;
    context.moveTo(layout.left, y);
    context.lineTo(right, y);
  }
  context.lineWidth = 1;
  context.strokeStyle = palette.rule;
  context.stroke();
  drawBars(sheet, layout, frame.bars, Math.min(layout.slot * 0.6, 64), GROUP_COLOURS[0]);
  drawBaseline(sheet, layout, palette.quiet);
  drawLabels(sheet, layout, labels);
}

// Grid: a heatmap of square cells, cream through aqua to deep teal.

function drawGrid(sheet: Sheet, frame: GridFrame): void {
  const { context, box, ratio } = sheet;
  const { rows, cols } = frame;
  if (rows < 1 || cols < 1) return;
  const cell = Math.min(box.w / cols, box.h / rows);
  const [width, height] = [cell * cols, cell * rows];
  const [x0, y0] = [box.x + (box.w - width) / 2, box.y + (box.h - height) / 2];
  // Cell edges on device pixels, so neighbouring cells meet without a seam.
  const snap = (value: number): number => Math.round(value * ratio) / ratio;
  const gap = cell >= 14 ? 1 : 0;
  const shades = new Map<number, [number, number, number, number][]>();
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const shade = rampIndex(frame.cells[r * cols + c] ?? 0);
      const [left, top] = [snap(x0 + c * cell), snap(y0 + r * cell)];
      const rect: [number, number, number, number] = [left, top, snap(x0 + (c + 1) * cell) - left - gap, snap(y0 + (r + 1) * cell) - top - gap];
      const list = shades.get(shade);
      if (list) list.push(rect);
      else shades.set(shade, [rect]);
    }
  }
  context.save();
  roundedField(context, { x: x0, y: y0, w: width - gap, h: height - gap }, Math.min(10, cell * 0.5));
  context.clip();
  for (const [shade, rects] of shades) {
    context.beginPath();
    for (const [x, y, w, h] of rects) context.rect(x, y, w, h);
    context.fillStyle = HEAT[shade] ?? palette.ground;
    context.fill();
  }
  context.restore();
  roundedField(context, { x: x0 - 0.5, y: y0 - 0.5, w: width - gap + 1, h: height - gap + 1 }, Math.min(10, cell * 0.5));
  context.lineWidth = 1;
  context.strokeStyle = palette.rule;
  context.stroke();
}

// Network: edges as lines weighted by their strength among the edges from the same node, nodes as
// circles sized and filled by value.

function drawNetwork(sheet: Sheet, frame: NetworkFrame): void {
  const { context, text } = sheet;
  const field = squareIn(sheet.box);
  drawField(sheet, field);
  const count = Math.max(frame.nodes.length, 1);
  const base = clamp((field.w / Math.sqrt(count)) * 0.16, 3.5, 15);
  const labelled = frame.nodes.length <= 24 && frame.nodes.some((node) => node.label);
  // Room inside the field for the largest node, and under it for its label.
  const inset = base * 1.4 + 4;
  const point = (node: { readonly x: number; readonly y: number }): [number, number] => [
    field.x + inset + unit(node.x) * (field.w - 2 * inset),
    field.y + inset + unit(node.y) * (field.h - 2 * inset - (labelled ? text : 0)),
  ];
  const scale = clamp(base / 8, 0.6, 1.4);
  // The edges from one node are its row, as a tower's beams are; the faintest are drawn first.
  const joined = frame.edges.filter((edge) => edge.from < frame.nodes.length && edge.to < frame.nodes.length);
  const strengths = relativeInRows(joined, (edge) => edge.from, (edge) => edge.weight);
  const edges = joined.map((edge, index) => ({ ...edge, strength: strengths[index] ?? 0.5 })).sort((a, b) => a.strength - b.strength);
  context.lineCap = "round";
  context.strokeStyle = palette.edge;
  for (const edge of edges) {
    const [from, to] = [frame.nodes[edge.from], frame.nodes[edge.to]];
    if (!from || !to) continue;
    context.globalAlpha = 0.16 + 0.64 * edge.strength;
    context.lineWidth = (0.6 + 2.8 * edge.strength) * scale;
    context.beginPath();
    context.moveTo(...point(from));
    context.lineTo(...point(to));
    context.stroke();
  }
  context.globalAlpha = 1;
  for (const node of frame.nodes) {
    const [x, y] = point(node);
    const value = unit(node.value);
    const colour = groupColour(node.group, GROUP_COLOURS[0]);
    const radius = base * (0.7 + 0.6 * value);
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    // A cream ring parts a node from the edges under it; a low value leaves it pale inside its own ring.
    context.lineWidth = 4;
    context.strokeStyle = palette.halo;
    context.stroke();
    context.fillStyle = mixHex(colour, palette.ground, (1 - value) * 0.75);
    context.fill();
    context.lineWidth = 1.75;
    context.strokeStyle = colour;
    context.stroke();
  }
  if (!labelled) return;
  context.font = font(text);
  context.textAlign = "center";
  context.textBaseline = "top";
  for (const node of frame.nodes) {
    if (!node.label) continue;
    const [x, y] = point(node);
    const words = fit(context, node.label, field.w * 0.3);
    const half = context.measureText(words).width / 2;
    haloText(context, words, clamp(x, half + 2, sheet.width - half - 2), y + base * (0.7 + 0.6 * unit(node.value)) + 3);
  }
}

// Landscape: a height field in filled bands with faint contours, its marks as rings with labels.

type Corner = readonly [x: number, y: number, value: number];

function drawLandscape(sheet: Sheet, frame: LandscapeFrame): void {
  const { context, box, text } = sheet;
  const rows = frame.heights.length;
  const cols = Math.min(...frame.heights.map((line) => line.length));
  if (rows < 2 || cols < 2) return;
  const step = Math.min(box.w / (cols - 1), box.h / (rows - 1));
  const field: Box = { x: box.x + (box.w - step * (cols - 1)) / 2, y: box.y + (box.h - step * (rows - 1)) / 2, w: step * (cols - 1), h: step * (rows - 1) };
  const corner = (r: number, c: number): Corner => [field.x + c * step, field.y + r * step, unit(frame.heights[r]?.[c] ?? 0)];
  // Each cell is two triangles; a value varies linearly across a triangle, so bands and contours are exact there.
  const triangles: [Corner, Corner, Corner][] = [];
  for (let r = 0; r < rows - 1; r += 1) {
    for (let c = 0; c < cols - 1; c += 1) {
      const [a, b, d, e] = [corner(r, c), corner(r, c + 1), corner(r + 1, c + 1), corner(r + 1, c)];
      triangles.push([a, b, d], [a, d, e]);
    }
  }
  const BANDS = 10;
  context.save();
  roundedField(context, field, 12);
  context.clip();
  context.fillStyle = TERRAIN[rampIndex(0.5 / BANDS)] ?? palette.ground;
  context.fillRect(field.x, field.y, field.w, field.h);
  // Each band is laid over the one below: everything at or above its level, so no seam shows the ground.
  for (let band = 1; band < BANDS; band += 1) {
    const level = band / BANDS;
    context.beginPath();
    for (const triangle of triangles) {
      const shape = above(triangle, level);
      const first = shape[0];
      if (!first) continue;
      context.moveTo(first[0], first[1]);
      for (const [x, y] of shape.slice(1)) context.lineTo(x, y);
      context.closePath();
    }
    context.fillStyle = TERRAIN[rampIndex((band + 0.5) / BANDS)] ?? palette.ground;
    context.fill();
  }
  context.beginPath();
  for (let band = 1; band < BANDS; band += 1) {
    const level = band / BANDS;
    for (const triangle of triangles) {
      const crossing = contour(triangle, level);
      if (!crossing) continue;
      context.moveTo(crossing[0], crossing[1]);
      context.lineTo(crossing[2], crossing[3]);
    }
  }
  context.globalAlpha = 0.2;
  context.lineWidth = 1;
  context.strokeStyle = palette.contour;
  context.stroke();
  context.globalAlpha = 1;
  context.restore();

  const radius = clamp(step * 0.6, 6, 10);
  context.font = font(text);
  context.textBaseline = "middle";
  for (const mark of frame.marks) {
    const [x, y] = [field.x + unit(mark.x) * field.w, field.y + unit(mark.y) * field.h];
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    // A cream halo under the ring keeps it clear of a dark valley and a pale ridge alike.
    context.lineWidth = 6;
    context.strokeStyle = palette.halo;
    context.stroke();
    context.lineWidth = 3;
    context.strokeStyle = groupColour(mark.group, GROUP_COLOURS[2]);
    context.stroke();
    if (!mark.label) continue;
    const words = fit(context, mark.label, sheet.width * 0.4);
    const width = context.measureText(words).width;
    const padding = 6;
    const right = x + radius + 6 + width + 2 * padding <= sheet.width - 4;
    const left = right ? x + radius + 6 : x - radius - 6 - width - 2 * padding;
    context.beginPath();
    context.roundRect(left, y - text * 0.85, width + 2 * padding, text * 1.7, text * 0.85);
    context.globalAlpha = 0.92;
    context.fillStyle = palette.halo;
    context.fill();
    context.globalAlpha = 1;
    context.textAlign = "left";
    context.fillStyle = palette.text;
    context.fillText(words, left + padding, y + 0.5);
  }
}

/** The part of a triangle at or above a level: none of it, all of it, or a clipped polygon. */
function above(triangle: readonly [Corner, Corner, Corner], level: number): Corner[] {
  const shape: Corner[] = [];
  for (let index = 0; index < 3; index += 1) {
    const a = triangle[index] as Corner;
    const b = triangle[(index + 1) % 3] as Corner;
    if (a[2] >= level) shape.push(a);
    if (a[2] >= level !== b[2] >= level) shape.push(between(a, b, level));
  }
  return shape;
}

/** Where a level crosses a triangle, as a segment, or nothing when it does not. */
function contour(triangle: readonly [Corner, Corner, Corner], level: number): [number, number, number, number] | null {
  const points: Corner[] = [];
  for (let index = 0; index < 3; index += 1) {
    const a = triangle[index] as Corner;
    const b = triangle[(index + 1) % 3] as Corner;
    if (a[2] >= level !== b[2] >= level) points.push(between(a, b, level));
  }
  const [p, q] = points;
  return p && q ? [p[0], p[1], q[0], q[1]] : null;
}

function between(a: Corner, b: Corner, level: number): Corner {
  const t = (level - a[2]) / (b[2] - a[2]);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, level];
}
