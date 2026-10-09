import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import {
  DEFAULT_CAMERA,
  describeFrame,
  fieldBoundsOnScreen,
  FLIGHT_ALTITUDE,
  flockCentre,
  groundPointAt,
  nearestBird,
  orbit,
  pickBird,
  projectToNdc,
  readoutDue,
  valleyDay,
  windowFromRect,
  withViewport,
  zoom,
  type FrameDescription,
  type FrameEmphasis,
  type FrameLook,
  type OrbitCamera,
  type Rect,
  type StageInput,
  type StagePalette,
  type Vec3,
} from "../stage-core/index.ts";
import { mountStage, type WebGLStage } from "../three-adapter/index.ts";

/** What the stage draws from. The app owns the run; the stage only advances it and draws its states. */
export interface StageDriver {
  /** Takes the whole fixed steps this much wall time allows; returns how many. */
  tick(frameSeconds: number): number;
  stageInput(): StageInput;
  emphasis(): FrameEmphasis;
  /** Changes whenever there is something new to draw. */
  version(): number;
}

/** What a click, or Enter at the keyboard cursor, does on the stage. */
export type StageTool = "look" | "beacon" | "obstacle" | "bird";

export interface WorldStageProps {
  readonly driver: StageDriver;
  /** What the canvas shows, for people who cannot see it. */
  readonly label: string;
  readonly tool: StageTool;
  readonly palette?: StagePalette;
  readonly onGround?: (tool: "beacon" | "obstacle", point: { readonly x: number; readonly y: number }) => void;
  readonly onBird?: (index: number | null) => void;
  readonly onTogglePlay?: () => void;
  /** Called at most ten times a second while the world changes, never once per frame. */
  readonly onReadout?: () => void;
  /**
   * The rectangle of the stage, in CSS pixels from its top left, that a HUD leaves free. The
   * view is framed in it while the canvas still fills the stage (ADR-0008). Render-only.
   */
  readonly window?: Rect | null;
  /** Called at most ten times a second when the camera turns, with its yaw, for a compass. */
  readonly onView?: (view: { readonly yaw: number }) => void;
  /** How the flock looks: one colour, or a colour per heading. Render-only. */
  readonly look?: FrameLook;
  /**
   * "overview" frames the whole field and holds still. "follow" comes closer, eases toward
   * the flock's centre and drifts slowly round it when left alone; under reduced motion it is
   * the overview. Render-only.
   */
  readonly framing?: "overview" | "follow";
  /** Controls laid over the stage, such as tools and the transport. */
  readonly children?: ReactNode;
}

const ORBIT_PER_PIXEL = 0.006;
/** The following camera stands at this share of the overview's distance, looking down this steeply. */
const FOLLOW_ZOOM = 0.75;
const FOLLOW_PITCH = 0.68;
/** It closes most of the gap to the flock's centre in about this many seconds. */
const FOLLOW_EASE_SECONDS = 1.6;
/** It never looks further than this from the field's middle, in world units from each edge. */
const FOLLOW_INSET = 5;
/** After this long without a touch, it drifts round the flock at this rate. */
const IDLE_MS = 6000;
const DRIFT_PER_SECOND = 0.035;
const KEY_ORBIT = 0.08;
const KEY_ZOOM = 0.9;
/** A press that moves less than this many pixels is a click, not a drag. */
const CLICK_SLOP = 5;

const HINTS: Readonly<Record<StageTool, string>> = {
  look: "Drag, or use the arrow keys, to look around. Scroll, or press + and −, to zoom. Space plays and pauses.",
  beacon: "Click the field to place a beacon, or move the cursor with the arrow keys and press Enter.",
  obstacle: "Click the field to place an obstacle, or move the cursor with the arrow keys and press Enter.",
  bird: "Click a bird to pick it, or move the cursor with the arrow keys and press Enter. Escape lets it go.",
};

interface ViewState {
  camera: OrbitCamera;
  dirty: boolean;
  frame: FrameDescription | null;
  stage: WebGLStage | null;
  cursor: { x: number; y: number } | null;
  /** The cursor shows only while the stage has focus and the keyboard is in use. */
  keyboard: boolean;
  focused: boolean;
  drag: { x: number; y: number; moved: number; id: number } | null;
  /** When the learner last turned, zoomed or pressed a key on the stage, for the idle drift. */
  lastInput: number;
}

const clamp = (value: number, size: number): number => Math.min(Math.max(value, 0), size - 1e-3);
const roundRect = ({ x, y, width, height }: Rect): Rect => ({
  x: Math.round(x * 10) / 10,
  y: Math.round(y * 10) / 10,
  width: Math.round(width * 10) / 10,
  height: Math.round(height * 10) / 10,
});

