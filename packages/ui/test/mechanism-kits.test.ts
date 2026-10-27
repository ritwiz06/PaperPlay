import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { MechanismFrame } from "@paperplay/contracts";
import { describe, expect, it } from "vitest";
import { contrastRatio, relativeLuminance } from "../src/stage-core/color.ts";
import { drawMechanismFrame, MECHANISM_FONT_STACK } from "../src/react/mechanism/draw.ts";
import { GROUP_COLOURS, mechanismPalette, rampTable } from "../src/react/mechanism/palette.ts";
import { tokens } from "../src/tokens.ts";

// The generic kits a generated mechanism draws in (ADR-0058), drawn into a context that records
// every call. A kit reads its frame and writes nothing to it, and the same frame always makes the
// same drawing.

interface Call {
  readonly name: string;
  readonly args: readonly unknown[];
  /** The fill and stroke colours in force when a paint call was made. */
  readonly fill?: unknown;
  readonly stroke?: unknown;
}

const PAINTS = new Set(["fill", "stroke", "fillRect", "fillText", "strokeText"]);

function recorder(): { readonly context: CanvasRenderingContext2D; readonly calls: Call[] } {
  const calls: Call[] = [];
  const state = new Map<PropertyKey, unknown>();
  const fontSize = (): number => {
    const font = state.get("font");
    return Number(/(\d+(?:\.\d+)?)px/.exec(typeof font === "string" ? font : "")?.[1] ?? 10);
  };
  const context = new Proxy(
    {},
    {
      get(_, key) {
        if (state.has(key)) return state.get(key);
        if (key === "measureText") return (text: string) => ({ width: text.length * fontSize() * 0.55 });
        return (...args: unknown[]) => {
          const name = String(key);
          calls.push(PAINTS.has(name) ? { name, args, fill: state.get("fillStyle"), stroke: state.get("strokeStyle") } : { name, args });
        };
      },
      set(_, key, value) {
        state.set(key, value);
        calls.push({ name: `set ${String(key)}`, args: [value] });
        return true;
      },
    },
  ) as CanvasRenderingContext2D;
  return { context, calls };
}

function draw(frame: MechanismFrame, width = 800, height = 600, ratio = 2): Call[] {
  const { context, calls } = recorder();
  drawMechanismFrame(context, frame, { width, height, ratio });
  return calls;
}

const count = (calls: readonly Call[], name: string): number => calls.filter((call) => call.name === name).length;

/** Paint calls in some colour other than the ground's: the kit drew something of the frame. */
const painted = (calls: readonly Call[]): number =>
  calls.filter((call) => PAINTS.has(call.name) && ((call.name.startsWith("fill") && call.fill !== tokens.cream) || (call.name.startsWith("stroke") && call.stroke !== tokens.cream))).length;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

const particles: MechanismFrame = {
  kit: "particles",
  frame: { particles: Array.from({ length: 40 }, (_, i) => ({ x: (i % 8) / 7, y: Math.floor(i / 8) / 4, heading: i * 0.3, size: (i % 5) / 4, group: i % 3 })) },
};
const towers: MechanismFrame = {
  kit: "towers",
  frame: {
    towers: ["the", "cat", "sat", "on", "the", "mat"].map((label, i) => ({ label, height: (i + 1) / 6 })),
    beams: [
      { from: 2, to: 0, weight: 0.2 },
      { from: 2, to: 1, weight: 0.7, group: 1 },
      { from: 2, to: 2, weight: 0.4 },
      { from: 2, to: 5, weight: 0 },
    ],
  },
};
const grid: MechanismFrame = { kit: "grid", frame: { rows: 6, cols: 9, cells: Array.from({ length: 54 }, (_, i) => (i % 9) / 8) } };
const network: MechanismFrame = {
  kit: "network",
  frame: {
    nodes: Array.from({ length: 6 }, (_, i) => ({ x: 0.5 + 0.4 * Math.cos(i), y: 0.5 + 0.4 * Math.sin(i), value: i / 5, label: `n${i}`, group: i % 2 })),
    edges: [
      { from: 0, to: 1, weight: 1 },
      { from: 1, to: 2, weight: 0.3 },
      { from: 3, to: 5, weight: 0 },
    ],
  },
};
const landscape: MechanismFrame = {
  kit: "landscape",
  frame: {
    heights: Array.from({ length: 12 }, (_, r) => Array.from({ length: 16 }, (_, c) => Math.min(1, ((r - 6) ** 2 + (c - 8) ** 2) / 100))),
    marks: [
      { x: 0.2, y: 0.3, label: "start" },
      { x: 0.5, y: 0.5, label: "lowest", group: 1 },
    ],
  },
};
const charts: MechanismFrame = { kit: "charts", frame: { bars: ["one", "two", "three"].map((label, i) => ({ label, value: i / 2 })) } };

