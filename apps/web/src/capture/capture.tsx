/**
 * The page `npm run capture:demo` films, at /capture.html. Only the dev server serves it:
 * the production build's one entry is index.html, so this page never ships. The stage fills
 * the window with nothing over it, and nothing moves on its own. The capture script asks for
 * each frame through window.paperplayCapture, and waits for the stage to draw it.
 */
import { flockDefaultParams } from "@paperplay/primitives";
import { WorldStage, type StageDriver } from "@paperplay/ui/react";
import { createRoot } from "react-dom/client";
import { LOCAL_ACTIONS } from "../world/local-world.ts";
import { createWorldSession } from "../world/session.ts";
import { DEMO, scriptDemo } from "./demo-script.ts";
import "@paperplay/ui/components.css";
import "./capture.css";

export interface CaptureFrame {
  readonly frame: number;
  readonly step: number;
}

export interface CaptureControl {
  readonly frames: number;
  readonly fps: number;
  /** Runs the next scripted frame, and resolves once the stage has drawn it. */
  next(): Promise<CaptureFrame>;
}

declare global {
  interface Window {
    paperplayCapture?: CaptureControl;
  }
}

const session = createWorldSession({ seed: DEMO.seed, params: flockDefaultParams, actions: LOCAL_ACTIONS });
const demo = scriptDemo(session);

// The stage draws whenever the session changes, and never advances it: tick takes no steps.
const driver: StageDriver = {
  tick: () => 0,
  stageInput: () => session.stageInput(),
  emphasis: () => ({}),
  version: () => session.version(),
};

const drawn = (): number => Number(document.querySelector<HTMLElement>(".stage")?.dataset["frames"] ?? 0);
const nextAnimationFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

window.paperplayCapture = {
  frames: DEMO.frames,
  fps: DEMO.fps,
  async next() {
    const before = drawn();
    const frame = demo.next();
    while (drawn() <= before) await nextAnimationFrame();
    return { frame, step: session.snapshot().step };
  },
};

const container = document.getElementById("root");
if (!container) throw new Error("the capture page needs a #root element to mount into");

// No StrictMode: its second mount in development would draw a frame the script did not ask for.
createRoot(container).render(
  <WorldStage driver={driver} label="Murmuration Valley: seed 4 forming a murmuration while a beacon is dragged through it." tool="look" />,
);
