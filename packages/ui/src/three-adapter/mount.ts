import * as THREE from "three";
import type { FrameDescription } from "../stage-core/index.ts";
import { applyFrame } from "./apply-frame.ts";
import { createStageScene } from "./scene.ts";

export interface WebGLStage {
  readonly kind: "webgl";
  readonly canvas: HTMLCanvasElement;
  viewport(): { width: number; height: number };
  render(frame: FrameDescription): void;
  dispose(): void;
}

export interface FallbackStage {
  readonly kind: "fallback";
  readonly element: HTMLElement;
  dispose(): void;
}

export type MountedStage = WebGLStage | FallbackStage;

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

function fallback(doc: Document): HTMLElement {
  const section = doc.createElement("section");
  section.className = "stage-fallback";
  section.setAttribute("aria-labelledby", "stage-fallback-title");
  const title = doc.createElement("h2");
  title.id = "stage-fallback-title";
  title.textContent = "This world needs WebGL";
  const why = doc.createElement("p");
  why.textContent =
    "Your browser has WebGL turned off or cannot start it, so the valley and its flock cannot be drawn here. The flock's rules and measurements do not depend on drawing it.";
  const next = doc.createElement("p");
  next.textContent =
    "Turning on hardware acceleration in your browser settings usually fixes this. Otherwise, open PaperPlay in a current version of Chrome, Edge, Firefox or Safari.";
  section.append(title, why, next);
  return section;
}

export interface StageOptions {
  /** What the canvas shows, for people who cannot see it. */
  readonly label: string;
  /** Called after the canvas changes size, for callers that do not redraw every frame. */
  readonly onResize?: () => void;
}

/** Puts a WebGL canvas in `container`, or a clear explanation when WebGL is unavailable. */
export function mountStage(container: HTMLElement, options: StageOptions): MountedStage {
  const doc = container.ownerDocument;
  if (!webgl2Available(doc)) {
    const element = fallback(doc);
    container.replaceChildren(element);
    return { kind: "fallback", element, dispose: () => element.remove() };
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(doc.defaultView?.devicePixelRatio ?? 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", options.label);
  container.replaceChildren(canvas);

  const stage = createStageScene();
  const viewport = () => ({ width: container.clientWidth, height: container.clientHeight });
  const resize = () => {
    const { width, height } = viewport();
    if (width > 0 && height > 0) renderer.setSize(width, height, false);
    options.onResize?.();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  return {
    kind: "webgl",
    canvas,
    viewport,
    render(frame) {
      applyFrame(stage, frame);
      renderer.render(stage.scene, stage.camera);
    },
    dispose() {
      observer.disconnect();
      stage.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
