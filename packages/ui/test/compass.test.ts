import { flockDefaultParams, flockPlanarWeighted as flock } from "@paperplay/primitives";
import { describe, expect, it } from "vitest";
import { compassMarks, DEFAULT_CAMERA, describeFrame, orbit, projectToNdc, valleyDay, withViewport } from "../src/stage-core/index.ts";

describe("the heading compass", () => {
  it("puts one tick per bird with a heading on the unit ring, and none for a bird at rest", () => {
    const { ticks } = compassMarks([0, Math.PI / 2, null], 0, 0.5, 0);
    expect(ticks).toHaveLength(2);
    for (const tick of ticks) expect(Math.hypot(tick.x, tick.y)).toBeCloseTo(1, 12);
  });

  it("draws the arrow along the mean heading, as long as the directional agreement", () => {
    const { arrow } = compassMarks([], 0.3, 0.42, 0);
    expect(arrow && Math.hypot(arrow.x, arrow.y)).toBeCloseTo(0.42, 12);
    expect(compassMarks([], null, 0, 0).arrow).toBeNull();
  });

  it("is the field seen from above, turned to match the camera: a heading points where the birds fly on screen", () => {
    const state = flock.init(flockDefaultParams, 4);
    for (const yaw of [-0.6, 0.4, 2.2]) {
      const camera = withViewport(orbit({ ...DEFAULT_CAMERA, yaw }, 0, 0), 1200, 800);
      const frame = describeFrame({ previous: state, current: state, alpha: 1, timestep: flock.fixedTimestep }, camera, valleyDay);
      for (const heading of [0, 0.8, 2, -2.5]) {
        // A short step from the field's centre along this heading, as the screen shows it (y down, like SVG).
        const [ax, ay] = projectToNdc(frame.camera.view, frame.camera.projection, [0, 3.2, 0]);
        const [bx, by] = projectToNdc(frame.camera.view, frame.camera.projection, [Math.cos(heading) * 0.5, 3.2, Math.sin(heading) * 0.5]);
        const screen = Math.atan2(-(by - ay) / Math.sin(camera.pitch), (bx - ax) * camera.aspect);
        const [tick] = compassMarks([heading], null, 0, yaw).ticks;
        const drawn = Math.atan2(tick?.y ?? Number.NaN, tick?.x ?? Number.NaN);
        // The compass ignores the camera's tilt, so allow a few degrees for perspective.
        const gap = Math.abs(Math.atan2(Math.sin(drawn - screen), Math.cos(drawn - screen)));
        expect(gap, `yaw ${yaw}, heading ${heading}`).toBeLessThan(0.08);
      }
    }
  });
});
