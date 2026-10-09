import type { Origin } from "@paperplay/contracts";
import { useId, useState, type ReactNode, type Ref } from "react";
import { BookIcon, ChevronIcon, DepthToggle, OriginTag, type Depth } from "./hud-parts.tsx";

/** The level's one manipulable control, already bound to its action: the card only displays and reports. */
export interface LevelControl {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** The engine's current value, not the slider's own. */
  readonly value: number;
  readonly unit: string;
  /** Words for the two ends, shown at Beginner instead of numbers. */
  readonly ends: readonly [string, string];
  /** Where the rule this control moves comes from. */
  readonly origin: Origin;
  /** A paper-derived rule whose passage has not been mapped yet. */
  readonly placeholder?: boolean;
  /** Whether the control has a passage to open the journal at. */
  readonly anchored: boolean;
}

export interface LevelCardProps {
  /** "Level 1 of 6". */
  readonly kicker: string;
  readonly title: string;
  /** One sentence: what to do here. */
  readonly goal: string;
  readonly control: LevelControl;
  readonly depth: Depth;
  readonly onDepth: (depth: Depth) => void;
  readonly onChange: (value: number) => void;
  readonly onControlFocus?: () => void;
  /** Opens the journal at the control's passage; `from` gets focus back when it closes. */
  readonly onFromPaper: (from: HTMLElement) => void;
  /** The level's observable: the heading compass in the flocking world. */
  readonly readout: ReactNode;
  /** Shown at Advanced only: the rule as its equation. */
  readonly advanced?: ReactNode;
  readonly whatIfOpen: boolean;
  readonly whatIfId: string;
  readonly onWhatIf: () => void;
  readonly sliderRef?: Ref<HTMLInputElement>;
}

const decimalsOf = (step: number): number => Math.max(0, -Math.floor(Math.log10(step) + 1e-9));

/**
 * The level card (ADR-0008): the level's title, a one-sentence goal, its one control and a
 * "What if" button, with the depth toggle and the level's live readout. On a phone it rests as
 * one compact row (title, slider, readout, What if) and a chevron opens the rest.
 */
export function LevelCard(props: LevelCardProps) {
  const { kicker, title, goal, control, depth, onDepth, onChange, onControlFocus, onFromPaper, readout, advanced, whatIfOpen, whatIfId, onWhatIf, sliderRef } = props;
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const sliderId = `${id}-control`;
  const numbers = depth !== "beginner";
  const shown = control.value.toFixed(decimalsOf(control.step));
  const fromPaperLabel = control.anchored ? `From the paper: ${control.label}` : `${control.label} is not from the paper`;
  const fromPaper = (compact: boolean) =>
    control.anchored ? (
      <button
        type="button"
        className={compact ? "from-paper from-paper-compact" : "from-paper"}
        aria-label={compact ? fromPaperLabel : undefined}
        onClick={(event) => onFromPaper(event.currentTarget)}
      >
        <BookIcon />
        {compact ? null : " From the paper"}
      </button>
    ) : compact ? null : (
      <span className="not-from-paper">Not from the paper: chosen to help you learn</span>
    );

  return (
    <section className="card level-card" aria-labelledby={`${id}-title`} data-expanded={expanded ? "true" : "false"} data-depth={depth} data-hud data-hud-frame>
      <p className="level-kicker">{kicker}</p>
      <div className="level-depth">
        <DepthToggle name={`${id}-depth`} value={depth} onChange={onDepth} />
      </div>
      <div className="level-title">
        <button
          type="button"
          className="level-expand"
          aria-expanded={expanded}
          aria-controls={`${id}-more`}
          aria-label={expanded ? "Show less" : "Show the goal and depth"}
          onClick={() => setExpanded((open) => !open)}
        >
          <ChevronIcon up={expanded} />
        </button>
        <h2 id={`${id}-title`}>{title}</h2>
        {fromPaper(true)}
      </div>
      <div id={`${id}-more`} className="level-more">
        <p id={`${id}-goal`} className="level-goal">
          {goal}
        </p>
        <div className="control-line">
          <label htmlFor={sliderId}>{control.label}</label>
          <OriginTag origin={control.origin} placeholder={control.placeholder ?? false} quiet />
          {fromPaper(false)}
        </div>
      </div>
      <div className="level-slider">
        <div className="slider-track">
          <input
            id={sliderId}
            ref={sliderRef}
            type="range"
            min={control.min}
            max={control.max}
            step={control.step}
            value={control.value}
            aria-label={control.label}
            aria-describedby={`${id}-goal`}
            aria-valuetext={`${shown} ${control.unit}`}
            onChange={(event) => onChange(Number(event.currentTarget.value))}
            onFocus={onControlFocus}
          />
          {numbers ? (
            <output htmlFor={sliderId} className="value-pill">
              {shown}
            </output>
          ) : null}
        </div>
        <p className="slider-ends" aria-hidden="true">
          <span>{numbers ? control.min : control.ends[0]}</span>
          <span>{numbers ? control.max : control.ends[1]}</span>
        </p>
      </div>
      <div className="level-readout">{readout}</div>
      <div className="level-whatif">
        <button type="button" className="btn" aria-expanded={whatIfOpen} aria-controls={whatIfId} onClick={onWhatIf}>
          What if
        </button>
      </div>
      {depth === "advanced" && advanced ? <div className="level-advanced">{advanced}</div> : null}
    </section>
  );
}
