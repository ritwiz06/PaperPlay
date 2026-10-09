import { OriginTag } from "./hud-parts.tsx";

export interface SpacingGaugeProps {
  /** The mean nearest-neighbour distance, as the primitive measures it (E13), in world units. */
  readonly spacing: number;
  /** The distance drawn across the whole dial. */
  readonly scale?: number;
  /** Show the number beside the gauge; otherwise only on hover and focus. */
  readonly showNumber: boolean;
  readonly size?: number;
}

/**
 * The spacing gauge (ADR-0014): two birds drawn as far apart, on the dial, as the flock's mean
 * nearest neighbour. Crowding pulls them together; personal space pushes them apart.
 */
export function SpacingGauge({ spacing, scale = 3, showNumber, size = 56 }: SpacingGaugeProps) {
  const value = spacing.toFixed(2);
  // Half the span, in the dial's units: the full width (1.8) stands for `scale` world units.
  const half = (Math.min(Math.max(spacing / scale, 0), 1) * 1.8) / 2;
  return (
    <div className={showNumber ? "dial gauge with-number" : "dial gauge"}>
      <div className="dial-body" tabIndex={0} role="img" aria-label={`Spacing gauge: birds' mean distance to their nearest neighbour, ${value} world units`}>
        <svg width={size} height={size} viewBox="-1.25 -1.25 2.5 2.5" aria-hidden="true">
          <circle r="1.12" className="dial-face" />
          <line className="gauge-scale" x1="-0.9" y1="0.55" x2="0.9" y2="0.55" />
          <line className="gauge-span" x1={-half} y1="0" x2={half} y2="0" />
          <circle className="gauge-bird" cx={-half} cy="0" r="0.17" />
          <circle className="gauge-bird" cx={half} cy="0" r="0.17" />
        </svg>
        <output className="dial-number" data-element="readout-number" data-observable="meanNeighbourDistance" data-value={String(spacing)}>
          {value}
        </output>
      </div>
      <OriginTag origin="computed-observation" quiet />
    </div>
  );
}
