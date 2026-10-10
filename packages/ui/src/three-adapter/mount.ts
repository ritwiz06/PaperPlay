import * as THREE from "three";
import type { BaseFrame } from "../stage-core/index.ts";
import { applyFrame } from "./apply-frame.ts";
import { createStageScene, type ThreeKit } from "./scene.ts";

export interface WebGLStage<Frame extends BaseFrame = BaseFrame> {
  readonly kind: "webgl";
  readonly canvas: HTMLCanvasElement;
  viewport(): { width: number; height: number };
  render(frame: Frame): void;
  dispose(): void;
}

export interface FallbackStage {
  readonly kind: "fallback";
  readonly element: HTMLElement;
  dispose(): void;
}

export type MountedStage<Frame extends BaseFrame = BaseFrame> = WebGLStage<Frame> | FallbackStage;

/** True when this browser can create a WebGL2 context, which Three.js needs. */
export function webgl2Available(doc: Document): boolean {
  try {
    const gl = doc.createElement("canvas").getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}

function fallback(doc: Document, words: string): HTMLElement {
  const section = doc.createElement("section");
  section.className = "stage-fallback";
  section.setAttribute("aria-labelledby", "stage-fallback-title");
  const title = doc.createElement("h2");
  title.id = "stage-fallback-title";
  title.textContent = "This world needs WebGL";
  const why = doc.createElement("p");
  why.textContent = words;
  const next = doc.createElement("p");
  next.textContent =
    "Turning on hardware acceleration in your browser settings usually fixes this. Otherwise, open PaperPlay in a current version of Chrome, Edge, Firefox or Safari.";
  section.append(title, why, next);
  return section;
}

export interface StageOptions<Frame extends BaseFrame = BaseFrame> {
  /** What the canvas shows, for people who cannot see it. */
  readonly label: string;
  /** The scene kit's Three.js half, which draws the frames this stage is given. */
  readonly kit: ThreeKit<object, Frame>;
  /** Called after the canvas changes size, for callers that do not redraw every frame. */
  readonly onResize?: () => void;
}

/** What the stage says when the browser takes its WebGL context away, with a way back. */
function lostNotice(doc: Document, words: string, onReload: () => void): HTMLElement {
  const section = doc.createElement("section");
  section.className = "stage-lost";
  section.setAttribute("aria-labelledby", "stage-lost-title");
  const title = doc.createElement("h2");
  title.id = "stage-lost-title";
  title.textContent = "The world stopped drawing";
  const why = doc.createElement("p");
  why.setAttribute("role", "status");
  why.textContent = words;
  const reload = doc.createElement("button");
  reload.type = "button";
  reload.className = "btn";
  reload.textContent = "Tap to reload the world";
  reload.addEventListener("click", onReload);
  section.append(title, why, reload);
  // A tap on the notice is not a tap on the world: it must not place, pick or orbit anything.
  for (const type of ["pointerdown", "pointerup", "wheel"]) section.addEventListener(type, (event) => event.stopPropagation());
  return section;
}

/**
 * Puts a WebGL canvas in `container`, or a clear explanation when WebGL is unavailable. If the
 * browser takes the context away, the stage says so and offers to reload the world; if the
 * browser gives it back first, drawing resumes on its own. Either way the scene is kept, and
 * nothing about the run changes.
 */
export function mountStage<Frame extends BaseFrame>(container: HTMLElement, options: StageOptions<Frame>): MountedStage<Frame> {
  const doc = container.ownerDocument;
  if (!webgl2Available(doc)) {
    const element = fallback(doc, options.kit.words.fallback);
    container.replaceChildren(element);
    return { kind: "fallback", element, dispose: () => element.remove() };
  }

  const stage = createStageScene(options.kit);
  let disposed = false;
  let notice: HTMLElement | null = null;
  const status = (value: "drawing" | "lost" | "restored" | "reloaded") => {
    container.dataset.context = value;
  };
  const hideNotice = () => {
    notice?.remove();
    notice = null;
  };

  const create = (): { renderer: THREE.WebGLRenderer; canvas: HTMLCanvasElement } => {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(doc.defaultView?.devicePixelRatio ?? 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const canvas = renderer.domElement;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", options.label);
    // Three.js keeps its scene through a loss and rebuilds its GL state when the context returns.
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      if (disposed) return;
      status("lost");
      if (!notice) container.append((notice = lostNotice(doc, options.kit.words.lost, reload)));
    });
    canvas.addEventListener("webglcontextrestored", () => {
      if (disposed) return;
      hideNotice();
      status("restored");
      options.onResize?.();
    });
    return { renderer, canvas };
  };

  let { renderer, canvas } = create();
  container.replaceChildren(canvas);
  status("drawing");

  const viewport = () => ({ width: container.clientWidth, height: container.clientHeight });
  const resize = () => {
    const { width, height } = viewport();
    if (width > 0 && height > 0) renderer.setSize(width, height, false);
    options.onResize?.();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  /** A new renderer and canvas for the same scene, when the old context does not come back. */
  function reload(): void {
    renderer.dispose();
    canvas.remove();
    ({ renderer, canvas } = create());
    container.prepend(canvas);
    hideNotice();
    status("reloaded");
    resize();
    // The button that was pressed is gone: keyboard focus goes back to the stage it reloaded.
    container.closest<HTMLElement>("[tabindex]")?.focus({ preventScroll: true });
  }

  return {
    kind: "webgl",
    get canvas() {
      return canvas;
    },
    viewport,
    render(frame) {
      applyFrame(stage, frame);
      if (!renderer.getContext().isContextLost()) renderer.render(stage.scene, stage.camera);
    },
    dispose() {
      disposed = true;
      observer.disconnect();
      hideNotice();
      stage.dispose();
      renderer.dispose();
      // Release the WebGL context now, not when the garbage collector gets to it: a fork mounts
      // two stages, and contexts left waiting made each later mount slower (2026-10-09).
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
