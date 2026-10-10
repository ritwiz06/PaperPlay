import type { Agent, FlockState } from "@paperplay/primitives/flock";
import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  DEFAULT_CAMERA,
  describeFrame,
  dusk,
  FLAP_HZ,
  flockCentre,
  headingColor,
  mixHex,
  TRAIL_LENGTH,
  valleyDay,
  type StageInput,
} from "../src/stage-core/index.ts";

const dt = 1 / 60;
const world = (agents: Agent[], stepIndex = 0): FlockState => ({ width: 32, height: 32, stepIndex, agents, beacons: [], obstacles: [] });
const still = (state: FlockState, trail?: FlockState[]): StageInput => ({ previous: state, current: state, alpha: 1, timestep: dt, ...(trail ? { trail } : {}) });
const heading = { birdColor: "heading" } as const;

describe("colour by heading", () => {
  it("runs round a wheel of palette colours, one full turn per turn of heading", () => {
    for (const palette of [valleyDay, dusk]) {
      const [first, second, third] = palette.headingWheel;
      expect(headingColor(palette, 0)).toBe(first);
      expect(headingColor(palette, (2 * Math.PI) / 3)).toBe(second);
      expect(headingColor(palette, (4 * Math.PI) / 3)).toBe(third);
      expect(headingColor(palette, 2 * Math.PI + 0.4)).toBe(headingColor(palette, 0.4));
      expect(headingColor(palette, -0.4)).toBe(headingColor(palette, 2 * Math.PI - 0.4));
    }
  });

  it("keeps every colour on the wheel at 3:1 or better against the meadow under the flock (WCAG non-text contrast)", () => {
    for (const palette of [valleyDay, dusk]) {
      for (let k = 0; k < 36; k++) {
        const color = headingColor(palette, (k / 36) * 2 * Math.PI);
        expect(contrastRatio(color, palette.meadow), `${palette.name} at ${k * 10}°`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("gives birds flying the same way the same colour, and birds flying apart different ones", () => {
    const frame = describeFrame(still(world([{ x: 4, y: 4, vx: 1, vy: 0 }, { x: 20, y: 9, vx: 2, vy: 0 }, { x: 9, y: 22, vx: -1, vy: 0 }])), DEFAULT_CAMERA, valleyDay, {}, heading);
    const [a, b, c] = frame.birds.map((bird) => bird.color);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("is off unless asked for, and a picked bird's focus and context still win", () => {
    const state = world([{ x: 4, y: 4, vx: 1, vy: 0 }, { x: 20, y: 9, vx: 0, vy: 1 }]);
    expect(describeFrame(still(state), DEFAULT_CAMERA, valleyDay).birds.map((bird) => bird.color)).toEqual([valleyDay.bird, valleyDay.bird]);
    const picked = describeFrame(still(state), DEFAULT_CAMERA, valleyDay, { selected: 0, neighbours: [] }, heading);
    expect(picked.birds.map((bird) => bird.color)).toEqual([valleyDay.selected, valleyDay.context]);
  });
});

describe("wingbeats", () => {
  it("beat in time, each bird on its own phase, wider when a bird flies faster", () => {
    const slow = world([{ x: 4, y: 4, vx: 1, vy: 0 }, { x: 20, y: 9, vx: 3.4, vy: 0 }]);
    const flaps = (stepIndex: number) => describeFrame(still({ ...slow, stepIndex }), DEFAULT_CAMERA, valleyDay).birds.map((bird) => bird.flap);
    const samples = Array.from({ length: 60 }, (_, step) => flaps(step));
    const [slowSwing, fastSwing] = [0, 1].map((bird) => Math.max(...samples.map((row) => Math.abs(row[bird] ?? 0))));
    expect(fastSwing ?? 0).toBeGreaterThan(slowSwing ?? Number.POSITIVE_INFINITY);
    expect(samples[0]?.[0]).not.toBe(samples[0]?.[1]);
    // One beat lasts 1 / FLAP_HZ seconds of the world's own time, so it repeats with the run, not the frame rate.
    const period = Math.round(60 / FLAP_HZ);
    expect(flaps(period * 5)[0] ?? Number.NaN).toBeCloseTo(flaps(0)[0] ?? Number.NaN, 1);
  });
});

describe("trails", () => {
  const at = (x: number, step: number): FlockState => world([{ x, y: 10, vx: 1, vy: 0 }, { x: 20, y: 20, vx: 0, vy: 1 }], step);

  it("run from where a bird was to where it is drawn, oldest first", () => {
    const frame = describeFrame(still(at(9, 9), [at(6, 6), at(7, 7), at(8, 8)]), DEFAULT_CAMERA, valleyDay);
    const trail = frame.trails[0];
    expect(trail?.points.map((point) => point[0] + 16)).toEqual([6, 7, 8, 9]);
    expect(trail?.points.at(-1)).toEqual(frame.birds[0]?.position);
  });

  it("are cut where a bird wrapped round the world, so no streak crosses the field", () => {
    const frame = describeFrame(still(at(1, 9), [at(30, 6), at(31, 7), at(0.2, 8)]), DEFAULT_CAMERA, valleyDay);
    const xs = frame.trails[0]?.points.map((point) => point[0] + 16) ?? [];
    expect(xs).toHaveLength(2);
    expect(xs[0]).toBeCloseTo(0.2, 9);
    expect(xs[1]).toBeCloseTo(1, 9);
  });

  it("stop at TRAIL_LENGTH world units, so a fast bird's trail stays short", () => {
    const long = describeFrame(still(at(20, 9), [at(4, 1), at(8, 3), at(12, 5), at(16, 7)]), DEFAULT_CAMERA, valleyDay).trails[0];
    const length = (long?.points ?? []).slice(1).reduce((sum, point, i) => sum + Math.hypot(point[0] - (long?.points[i]?.[0] ?? 0), point[2] - (long?.points[i]?.[2] ?? 0)), 0);
    expect(length).toBeCloseTo(TRAIL_LENGTH, 9);
    expect(long?.points.map((point) => point[0] + 16)).toEqual([16.5, 20]);
  });

  it("are absent without a history", () => {
    expect(describeFrame(still(at(9, 9)), DEFAULT_CAMERA, valleyDay).trails).toEqual([]);
  });
});

describe("the camera's target and the flock's centre", () => {
  it("looks at the camera's target when it has one, and at the field's centre otherwise", () => {
    const state = world([{ x: 4, y: 4, vx: 1, vy: 0 }, { x: 6, y: 4, vx: 1, vy: 0 }]);
    expect(describeFrame(still(state), DEFAULT_CAMERA, valleyDay).camera.target).toEqual([0, 1.6, 0]);
    expect(describeFrame(still(state), { ...DEFAULT_CAMERA, target: [5, 1.6, -3] }, valleyDay).camera.target).toEqual([5, 1.6, -3]);
  });

  it("finds the flock's centre the short way round the world, so a flock across a seam centres on the seam", () => {
    const across = world([{ x: 31, y: 16, vx: 1, vy: 0 }, { x: 1, y: 16, vx: 1, vy: 0 }]);
    const centre = flockCentre(across);
    expect(Math.min(centre.x, 32 - centre.x)).toBeCloseTo(0, 9);
    expect(centre.y).toBeCloseTo(16, 9);
    const plain = flockCentre(world([{ x: 4, y: 8, vx: 1, vy: 0 }, { x: 8, y: 12, vx: 1, vy: 0 }]));
    expect(plain.x).toBeCloseTo(6, 6);
    expect(plain.y).toBeCloseTo(10, 6);
  });

  it("uses only palette colours for the new parts of the valley", () => {
    expect(valleyDay.meadow).toBe(mixHex("#f8faee", "#d4f581", 0.3));
  });
});
