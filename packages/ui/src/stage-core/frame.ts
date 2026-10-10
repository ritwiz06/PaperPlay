/**
 * What every frame holds, whichever scene kit draws it (ADR-0026): the camera, the box the
 * world is drawn in, the palette and flat rings. A kit adds its own layers beside these, as plain
 * data, and its Three.js half draws them. Presentation only: nothing here flows back into a
 * simulation, and nothing here knows what the world is a world of.
 */
import { FAR, FULL_WINDOW, NEAR, poseOf, projectionMatrix, viewMatrix, type OrbitCamera, type ViewWindow } from "./camera.ts";
import type { StagePalette } from "./palettes.ts";
import type { Mat4, Vec3 } from "./vec.ts";

export interface FrameCamera {
  readonly eye: Vec3;
  readonly target: Vec3;
  readonly up: Vec3;
  readonly fovDeg: number;
  readonly aspect: number;
  readonly near: number;
  readonly far: number;
  readonly view: Mat4;
  readonly projection: Mat4;
  /** The part of the canvas the view is framed in. */
  readonly window: ViewWindow;
}

/** The box a kit's world is drawn in, centred on the origin: its ground's width and depth, and the height its things are drawn at. */
export interface FieldBox {
  readonly width: number;
  readonly depth: number;
  readonly altitude: number;
}

/** A flat ring on the stage, by a key the kit chooses: how far a picked thing reaches, the keyboard cursor, a spread. */
export interface RingPose {
  readonly key: string;
  readonly position: Vec3;
  readonly radius: number;
  readonly color: string;
}

/** The part of every frame the stage itself draws: camera, field, palette and rings. It holds no simulation state. */
export interface BaseFrame<P extends StagePalette = StagePalette> {
  readonly camera: FrameCamera;
  readonly field: FieldBox;
  readonly palette: P;
  readonly rings: readonly RingPose[];
}

/** Everything a renderer needs for one frame, as plain data: the stage's part and the kit's own layers. */
export type FrameDescription<Layers extends object = object, P extends StagePalette = StagePalette> = BaseFrame<P> & Layers;

/** A frame's camera: the orbit camera's pose about its target, its matrices, and the window it is framed in. */
export function frameCamera(camera: OrbitCamera, target: Vec3): FrameCamera {
  const pose = poseOf(camera, target);
  return {
    eye: pose.eye,
    target: pose.target,
    up: pose.up,
    fovDeg: camera.fovDeg,
    aspect: camera.aspect,
    near: NEAR,
    far: FAR,
    view: viewMatrix(pose),
    projection: projectionMatrix(camera),
    window: camera.window ?? FULL_WINDOW,
  };
}

/** What any stage may emphasise, whatever its kit: the keyboard cursor, in simulation coordinates. */
export interface BaseEmphasis {
  readonly cursor?: { readonly x: number; readonly y: number } | null;
}

/** A point on the ground in simulation coordinates, and the size of the ground it lies on. */
export interface GroundPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * A scene kit's pure half (ADR-0026): how one family's state becomes a frame. It decides what the
 * world looks like and never measures anything; drawing any kit, or none, leaves every observable
 * bit for bit the same (R02). Its Three.js half draws the frames it describes, and its React half
 * shows its readouts.
 */
export interface StageKit<Input, Emphasis extends BaseEmphasis, Look, Frame extends BaseFrame> {
  /** The scene kit's id, as a WorldSpec's design names it. */
  readonly id: string;
  /** The palette the stage draws in unless told otherwise. */
  readonly palette: Frame["palette"];
  /** Where the camera looks when it has no target of its own, in world coordinates. */
  readonly defaultTarget: Vec3;
  /** Whether the world wraps round at its edges, so a following camera takes the short way. */
  readonly wraps: boolean;
  /** (state, camera, palette, emphasis, look) → frame. Pure: it reads its inputs and writes nothing. */
  describe(input: Input, camera: OrbitCamera, palette: Frame["palette"], emphasis?: Emphasis, look?: Look): Frame;
  /** The ground the input's world covers, in simulation units. */
  extent(input: Input): { readonly width: number; readonly height: number };
  /** Where a following camera looks, on the ground in simulation coordinates; null to stay where it is. */
  focus(input: Input): GroundPoint | null;
  /** The pickable thing drawn nearest a screen point, by index, or null. */
  pick?(frame: Frame, ndc: readonly [number, number]): number | null;
  /** The pickable thing drawn nearest a point on the ground, for the keyboard cursor. */
  nearest?(frame: Frame, point: GroundPoint): number | null;
  /** The look's name, for the stage's `data-look`. */
  lookName(look: Look | undefined): string;
  /** Data attributes the stage sets from a frame, for tests and tools: presentation only. */
  marks?(frame: Frame): Readonly<Record<string, string>>;
}
