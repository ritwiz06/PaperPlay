import { add, cross, dot, normalize, scale, subtract, transform4, type Mat4, type Vec3 } from "./vec.ts";

/** An orbit camera around the field: angles in radians, distance in world units. */
export interface OrbitCamera {
  readonly yaw: number;
  /** Elevation above the horizon; 0 looks level, π/2 straight down. */
  readonly pitch: number;
  readonly distance: number;
  readonly fovDeg: number;
  readonly aspect: number;
}

export interface CameraPose {
  readonly eye: Vec3;
  readonly target: Vec3;
  readonly up: Vec3;
}

export const PITCH_LIMITS = [0.22, 1.35] as const;
export const DISTANCE_LIMITS = [16, 96] as const;
export const NEAR = 0.1;
export const FAR = 400;

export const DEFAULT_CAMERA: OrbitCamera = Object.freeze({ yaw: -0.6, pitch: 0.52, distance: 58, fovDeg: 36, aspect: 16 / 9 });

const clamp = (value: number, [low, high]: readonly [number, number]): number => Math.min(Math.max(value, low), high);

export const orbit = (camera: OrbitCamera, dYaw: number, dPitch: number): OrbitCamera => ({
  ...camera,
  yaw: camera.yaw + dYaw,
  pitch: clamp(camera.pitch + dPitch, PITCH_LIMITS),
});

export const zoom = (camera: OrbitCamera, factor: number): OrbitCamera => ({
  ...camera,
  distance: clamp(camera.distance * factor, DISTANCE_LIMITS),
});

/** Takes the aspect from a viewport; an empty viewport keeps the last good aspect. */
export const withViewport = (camera: OrbitCamera, width: number, height: number): OrbitCamera =>
  width > 0 && height > 0 ? { ...camera, aspect: width / height } : camera;

/** On screens narrower than 1.2:1 the eye backs off so the field still fits across them, up to twice as far. */
export function portraitFit(aspect: number): number {
  return aspect >= 1.2 ? 1 : Math.min(Math.sqrt(1.2 / aspect), 2);
}

export function poseOf(camera: OrbitCamera, target: Vec3): CameraPose {
  const flat = Math.cos(camera.pitch);
  const offset: Vec3 = [flat * Math.sin(camera.yaw), Math.sin(camera.pitch), flat * Math.cos(camera.yaw)];
  return { eye: add(target, scale(offset, camera.distance * portraitFit(camera.aspect))), target, up: [0, 1, 0] };
}

/** World → view: the eye at the origin looking down −z. */
export function viewMatrix({ eye, target, up }: CameraPose): Mat4 {
  const f = normalize(subtract(target, eye));
  const s = normalize(cross(f, up));
  const u = cross(s, f);
  return [s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0, -dot(s, eye), -dot(u, eye), dot(f, eye), 1];
}

/** View → clip, OpenGL convention (NDC z in [−1, 1]), as Three.js builds it. */
export function projectionMatrix(camera: OrbitCamera): Mat4 {
  const f = 1 / Math.tan((camera.fovDeg * Math.PI) / 360);
  const depth = NEAR - FAR;
  return [f / camera.aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (FAR + NEAR) / depth, -1, 0, 0, (2 * FAR * NEAR) / depth, 0];
}

/** World point → normalised device coordinates. */
export function projectToNdc(view: Mat4, projection: Mat4, point: Vec3): Vec3 {
  const eyeSpace = transform4(view, [point[0], point[1], point[2], 1]);
  const [x, y, z, w] = transform4(projection, eyeSpace);
  return [x / w, y / w, z / w];
}

/** Where the ray through a screen point (NDC x, y) meets the plane y = groundY, or null if it never does. */
export function unprojectToGround(
  camera: OrbitCamera,
  pose: CameraPose,
  [x, y]: readonly [number, number],
  groundY: number,
): Vec3 | null {
  const f = normalize(subtract(pose.target, pose.eye));
  const s = normalize(cross(f, pose.up));
  const u = cross(s, f);
  const tanHalf = Math.tan((camera.fovDeg * Math.PI) / 360);
  const ray = normalize(add(f, add(scale(s, x * tanHalf * camera.aspect), scale(u, y * tanHalf))));
  if (ray[1] === 0) return null;
  const t = (groundY - pose.eye[1]) / ray[1];
  return t > 0 ? add(pose.eye, scale(ray, t)) : null;
}
