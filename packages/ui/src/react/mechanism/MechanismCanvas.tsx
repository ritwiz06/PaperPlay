import type { MechanismFrame } from "@paperplay/contracts";
import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { drawMechanismFrame, kitLegend, type CanvasSize } from "./draw.ts";
import { mechanismPalette } from "./palette.ts";

export interface MechanismCanvasProps {
  /** The frame to draw, already parsed by the caller against its kit. */
  readonly frame: MechanismFrame;
  /** What the drawing shows, in words, for a screen reader. */
  readonly label: string;
  readonly className?: string;
}

const FRAME: CSSProperties = { display: "flex", flexDirection: "column", width: "100%", height: "100%", minHeight: 0 };
const HOST: CSSProperties = { position: "relative", flex: "1 1 auto", minHeight: 0 };
const CANVAS: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" };
/** Quiet words on the ground, at AA, under the drawing and never over it. */
const LEGEND: CSSProperties = {
  flex: "none",
  margin: 0,
  padding: "4px 14px 6px",
  background: mechanismPalette.ground,
  color: mechanismPalette.quiet,
  fontSize: "0.8125rem",
  lineHeight: 1.35,
  textAlign: "center",
};

/**
 * A generated mechanism's frame, drawn in its scene kit (ADR-0058). It fills its container and
 * draws each frame it is given exactly once, at the screen's pixel density. It never animates on
 * its own: every frame comes from the caller, so under reduced motion the caller sends fewer. A kit
 * that shades within each row, towers or a network, says so in a line under the drawing.
 */
export function MechanismCanvas({ frame, label, className }: MechanismCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useCanvasSize(host);
  const fonts = useFontsLoaded();
  const legendId = useId();
  const legend = kitLegend(frame.kit);

  useLayoutEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context || !size) return;
    const [width, height] = [Math.round(size.width * size.ratio), Math.round(size.height * size.ratio)];
    if (element.width !== width) element.width = width;
    if (element.height !== height) element.height = height;
    drawMechanismFrame(context, frame, size);
    // As the world stage does, the count of frames drawn, so a test can wait for a drawing without reading pixels.
    element.dataset.frames = String(Number(element.dataset.frames ?? 0) + 1);
  }, [frame, size, fonts]);

  return (
    <div className={className} style={FRAME}>
      <div ref={host} style={HOST} data-kit={frame.kit}>
        <canvas ref={canvas} role="img" aria-label={label} aria-describedby={legend ? legendId : undefined} style={CANVAS} />
      </div>
      {legend ? (
        <p id={legendId} className="mechanism-legend" style={LEGEND}>
          {legend}
        </p>
      ) : null}
    </div>
  );
}

/** The host's size in CSS pixels and the screen's pixel density, kept current as either changes. */
function useCanvasSize(host: RefObject<HTMLDivElement | null>): CanvasSize | null {
  const [size, setSize] = useState<CanvasSize | null>(null);
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    let density: MediaQueryList | null = null;
    const measure = (): void => {
      const { width, height } = element.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      setSize((last) => (last && last.width === width && last.height === height && last.ratio === ratio ? last : { width, height, ratio }));
      // A window dragged to another screen changes the density without changing the size.
      density?.removeEventListener("change", measure);
      density = window.matchMedia(`(resolution: ${ratio}dppx)`);
      density.addEventListener("change", measure);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
      density?.removeEventListener("change", measure);
    };
  }, [host]);
  return size;
}

/** Counts the font loads, so labels drawn before the interface face arrived are drawn again in it. */
function useFontsLoaded(): number {
  const [loads, setLoads] = useState(0);
  useLayoutEffect(() => {
    const fonts = document.fonts;
    let live = true;
    const loaded = (): void => {
      if (live) setLoads((count) => count + 1);
    };
    void fonts.ready.then(loaded);
    fonts.addEventListener("loadingdone", loaded);
    return () => {
      live = false;
      fonts.removeEventListener("loadingdone", loaded);
    };
  }, []);
  return loads;
}
