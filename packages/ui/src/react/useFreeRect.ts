import { useEffect, useState, type RefObject } from "react";
import { largestFreeRect, type Rect } from "../stage-core/index.ts";

/** How far the field keeps from the HUD's cards, in CSS pixels. */
export const HUD_MARGIN = 12;

const sameRect = (a: Rect | null, b: Rect): boolean =>
  a !== null && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;

/**
 * The rectangle of `container` that its resting HUD leaves free: every descendant marked
 * `data-hud-frame` counts, overlays such as the guide's bubble and the journal do not. It is
 * measured again whenever the container or one of those elements changes size.
 */
export function useFreeRect(container: RefObject<HTMLElement | null>, margin = HUD_MARGIN): Rect | null {
  const [free, setFree] = useState<Rect | null>(null);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => {
      const box = element.getBoundingClientRect();
      const hud = [...element.querySelectorAll<HTMLElement>("[data-hud-frame]")]
        .map((part) => part.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => ({ x: rect.left - box.left, y: rect.top - box.top, width: rect.width, height: rect.height }));
      const next = largestFreeRect({ width: box.width, height: box.height }, hud, margin);
      setFree((current) => (sameRect(current, next) ? current : next));
    };
    // A ResizeObserver reports each element once when it starts observing, so this also measures at mount.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const part of element.querySelectorAll("[data-hud-frame]")) observer.observe(part);
    return () => observer.disconnect();
  }, [container, margin]);
  return free;
}
