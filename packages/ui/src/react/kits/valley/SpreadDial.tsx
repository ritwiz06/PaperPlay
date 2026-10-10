import { OriginTag } from "../../hud-parts.tsx";

export interface SpreadDialProps {
  /** How far the largest group spreads, as the primitive measures it (E19), in world units. */
  readonly spread: number;
  /** The spread drawn reaching the dial's rim: a flock spread over the whole valley. */
  readonly scale?: number;
  /** Show the number beside the dial; otherwise only on hover and focus. */
  readonly showNumber: boolean;
  readonly size?: number;
}

/**
 * The spread dial: the flock as a dot, inside a ring as wide, on the dial, as the largest group
 * spreads (E19). It matches the ring the stage draws on the ground around the flock.
 */
export function SpreadDial({ spread, scale = 14, showNumber, size = 56 }: SpreadDialProps) {
  const value = spread.toFixed(1);
  const radius = Math.min(Math.max(spread / scale, 0), 1) * 1.02;
  return (
    <div className={showNumber ? "dial spread with-number" : "dial spread"}>
      <div className="dial-body" tabIndex={0} role="img" aria-label={`Spread dial: the flock's largest group spreads ${value} world units from its centre`}>
        <svg width={size} height={size} viewBox="-1.25 -1.25 2.5 2.5" aria-hidden="true">
          <circle r="1.12" className="dial-face" />
          {radius > 0 ? <circle r={radius} className="spread-ring" /> : null}
          <circle r="0.1" className="spread-centre" />
        </svg>
        <output className="dial-number" data-element="readout-number" data-observable="groupSpread" data-value={String(spread)}>
          {value}
        </output>
      </div>
      <OriginTag origin="computed-observation" quiet />
    </div>
  );
}
