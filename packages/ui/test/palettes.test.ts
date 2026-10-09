import { describe, expect, it } from "vitest";
import { contrastRatio, dusk, valleyDay } from "../src/stage-core/index.ts";
import { tokens } from "../src/tokens.ts";

describe("stage palettes", () => {
  it("measures contrast the WCAG way", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 9);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 12);
    expect(contrastRatio(tokens.ink, tokens.cream)).toBeCloseTo(contrastRatio(tokens.cream, tokens.ink), 12);
  });

  it("keeps birds legible against the sky by day and at dusk (at least 7:1)", () => {
    for (const palette of [valleyDay, dusk]) {
      expect(contrastRatio(palette.bird, palette.sky), palette.name).toBeGreaterThanOrEqual(7);
    }
  });

  it("keeps a selected bird's neighbours as legible as any bird, and the rest visible though dimmed", () => {
    for (const palette of [valleyDay, dusk]) {
      expect(contrastRatio(palette.neighbour, palette.sky), palette.name).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(palette.selected, palette.sky), palette.name).toBeGreaterThanOrEqual(7);
      const dimmed = contrastRatio(palette.context, palette.sky);
      expect(dimmed, palette.name).toBeGreaterThanOrEqual(1.5);
      expect(dimmed, palette.name).toBeLessThan(contrastRatio(palette.neighbour, palette.sky) / 2);
    }
  });

  it("draws the keyboard cursor at 3:1 or better against the valley floor (WCAG non-text contrast)", () => {
    for (const palette of [valleyDay, dusk]) {
      expect(contrastRatio(palette.cursor, palette.groundLow), palette.name).toBeGreaterThanOrEqual(3);
    }
  });

  it("draws birds in ink by day and cream at dusk, not the prototype's coral", () => {
    expect(valleyDay.bird).toBe(tokens.ink);
    expect(dusk.bird).toBe(tokens.cream);
  });

  it("names its colours as six-digit hex so any renderer can read them", () => {
    for (const palette of [valleyDay, dusk]) {
      for (const [role, value] of Object.entries(palette)) {
        if (role === "name") continue;
        for (const color of [value].flat()) expect(color, `${palette.name}.${role}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});
