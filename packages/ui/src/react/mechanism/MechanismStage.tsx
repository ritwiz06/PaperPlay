import type { MechanismFrame } from "@paperplay/contracts";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { BaseEmphasis, Rect } from "../../stage-core/index.ts";
import type { StageDriver } from "../WorldStage.tsx";
import { MechanismCanvas } from "./MechanismCanvas.tsx";

/** What a generated world's stage draws: the latest frame its sandbox sent, or none yet. */
export interface MechanismStageInput {
  readonly frame: MechanismFrame | null;
}

export interface MechanismStageProps {
  readonly driver: StageDriver<MechanismStageInput, BaseEmphasis>;
  /** What the drawing shows, in words, for a screen reader. */
  readonly label: string;
  /** The stage's accessible name; "World stage" unless a page shows more than one. */
  readonly name?: string;
  /** The rectangle the HUD leaves free, in CSS pixels from the stage's top left: the drawing sits in it. */
  readonly window?: Rect | null;
  readonly onTogglePlay?: () => void;
  /** Called at most ten times a second while the world changes, never once per frame, and once after its last change. */
  readonly onReadout?: () => void;
}

/**
 * A generated world's stage (ADR-0058), as WorldStage is for a family's kit: each animation frame it
 * runs the driver's clock, and when there is something new it draws the latest frame the sandbox
 * sent in its kit. A frame still on its way leaves the last one on screen. It draws and never
 * measures; the readout the shell shows comes from the driver, not from the drawing.
 */
export function MechanismStage({ driver, label, name, window, onTogglePlay, onReadout }: MechanismStageProps) {
  const [frame, setFrame] = useState<MechanismFrame | null>(null);
  const latest = useRef({ driver, onReadout });
  useEffect(() => {
    latest.current = { driver, onReadout };
  });

  useEffect(() => {
    let handle = 0;
    let last = performance.now();
    let seen = -1;
    let told = 0;
    /** Whether the world changed since the readout was last told: a paused world's last change is told too. */
    let owed = false;
    const loop = (now: number) => {
      const seconds = Math.min(0.25, Math.max(0, (now - last) / 1000));
      last = now;
      const current = latest.current;
      current.driver.tick(seconds);
      const version = current.driver.version();
      if (version !== seen) {
        seen = version;
        owed = true;
        setFrame(current.driver.stageInput().frame);
      }
      if (owed && now - told >= 100) {
        told = now;
        owed = false;
        current.onReadout?.();
      }
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Keys pressed on the controls laid over the stage belong to those controls.
    if (event.target !== event.currentTarget || event.key !== " ") return;
    event.preventDefault();
    onTogglePlay?.();
  };
  const placed: CSSProperties = window ? { position: "absolute", left: window.x, top: window.y, width: window.width, height: window.height } : { position: "absolute", inset: 0 };

  return (
    <div className="stage stage-mechanism" role="application" aria-label={name ?? "World stage"} tabIndex={0} onKeyDown={onKeyDown} data-framing="overview">
      <div className="stage-view">
        <div className="stage-canvas" style={placed}>
          {frame ? <MechanismCanvas frame={frame} label={label} /> : <p className="stage-mechanism-wait">The module is starting in its sandbox.</p>}
        </div>
      </div>
    </div>
  );
}

/** The generated tier's mark: three bars of a module's own drawing, in the guide and the level card. */
export function MechanismMark({ size = 34 }: { readonly size?: number }) {
  return (
    <svg className="kit-mark" width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="15" fill="var(--lime)" stroke="var(--ink)" strokeWidth="2" />
      <rect x="10" y="15" width="3.5" height="9" rx="1" fill="var(--ink)" />
      <rect x="15.25" y="10" width="3.5" height="14" rx="1" fill="var(--ink)" />
      <rect x="20.5" y="13" width="3.5" height="11" rx="1" fill="var(--ink)" />
    </svg>
  );
}
