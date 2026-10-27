import type { BaseEmphasis, BaseFrame, StageKit } from "../stage-core/index.ts";
import { useEffect, useRef, type ReactNode } from "react";
import { PlayIcon } from "./hud-parts.tsx";
import { WorldStage, type StageDriver } from "./WorldStage.tsx";

export interface ForkPane<Input = unknown, Emphasis extends BaseEmphasis = BaseEmphasis> {
  /** Shown over the pane: "This world", "What if: Move together at 0". */
  readonly label: string;
  /** The pane's stage, as a screen reader names it. */
  readonly name: string;
  readonly driver: StageDriver<Input, Emphasis>;
}

export interface ForkViewProps<Input, Emphasis extends BaseEmphasis, Look, Frame extends BaseFrame> {
  /** The scene kit both stages draw with; absent when the world draws its own stages. */
  readonly kit?: StageKit<Input, Emphasis, Look, Frame>;
  /** A world with a stage of its own draws each pane's, such as a generated world's in its sandbox (ADR-0058). */
  readonly renderStage?: (pane: ForkPane<Input, Emphasis>, which: "here" | "there") => ReactNode;
  /** The What-if, as a question. */
  readonly title: string;
  /** Under the title: what the other world changes, and whether both restart. */
  readonly note: ReactNode;
  readonly here: ForkPane<Input, Emphasis>;
  readonly there: ForkPane<Input, Emphasis>;
  /** A description of the world both stages draw. */
  readonly stageLabel: string;
  readonly look?: Look;
  readonly chart: ReactNode;
  /** The measured difference so far, and, once the level's time is up, the result. */
  readonly result: ReactNode;
  readonly playing: boolean;
  readonly done: boolean;
  readonly onTogglePlay: () => void;
  readonly onClose: () => void;
  /** Called at most ten times a second while the worlds change, to refresh the chart. */
  readonly onReadout?: () => void;
  /** The guide, inside the fork's result: guided exploration speaks here. */
  readonly guide?: ReactNode;
  /** More controls beside play, such as the speed. */
  readonly controls?: ReactNode;
  readonly children?: ReactNode;
}

/**
 * The split-screen fork (ADR-0008): two worlds from the same moment, one with the What-if,
 * side by side on a desktop and stacked on a phone, with the one measured difference between
 * them charted beneath. The stages only draw; the app keeps both worlds in step.
 */
export function ForkView<Input, Emphasis extends BaseEmphasis, Look, Frame extends BaseFrame>(props: ForkViewProps<Input, Emphasis, Look, Frame>) {
  const { kit, renderStage, title, note, here, there, stageLabel, look, chart, result, playing, done, onTogglePlay, onClose, onReadout, guide, controls, children } = props;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section
      className="fork"
      aria-labelledby="fork-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <header className="card fork-head">
        <div className="fork-title">
          <h2 id="fork-title" ref={heading} tabIndex={-1}>
            {title}
          </h2>
          <div className="fork-note">{note}</div>
        </div>
        <div className="fork-buttons">
          <button type="button" className="btn btn-light" onClick={onTogglePlay} disabled={done}>
            <PlayIcon playing={playing} />
            <span className="btn-text">{done ? "Done" : playing ? "Pause" : "Play both"}</span>
          </button>
          {controls}
          <button type="button" className="btn" onClick={onClose}>
            Back to one world
          </button>
        </div>
      </header>
      <div className="fork-pane fork-here" data-pane="here">
        {renderStage ? (
          renderStage(here, "here")
        ) : kit ? (
          <WorldStage
            kit={kit}
            driver={here.driver}
            name={here.name}
            label={stageLabel}
            tool="look"
            framing="overview"
            {...(look === undefined ? {} : { look })}
            onTogglePlay={onTogglePlay}
            {...(onReadout ? { onReadout } : {})}
          />
        ) : null}
        <p className="card fork-label">{here.label}</p>
      </div>
      <div className="fork-pane fork-there" data-pane="there">
        {renderStage ? renderStage(there, "there") : kit ? <WorldStage kit={kit} driver={there.driver} name={there.name} label={stageLabel} tool="look" framing="overview" {...(look === undefined ? {} : { look })} onTogglePlay={onTogglePlay} /> : null}
        <p className="card fork-label">{there.label}</p>
      </div>
      <div className="card fork-result">
        {guide ? <div className="fork-guide">{guide}</div> : null}
        {chart}
        <div className="fork-measure">{result}</div>
      </div>
      {children}
    </section>
  );
}
