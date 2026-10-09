import type { Origin } from "@paperplay/contracts";
import { useEffect, useId, useState } from "react";
import { BirdMark, OriginTag } from "./hud-parts.tsx";

export interface GuideLine {
  readonly text: string;
  readonly origin: Origin;
}

export interface GuideProps {
  /** What the guide says now: what the learner did, then what was measured. */
  readonly lines: readonly GuideLine[];
  /** Changes whenever the learner acts; each change shows the guide again. */
  readonly cue: number;
  /** How long the guide stays before it fades, in milliseconds. */
  readonly showFor?: number;
  /** Gives way to another card, such as What if: the bubble hides and its icon stays, so nothing reframes. */
  readonly quiet?: boolean;
}

/** About six seconds: long enough to read two short sentences, short enough to give the world back. */
export const GUIDE_SHOW_MS = 6000;

/**
 * The guide (ADR-0008): one or two sentences about what the learner just did, each with its
 * origin. It appears after an interaction and fades after about 6 s; its icon brings back the
 * last thing it said. Under reduced motion it appears and disappears without animation (CSS).
 */
export function Guide({ lines, cue, showFor = GUIDE_SHOW_MS, quiet = false }: GuideProps) {
  const id = useId();
  const [seenCue, setSeenCue] = useState(cue);
  const [open, setOpen] = useState(false);
  // A new cue opens the guide. Adjusting state while rendering, when a prop changes, is React's
  // own pattern for this; an effect would draw one frame with the guide still closed.
  if (cue !== seenCue) {
    setSeenCue(cue);
    setOpen(true);
  }
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setOpen(false), showFor);
    return () => window.clearTimeout(timer);
  }, [open, seenCue, showFor]);

  const shown = open && !quiet;
  return (
    <div className="guide" data-open={shown ? "true" : "false"}>
      <button
        type="button"
        className="guide-icon"
        aria-expanded={shown}
        aria-controls={id}
        aria-label={shown ? "Hide the guide" : "Show what the guide said last"}
        data-hud
        data-hud-frame
        onClick={() => setOpen(!shown)}
      >
        <BirdMark size={40} />
      </button>
      <div id={id} className="card guide-bubble" data-hud={shown ? "" : undefined} role="group" aria-label="Guide">
        <ul aria-live="polite">
          {lines.map((line) => (
            <li key={`${line.origin}:${line.text}`}>
              <OriginTag origin={line.origin} quiet /> <span>{line.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