/**
 * The world stage: a Three.js canvas over the run, with orbit and zoom by pointer and by
 * keyboard, and a click (or Enter) that places or picks. It draws on its own animation loop and
 * reports readouts at most ten times a second. It never reads or changes the simulation itself.
 */
export function WorldStage(props: WorldStageProps) {
  const { driver, label, tool, children } = props;
  const host = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  const view = useRef<ViewState>({
    camera: DEFAULT_CAMERA,
    dirty: true,
    frame: null,
    stage: null,
    cursor: null,
    keyboard: false,
    focused: false,
    drag: null,
    lastInput: 0,
  });

  useEffect(() => {
    latest.current = props;
    view.current.dirty = true;
  });

  useEffect(() => {
    const element = host.current;
    const target = canvasHost.current;
    if (!element || !target) return;
    const state = view.current;
    const stage = mountStage(target, { label, onResize: () => void (state.dirty = true) });
    element.dataset.webgl = stage.kind === "webgl" ? "on" : "off";
    if (stage.kind === "fallback") return () => stage.dispose();
    state.stage = stage;

    const follow = latest.current.framing === "follow" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (follow) state.camera = { ...zoom(state.camera, FOLLOW_ZOOM), pitch: FOLLOW_PITCH };
    state.lastInput = performance.now();
    let shownFocus = "";

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      state.lastInput = performance.now();
      state.camera = zoom(state.camera, Math.exp(event.deltaY * 0.0015));
      state.dirty = true;
    };
    element.addEventListener("wheel", onWheel, { passive: false });

    let handle = 0;
    let last: number | null = null;
    let readAt: number | null = null;
    let drawn = -1;
    let reported = -1;
    let viewAt: number | null = null;
    let reportedYaw = Number.NaN;
    let shownBounds = "";
    let shownFree = "";
    let frames = 0;
    const loop = (now: number) => {
      const frameSeconds = last === null ? 0 : (now - last) / 1000;
      const steps = driver.tick(frameSeconds);
      last = now;
      if (follow && frameSeconds > 0) {
        // Ease toward the flock's centre, taking the short way round the world.
        const { current } = driver.stageInput();
        const centre = flockCentre(current);
        const from = state.camera.target ?? ([0, FLIGHT_ALTITUDE / 2, 0] as Vec3);
        const nearest = (value: number, size: number) => value - size * Math.round(value / size);
        const limit = (value: number, size: number) => Math.min(Math.max(value, -size / 2 + FOLLOW_INSET), size / 2 - FOLLOW_INSET);
        const towardX = limit(from[0] + nearest(centre.x - current.width / 2 - from[0], current.width), current.width);
        const towardZ = limit(from[2] + nearest(centre.y - current.height / 2 - from[2], current.height), current.height);
        const share = 1 - Math.exp(-Math.min(frameSeconds, 0.1) / FOLLOW_EASE_SECONDS);
        const target: Vec3 = [from[0] + (towardX - from[0]) * share, from[1], from[2] + (towardZ - from[2]) * share];
        let yaw = state.camera.yaw;
        if (now - state.lastInput > IDLE_MS) yaw += DRIFT_PER_SECOND * Math.min(frameSeconds, 0.1);
        if (Math.abs(target[0] - from[0]) + Math.abs(target[2] - from[2]) > 1e-5 || yaw !== state.camera.yaw) {
          state.camera = { ...state.camera, target, yaw };
          state.dirty = true;
        }
      }
      const version = driver.version();
      if (steps > 0 || version !== drawn || state.dirty) {
        const { width, height } = stage.viewport();
        const { tool: active, palette, window: free } = latest.current;
        state.camera = { ...withViewport(state.camera, width, height), window: windowFromRect({ width, height }, free) };
        const cursor = state.keyboard && state.focused && active !== "look" ? state.cursor : null;
        state.frame = describeFrame(driver.stageInput(), state.camera, palette ?? valleyDay, { ...driver.emphasis(), cursor }, latest.current.look);
        stage.render(state.frame);
        // Where the field lands, for tests and tools that check the HUD-aware fit.
        const bounds = JSON.stringify(roundRect(fieldBoundsOnScreen(state.frame, { width, height })));
        const freeText = JSON.stringify(free ? roundRect(free) : { x: 0, y: 0, width, height });
        if (bounds !== shownBounds) element.dataset.fieldBounds = shownBounds = bounds;
        if (freeText !== shownFree) element.dataset.freeRect = shownFree = freeText;
        const [fx, fy] = projectToNdc(state.frame.camera.view, state.frame.camera.projection, state.frame.camera.target);
        const focus = JSON.stringify({ x: Math.round(((fx + 1) / 2) * width * 10) / 10, y: Math.round(((1 - fy) / 2) * height * 10) / 10 });
        if (focus !== shownFocus) element.dataset.focus = shownFocus = focus;
        drawn = version;
        state.dirty = false;
        frames += 1;
        element.dataset.frames = String(frames);
      }
      if (version !== reported && readoutDue(readAt, now / 1000)) {
        readAt = now / 1000;
        reported = version;
        latest.current.onReadout?.();
      }
      if (state.camera.yaw !== reportedYaw && readoutDue(viewAt, now / 1000)) {
        viewAt = now / 1000;
        reportedYaw = state.camera.yaw;
        latest.current.onView?.({ yaw: reportedYaw });
      }
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(handle);
      element.removeEventListener("wheel", onWheel);
      state.stage = null;
      state.frame = null;
      stage.dispose();
    };
  }, [driver, label]);

  const act = (at: { readonly ndc: readonly [number, number] } | { readonly ground: { readonly x: number; readonly y: number } }) => {
    const frame = view.current.frame;
    if (!frame) return;
    if (tool === "beacon" || tool === "obstacle") {
      const point = "ndc" in at ? groundPointAt(frame, at.ndc) : at.ground;
      if (point) props.onGround?.(tool, point);
    } else if (tool === "bird") {
      props.onBird?.("ndc" in at ? pickBird(frame, at.ndc) : nearestBird(frame, at.ground));
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    view.current.lastInput = performance.now();
    view.current.keyboard = false;
    view.current.dirty = true;
    view.current.drag = { x: event.clientX, y: event.clientY, moved: 0, id: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = view.current.drag;
    if (!drag || drag.id !== event.pointerId) return;
    const [dx, dy] = [event.clientX - drag.x, event.clientY - drag.y];
    Object.assign(drag, { x: event.clientX, y: event.clientY, moved: drag.moved + Math.abs(dx) + Math.abs(dy) });
    view.current.camera = orbit(view.current.camera, -dx * ORBIT_PER_PIXEL, dy * ORBIT_PER_PIXEL);
    view.current.dirty = true;
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const drag = view.current.drag;
    view.current.drag = null;
    const canvas = view.current.stage?.canvas;
    if (!drag || drag.id !== event.pointerId || drag.moved >= CLICK_SLOP || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    act({ ndc: [((event.clientX - rect.left) / rect.width) * 2 - 1, 1 - ((event.clientY - rect.top) / rect.height) * 2] });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Keys pressed on the controls laid over the stage belong to those controls.
    if (event.target !== event.currentTarget) return;
    const state = view.current;
    const field = state.frame?.field;
    const cursor = state.cursor ?? (field ? { x: field.width / 2, y: field.depth / 2 } : null);
    const arrows: Readonly<Record<string, readonly [number, number]>> = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const arrow = arrows[event.key];
    if (event.key === " ") {
      props.onTogglePlay?.();
    } else if (event.key === "+" || event.key === "=") {
      state.camera = zoom(state.camera, KEY_ZOOM);
    } else if (event.key === "-" || event.key === "_") {
      state.camera = zoom(state.camera, 1 / KEY_ZOOM);
    } else if (arrow && tool === "look") {
      state.camera = orbit(state.camera, -arrow[0] * KEY_ORBIT, arrow[1] * (KEY_ORBIT / 2));
    } else if (arrow && cursor && field) {
      // Arrows move the cursor across the ground as the camera sees it: up is away from the viewer.
      const { yaw } = state.camera;
      const step = event.shiftKey ? 4 : 1;
      const [right, forward] = arrow;
      state.cursor = {
        x: clamp(cursor.x + step * (right * Math.cos(yaw) - forward * Math.sin(yaw)), field.width),
        y: clamp(cursor.y + step * (-right * Math.sin(yaw) - forward * Math.cos(yaw)), field.depth),
      };
    } else if (event.key === "Enter" && cursor && tool !== "look") {
      state.cursor = cursor;
      act({ ground: cursor });
    } else if (event.key === "Escape" && tool === "bird") {
      props.onBird?.(null);
    } else {
      return;
    }
    event.preventDefault();
    state.keyboard = true;
    state.dirty = true;
    state.lastInput = performance.now();
  };

  return (
    <div
      ref={host}
      className="stage"
      data-tool={tool}
      data-look={props.look?.birdColor ?? "plain"}
      data-framing={props.framing ?? "overview"}
      role="application"
      aria-label="World stage"
      aria-describedby="stage-keys"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        if (event.target === event.currentTarget) Object.assign(view.current, { focused: true, dirty: true });
      }}
      onBlur={(event) => {
        if (event.target === event.currentTarget) Object.assign(view.current, { focused: false, dirty: true });
      }}
    >
      <div className="stage-view">
        <div
          ref={canvasHost}
          className="stage-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => void (view.current.drag = null)}
        />
        {children}
      </div>
      <p id="stage-keys" className="stage-keys">
        {HINTS[tool]}
      </p>
    </div>
  );
}
