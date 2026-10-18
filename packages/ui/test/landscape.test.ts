import { describe, expect, it } from "vitest";
import { contrastRatio, mixHex } from "../src/stage-core/color.ts";
import { DEFAULT_CAMERA } from "../src/stage-core/camera.ts";
import { describeLandscape, landscapeDay, landscapeStage, terrainOf, TERRAIN_HEIGHT, type LandscapeInput } from "../src/stage-core/kits/landscape/index.ts";

// The landscape kit's pure half (ADR-0047): presentation only. Its terrain keeps the loss's order,
// its balls keep 3:1 against every part of the terrain, a ball off the surface stands at its edge,
// and describing a frame changes nothing it is given.

const surface = { hx: 1, hy: 25, cx: 0, cy: 0, gx: 0, gy: 0, extent: { x: [-6, 6] as const, y: [-3, 3] as const } };
const input = (): LandscapeInput => ({ surface, alpha: 0.5, balls: [{ role: "here", previous: [-5, 1.5], current: [-4.8, 1.2], trail: [[-5, 1.5], [-4.8, 1.2]] }, { role: "there", previous: [-5, 1.5], current: [-4.9, 1.4], trail: [[-5, 1.5], [-4.9, 1.4]] }] });

describe("[R02] the landscape kit", () => {
  it("draws the terrain higher wherever the loss is higher, from zero at its lowest to TERRAIN_HEIGHT", () => {
    const terrain = terrainOf(surface, landscapeDay);
    expect(Math.min(...terrain.heights)).toBeCloseTo(0, 9);
    expect(Math.max(...terrain.heights)).toBeCloseTo(TERRAIN_HEIGHT, 9);
    // Along the middle row, the loss falls to the centre and rises again, and so does the height.
    const middle = terrain.heights.slice((terrain.rows / 2) * (terrain.columns + 1), (terrain.rows / 2 + 1) * (terrain.columns + 1));
    const lowest = middle.indexOf(Math.min(...middle));
    expect(lowest).toBe(terrain.columns / 2);
    for (let i = 1; i <= lowest; i++) expect(middle[i]).toBeLessThanOrEqual(middle[i - 1] as number);
  });

  it("keeps each ball 3:1 against every colour of the terrain, and tells them apart", () => {
    for (const ball of [landscapeDay.here, landscapeDay.there]) {
      for (const t of [0, 0.25, 0.5, 0.75, 1]) expect(contrastRatio(ball, mixHex(landscapeDay.low, landscapeDay.high, t)), `${ball} at ${t}`).toBeGreaterThanOrEqual(3);
    }
    expect(landscapeDay.here).not.toBe(landscapeDay.there);
  });

  it("puts a ball beyond the drawn surface at its edge, and changes nothing it is given", () => {
    const given = input();
    const before = JSON.stringify(given);
    const far = describeLandscape({ ...given, balls: [{ role: "here", previous: [50, 0], current: [50, 0], trail: [] }] }, DEFAULT_CAMERA, landscapeDay);
    expect(far.balls[0]?.position[0]).toBeCloseTo(14, 9);
    const frame = describeLandscape(given, DEFAULT_CAMERA, landscapeDay);
    expect(JSON.stringify(given)).toBe(before);
    expect(frame.balls.map((ball) => ball.role)).toEqual(["here", "there"]);
    expect(landscapeStage.marks?.(frame).balls).toMatch(/^here:\S+ there:\S+$/);
  });
});
