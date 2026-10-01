import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAMERA,
  DISTANCE_LIMITS,
  MAX_FIT,
  orbit,
  PITCH_LIMITS,
  poseOf,
  projectionMatrix,
  projectToNdc,
  transformPoint,
  unprojectToGround,
  viewMatrix,
  withViewport,
  zoom,
  type Vec3,
} from "../src/stage-core/index.ts";

const target: Vec3 = [0, 1.6, 0];
const length = ([x, y, z]: Vec3): number => Math.sqrt(x * x + y * y + z * z);
const minus = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

describe("orbit camera", () => {
  it("turns around the target and keeps pitch between its limits", () => {
    expect(orbit(DEFAULT_CAMERA, 0.5, 0).yaw).toBeCloseTo(DEFAULT_CAMERA.yaw + 0.5, 12);
    expect(orbit(DEFAULT_CAMERA, 0, 10).pitch).toBe(PITCH_LIMITS[1]);
    expect(orbit(DEFAULT_CAMERA, 0, -10).pitch).toBe(PITCH_LIMITS[0]);
  });

  it("zooms by a factor within its distance limits", () => {
    expect(zoom(DEFAULT_CAMERA, 0.5).distance).toBeCloseTo(DEFAULT_CAMERA.distance * 0.5, 12);
    expect(zoom(DEFAULT_CAMERA, 100).distance).toBe(DISTANCE_LIMITS[1]);
    expect(zoom(DEFAULT_CAMERA, 0.001).distance).toBe(DISTANCE_LIMITS[0]);
  });

  it("takes its aspect from the viewport and keeps the last good one for an empty viewport", () => {
    expect(withViewport(DEFAULT_CAMERA, 800, 400).aspect).toBe(2);
    expect(withViewport(DEFAULT_CAMERA, 0, 0).aspect).toBe(DEFAULT_CAMERA.aspect);
  });

  it("backs off on a narrow stage so the field still fits, and only then", () => {
    const eyeDistance = (aspect: number) => length(minus(poseOf({ ...DEFAULT_CAMERA, aspect }, target).eye, target));

    expect(eyeDistance(16 / 9)).toBeCloseTo(DEFAULT_CAMERA.distance, 12);
    expect(eyeDistance(390 / 844)).toBeGreaterThan(DEFAULT_CAMERA.distance * 1.4);
    expect(eyeDistance(0.1)).toBeCloseTo(DEFAULT_CAMERA.distance * MAX_FIT, 12);
  });

  it("fits the whole flight field on screen at the default view, whatever the stage's shape", () => {
    // A 32 × 32 field: its four corners on the ground and the tops of its four posts.
    const points: Vec3[] = [-16, 16].flatMap((x) => [-16, 16].flatMap((z) => [[x, 0, z] as Vec3, [x, 4.2, z] as Vec3]));
    // Wide screens, the stage beside the bench at 1440 × 900, a phone's square-ish stage, and a phone held upright.
    for (const aspect of [16 / 9, 1048 / 686, 1.2, 1, 366 / 400, 390 / 844]) {
      const camera = { ...DEFAULT_CAMERA, aspect };
      const pose = poseOf(camera, target);
      for (const point of points) {
        const [x, y] = projectToNdc(viewMatrix(pose), projectionMatrix(camera), point);
        expect(Math.abs(x), `aspect ${aspect.toFixed(3)}, corner ${point.join(", ")}`).toBeLessThanOrEqual(0.98);
        expect(Math.abs(y), `aspect ${aspect.toFixed(3)}, corner ${point.join(", ")}`).toBeLessThanOrEqual(0.98);
      }
    }
  });

  it("places the eye at its distance from the target, raised by the pitch angle", () => {
    const { eye } = poseOf(DEFAULT_CAMERA, target);
    const offset = minus(eye, target);

    expect(length(offset)).toBeCloseTo(DEFAULT_CAMERA.distance, 12);
    expect(Math.asin(offset[1] / DEFAULT_CAMERA.distance)).toBeCloseTo(DEFAULT_CAMERA.pitch, 12);
  });

  it("builds a view matrix that moves the eye to the origin and the target onto −z", () => {
    const pose = poseOf(DEFAULT_CAMERA, target);
    const view = viewMatrix(pose);
    const eyeInView = transformPoint(view, pose.eye);
    const targetInView = transformPoint(view, target);

    for (const value of eyeInView) expect(Math.abs(value)).toBeLessThan(1e-9);
    expect(targetInView[0]).toBeCloseTo(0, 9);
    expect(targetInView[1]).toBeCloseTo(0, 9);
    expect(targetInView[2]).toBeCloseTo(-DEFAULT_CAMERA.distance, 9);
  });

  it("projects the target to the centre of the screen", () => {
    const pose = poseOf(DEFAULT_CAMERA, target);
    const [x, y] = projectToNdc(viewMatrix(pose), projectionMatrix(DEFAULT_CAMERA), target);

    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(0, 9);
  });

  it("unprojects a screen point back onto the patch of ground it shows", () => {
    const camera = orbit(DEFAULT_CAMERA, 0.9, -0.1);
    const pose = poseOf(camera, target);
    const [view, projection] = [viewMatrix(pose), projectionMatrix(camera)];
    for (const ground of [[0, 0, 0], [6, 0, -4], [-10, 0, 7]] as Vec3[]) {
      const [x, y] = projectToNdc(view, projection, ground);
      const back = unprojectToGround(camera, pose, [x, y], 0);
      expect(back).not.toBeNull();
      for (let axis = 0; axis < 3; axis++) expect(back?.[axis]).toBeCloseTo(ground[axis] ?? Number.NaN, 9);
    }
  });

  it("finds no ground along a ray that points above the horizon", () => {
    // At the lowest pitch the top edge of the view looks above the horizon.
    const low = orbit(DEFAULT_CAMERA, 0, -10);
    expect(unprojectToGround(low, poseOf(low, target), [0, 0.99], 0)).toBeNull();
  });
});
