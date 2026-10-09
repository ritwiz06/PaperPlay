import { add, cross, dot, normalize, scale, subtract, transform4, type Mat4, type Vec3 } from "./vec.ts";

/**
 * The part of the canvas the view is framed in, as fractions of the canvas from its top
 * left: the rectangle a HUD leaves free. The view is centred in it and fits the field to it,
 * while the canvas still draws the world edge to edge.
 */
export interface ViewWindow {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export const FULL_WINDOW: ViewWindow = Object.freeze({ left: 0, top: 0, width: 1, height: 1 });

/** An orbit camera around the field: angles in radians, distance in world units. */
export interface OrbitCamera {
  readonly yaw: number;
  /** Elevation above the horizon; 0 looks level, π/2 straight down. */
  readonly pitch: number;
  readonly distance: number;
  readonly fovDeg: number;
  /** The whole canvas's width over its height. */
  readonly aspect: number;
  /** Where on the canvas the view is framed; the whole canvas when absent. */
  readonly window?: ViewWindow;
  /** The point the camera looks at, in world coordinates; the field's centre when absent. */
  readonly target?: Vec3;
}

/** The aspect of the window the view is framed in. */
export const viewAspect = (camera: Pick<OrbitCamera, "aspect" | "window">): number => {
  const window = camera.window ?? FULL_WINDOW;
  return (camera.aspect * window.width) / window.height;
};

/** How the window sits in normalised device coordinates: its scale and the offset of its centre. */
function windowInNdc(window: ViewWindow = FULL_WINDOW): { sx: number; sy: number; ox: number; oy: number } {
  return { sx: window.width, sy: window.height, ox: 2 * (window.left + window.width / 2) - 1, oy: 1 - 2 * (window.top + window.height / 2) };
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

/** Below this aspect the field would overflow the stage's width at the default view. */
export const FIT_ASPECT = 1.32;
/** The furthest the eye backs off for a narrow stage, as a multiple of its distance. */
export const MAX_FIT = 3;

/**
 * On stages narrower than FIT_ASPECT the eye backs off so the whole field still fits. The
 * width a view holds grows with the distance, so the back-off is inverse to the aspect.
 */
export function portraitFit(aspect: number): number {
  return aspect >= FIT_ASPECT ? 1 : Math.min(FIT_ASPECT / aspect, MAX_FIT);
}

export function poseOf(camera: OrbitCamera, target: Vec3): CameraPose {
  const flat = Math.cos(camera.pitch);
  const offset: Vec3 = [flat * Math.sin(camera.yaw), Math.sin(camera.pitch), flat * Math.cos(camera.yaw)];
  return { eye: add(target, scale(offset, camera.distance * portraitFit(viewAspect(camera)))), target, up: [0, 1, 0] };
}

/** World → view: the eye at the origin looking down −z. */
export function viewMatrix({ eye, target, up }: CameraPose): Mat4 {
  const f = normalize(subtract(target, eye));
  const s = normalize(cross(f, up));
  const u = cross(s, f);
  return [s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0, -dot(s, eye), -dot(u, eye), dot(f, eye), 1];
}

/**
 * View → clip, OpenGL convention (NDC z in [−1, 1]), as Three.js builds it for the window's
 * aspect, then scaled and shifted so the view lands in the window: an off-centre frustum.
 * With the whole canvas as the window it is the ordinary symmetric projection.
 */
export function projectionMatrix(camera: OrbitCamera): Mat4 {
  const f = 1 / Math.tan((camera.fovDeg * Math.PI) / 360);
  const depth = NEAR - FAR;
  const { sx, sy, ox, oy } = windowInNdc(camera.window);
  return [(sx * f) / viewAspect(camera), 0, 0, 0, 0, sy * f, 0, 0, -ox, -oy, (FAR + NEAR) / depth, -1, 0, 0, (2 * FAR * NEAR) / depth, 0];
}

/** World point → normalised device coordinates. */
export function projectToNdc(view: Mat4, projection: Mat4, point: Vec3): Vec3 {
  const eyeSpace = transform4(view, [point[0], point[1], point[2], 1]);
  const [x, y, z, w] = transform4(projection, eyeSpace);
  return [x / w, y / w, z / w];
}

/** Where the ray through a screen point (NDC x, y) meets the plane y = groundY, or null if it never does. */
export function unprojectToGround(
  camera: Pick<OrbitCamera, "fovDeg" | "aspect" | "window">,
  pose: CameraPose,
  [x, y]: readonly [number, number],
  groundY: number,
): Vec3 | null {
  const f = normalize(subtract(pose.target, pose.eye));
  const s = normalize(cross(f, pose.up));
  const u = cross(s, f);
  const tanHalf = Math.tan((camera.fovDeg * Math.PI) / 360);
  // From the canvas's coordinates to the window's, where the symmetric view lives.
  const { sx, sy, ox, oy } = windowInNdc(camera.window);
  const [wx, wy] = [(x - ox) / sx, (y - oy) / sy];
  const ray = normalize(add(f, add(scale(s, wx * tanHalf * viewAspect(camera)), scale(u, wy * tanHalf))));
  if (ray[1] === 0) return null;
  const t = (groundY - pose.eye[1]) / ray[1];
  return t > 0 ? add(pose.eye, scale(ray, t)) : null;
}