const ALL = { particles, towers, grid, network, landscape, charts } as const;

describe("the generic scene kits (ADR-0058)", () => {
  for (const [kit, frame] of Object.entries(ALL)) {
    it(`draw a ${kit} frame without throwing, and draw something of it`, () => {
      const calls = draw(frame);
      expect(calls[0]).toEqual({ name: "setTransform", args: [2, 0, 0, 2, 0, 0] });
      expect(painted(calls)).toBeGreaterThan(0);
    });

    it(`[R02] never write to the ${kit} frame they are given, and draw the same frame the same way twice`, () => {
      const before = structuredClone(frame);
      const frozen = deepFreeze(structuredClone(frame));
      const first = draw(frozen);
      expect(frozen).toEqual(before);
      expect(draw(frozen)).toEqual(first);
    });

    it(`draw a ${kit} frame at 360 px wide, and draw only the ground on a canvas with no size`, () => {
      expect(painted(draw(frame, 360, 640, 3))).toBeGreaterThan(0);
      expect(painted(draw(frame, 0, 0, 1))).toBe(0);
    });
  }

  it("draw a dot for every particle and a tail for every particle that has a heading", () => {
    const calls = draw(particles);
    expect(count(calls, "arc")).toBe(40);
    expect(count(calls, "lineTo")).toBe(40);
  });

  it("draw a tower and a label for each token, an arc for each beam with weight, and a loop for a beam to its own tower", () => {
    const calls = draw(towers);
    expect(calls.filter((call) => call.name === "fillText").map((call) => call.args[0])).toEqual(["the", "cat", "sat", "on", "the", "mat"]);
    // The beam of weight 0 is not drawn; the other two join towers, and one loops.
    expect(count(calls, "bezierCurveTo")).toBe(2);
    expect(count(calls, "arc")).toBe(1);
    expect(count(calls, "arcTo")).toBe(12);
  });

  it("draw one tower with no beams", () => {
    const calls = draw({ kit: "towers", frame: { towers: [{ label: "alone", height: 0.5 }], beams: [] } });
    expect(count(calls, "arcTo")).toBe(2);
    expect(count(calls, "bezierCurveTo")).toBe(0);
    expect(calls.filter((call) => call.name === "fillText").map((call) => call.args[0])).toEqual(["alone"]);
  });

  it("slant the labels of many towers, and leave some out on a phone rather than let them collide", () => {
    const many = (length: number): MechanismFrame => ({ kit: "towers", frame: { towers: Array.from({ length }, (_, i) => ({ label: `token ${i}`, height: 0.5 })), beams: [] } });
    expect(count(draw(many(32), 1440, 900), "rotate")).toBe(32);
    const phone = draw(many(64), 360, 640);
    expect(count(phone, "rotate")).toBeGreaterThan(0);
    expect(count(phone, "rotate")).toBeLessThan(64);
  });

  it("draw a cell for every value of a grid, and a 1 × 1 grid as one cell", () => {
    expect(count(draw(grid), "rect")).toBe(54);
    const one = draw({ kit: "grid", frame: { rows: 1, cols: 1, cells: [0.5] } });
    expect(count(one, "rect")).toBe(1);
    expect(painted(one)).toBeGreaterThan(0);
  });

  it("colour a grid's cells by value, and never by anything the renderer computed", () => {
    const calls = draw({ kit: "grid", frame: { rows: 1, cols: 3, cells: [0, 0.5, 1] } });
    const fills = calls.filter((call) => call.name === "fill").map((call) => call.fill);
    const heat = rampTable(mechanismPalette.heat);
    expect(fills).toEqual([heat[0], heat[32], heat[64]]);
  });

  it("draw a network's nodes and its edges, and a network with no edges", () => {
    const calls = draw(network);
    expect(count(calls, "arc")).toBe(6);
    expect(count(calls, "lineTo")).toBe(3);
    expect(calls.filter((call) => call.name === "fillText").map((call) => call.args[0])).toEqual(["n0", "n1", "n2", "n3", "n4", "n5"]);
    const lone = draw({ kit: "network", frame: { nodes: [{ x: 0.5, y: 0.5, value: 1 }], edges: [] } });
    expect(count(lone, "arc")).toBe(1);
    expect(count(lone, "lineTo")).toBe(0);
  });

  it("leave a crowded network's labels out", () => {
    const crowd: MechanismFrame = { kit: "network", frame: { nodes: Array.from({ length: 30 }, (_, i) => ({ x: i / 29, y: 0.5, value: 0.5, label: `n${i}` })), edges: [] } };
    expect(count(draw(crowd), "fillText")).toBe(0);
  });

  it("draw a landscape's marks as rings with their labels, and a 2 × 2 landscape with none", () => {
    const calls = draw(landscape);
    expect(count(calls, "arc")).toBe(2);
    expect(calls.filter((call) => call.name === "fillText").map((call) => call.args[0])).toEqual(["start", "lowest"]);
    const small = draw({ kit: "landscape", frame: { heights: [[0, 1], [1, 0]], marks: [] } });
    expect(painted(small)).toBeGreaterThan(0);
  });

  it("draw a bar and a label for each bar of a chart, and a chart of one bar", () => {
    const calls = draw(charts);
    expect(count(calls, "arcTo")).toBe(6);
    expect(calls.filter((call) => call.name === "fillText").map((call) => call.args[0])).toEqual(["one", "two", "three"]);
    expect(count(draw({ kit: "charts", frame: { bars: [{ value: 1 }] } }), "arcTo")).toBe(2);
  });

  it("skip a beam or an edge that joins something that is not there, rather than throw", () => {
    expect(() => draw({ kit: "towers", frame: { towers: [{ height: 1 }], beams: [{ from: 0, to: 3, weight: 1 }] } })).not.toThrow();
    expect(() => draw({ kit: "network", frame: { nodes: [{ x: 0, y: 0, value: 0 }], edges: [{ from: 0, to: 9, weight: 1 }] } })).not.toThrow();
  });
});

