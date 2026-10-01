export interface ReadoutProps {
  readonly label: string;
  /** The observable's name, so a test or a screen reader can find the exact value. */
  readonly observable: string;
  /** The full-precision value, kept in data-value. */
  readonly value: number;
  /** The value as shown. */
  readonly text: string;
  readonly unit?: string;
}

/** One measured value, inside a description list. Its digits sit in a fixed-width slot (ADR-0002). */
export function Readout({ label, observable, value, text, unit }: ReadoutProps) {
  return (
    <div className="readout">
      <dt>{label}</dt>
      <dd>
        <output data-observable={observable} data-value={String(value)}>
          {text}
        </output>
        {unit ? <span className="readout-unit">{unit}</span> : null}
      </dd>
    </div>
  );
}
