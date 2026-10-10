import type { Origin } from "@paperplay/contracts";
import { useEffect, useId, useRef, useState } from "react";
import { OriginTag, type KitMark } from "./hud-parts.tsx";

export interface GuideLine {
  readonly text: string;
  readonly origin: Origin;
  /** A paper-derived line whose passage has not been mapped yet. */
  readonly placeholder?: boolean;
}

/** A question the guide asks, with its choices: framing, never scored. */
export interface GuideAsk {
  readonly prompt: string;
  readonly choices: readonly string[];
  readonly onChoose: (index: number) => void;
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
  /** A question to ask instead: the bubble stays open, with a button for each choice, until one is chosen. */
  readonly ask?: GuideAsk | null;
  /** The world's scene kit's mark, which the guide wears. */
  readonly mark: KitMark;
}

/** About six seconds: long enough to read two short sentences, short enough to give the world back. */
export const GUIDE_SHOW_MS = 6000;

/**
 * The guide (ADR-0008): one or two sentences about what the learner just did, each with its
 * origin. It appears after an interaction and fades after about 6 s; its icon brings back the
 * last thing it said. Under reduced motion it appears and disappears without animation (CSS).
 */
export function Guide({ lines, cue, showFor = GUIDE_SHOW_MS, quiet = false, ask = null, mark: Mark }: GuideProps) {
  const id = useId();
  const firstChoice = useRef<HTMLButtonElement>(null);
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

  // A question takes the keyboard to its first choice, so it can be answered at once.
  const asking = ask !== null;
  useEffect(() => {
    if (asking) firstChoice.current?.focus({ preventScroll: true });
  }, [asking]);

  const shown = asking || (open && !quiet);
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
        <Mark size={40} />
      </button>
      <div id={id} className="card guide-bubble" data-hud={shown ? "" : undefined} role="group" aria-label="Guide">
        {ask ? (
          <div className="guide-ask">
            <p id={`${id}-ask`}>
              <OriginTag origin="teaching-choice" quiet /> <span>{ask.prompt}</span>
            </p>
            <div className="guide-choices" role="group" aria-labelledby={`${id}-ask`}>
              {ask.choices.map((choice, index) => (
                <button key={choice} ref={index === 0 ? firstChoice : undefined} type="button" className="btn btn-light" onClick={() => ask.onChoose(index)}>
                  {choice}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <GuideLines lines={lines} />
        )}
      </div>
    </div>
  );
}

/** The guide's lines, each with its origin. */
export function GuideLines({ lines }: { readonly lines: readonly GuideLine[] }) {
  return (
    <ul aria-live="polite">
      {lines.map((line) => (
        <li key={`${line.origin}:${line.text}`}>
          <OriginTag origin={line.origin} placeholder={line.placeholder ?? false} quiet /> <span>{line.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** The guide as a note inside a card, such as the fork's: the same lines, without the bubble. */
export function GuideNote({ lines, mark: Mark }: { readonly lines: readonly GuideLine[]; readonly mark: KitMark }) {
  return (
    <div className="guide-note" role="group" aria-label="Guide">
      <Mark size={32} />
      <GuideLines lines={lines} />
    </div>
  );
}
