import type { Origin } from "@paperplay/contracts";
import type { ReactNode } from "react";
import { OriginChip } from "./origin.tsx";

/** One control on the bench, already bound to its action: the bench only displays and reports. */
export interface BenchControl {
  readonly actionId: string;
  readonly label: string;
  readonly unit: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** The engine's current value, not the slider's own. */
  readonly value: number;
  readonly help: string;
  readonly origin: Origin;
}

export interface LabBenchProps {
  /** The level's one manipulable control. */
  readonly primary: BenchControl;
  /** The world's other rules, collapsed under "Rules of this world". */
  readonly rules: readonly BenchControl[];
  readonly onChange: (actionId: string, value: number) => void;
  readonly onRestore: () => void;
  readonly canRestore: boolean;
  /** Display options shown inside "Rules of this world", after the rules. Render-only. */
  readonly display?: ReactNode;
  readonly children?: ReactNode;
}

const decimalsOf = (step: number): number => Math.max(0, -Math.floor(Math.log10(step) + 1e-9));

function Control({ control, primary, onChange }: { readonly control: BenchControl; readonly primary?: boolean; readonly onChange: LabBenchProps["onChange"] }) {
  const id = `control-${control.actionId}`;
  const shown = control.value.toFixed(decimalsOf(control.step));
  return (
    <div className={primary ? "control control-primary" : "control"}>
      <div className="control-head">
        <label htmlFor={id}>{control.label}</label>
        <OriginChip origin={control.origin} />
      </div>
      <input
        id={id}
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={control.value}
        aria-describedby={`${id}-help`}
        aria-valuetext={`${shown} ${control.unit}`}
        onChange={(event) => onChange(control.actionId, Number(event.currentTarget.value))}
      />
      <p className="control-value">
        <output htmlFor={id}>{shown}</output> {control.unit}
      </p>
      <p id={`${id}-help`} className="control-help">
        {control.help}
      </p>
    </div>
  );
}

/** The level's control, its reset, and the world's other rules, beside the stage. */
export function LabBench({ primary, rules, onChange, onRestore, canRestore, display, children }: LabBenchProps) {
  return (
    <section className="lab-bench" aria-labelledby="lab-bench-title">
      <h2 id="lab-bench-title">Lab bench</h2>
      <Control control={primary} primary onChange={onChange} />
      <button type="button" className="restore" onClick={onRestore} disabled={!canRestore}>
        Restore balanced rules
      </button>
      <details className="world-rules">
        <summary>Rules of this world</summary>
        {rules.map((rule) => (
          <Control key={rule.actionId} control={rule} onChange={onChange} />
        ))}
        {display}
      </details>
      {children}
    </section>
  );
}