describe("the generic kits' palette", () => {
  it("keeps every group colour at 3:1 against the ground, so a mark is seen without its label", () => {
    expect(GROUP_COLOURS).toHaveLength(6);
    for (const colour of GROUP_COLOURS) expect(contrastRatio(colour, mechanismPalette.ground), colour).toBeGreaterThanOrEqual(3);
    for (const colour of [mechanismPalette.tower, mechanismPalette.edge]) expect(contrastRatio(colour, mechanismPalette.ground), colour).toBeGreaterThanOrEqual(3);
    expect(new Set(GROUP_COLOURS).size).toBe(6);
  });

  it("writes words only in ink or sub, at AA against the ground, the field and the halo", () => {
    for (const background of [mechanismPalette.ground, mechanismPalette.field, mechanismPalette.halo]) {
      expect(contrastRatio(mechanismPalette.text, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(mechanismPalette.quiet, background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("changes lightness one way only along the grid's ramp and the landscape's", () => {
    for (const stops of [mechanismPalette.heat, mechanismPalette.terrain]) {
      const shades = rampTable(stops).map(relativeLuminance);
      for (let i = 1; i < shades.length; i += 1) {
        if (stops === mechanismPalette.heat) expect(shades[i]).toBeLessThan(shades[i - 1] ?? 1);
        else expect(shades[i]).toBeGreaterThan(shades[i - 1] ?? 0);
      }
    }
  });

  it("names the interface face as fonts.css does", () => {
    const css = readFileSync(join(import.meta.dirname, "..", "src", "fonts", "fonts.css"), "utf8");
    expect(/--font-interface:\s*([^;]+);/.exec(css)?.[1]).toBe(MECHANISM_FONT_STACK);
  });
});
