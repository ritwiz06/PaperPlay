import { compassMarks } from "../../../stage-core/kits/valley/index.ts";
import { OriginTag } from "../../hud-parts.tsx";

export interface HeadingCompassProps {
  /** Each bird's heading in the field's coordinates, null for a bird at rest (the primitive's Q2). */
  readonly angles: readonly (number | null)[];
  /** The flock's mean heading (Q2), or null when the headings cancel. */
  readonly mean: number | null;
  /** The directional agreement, as the primitive measures it (E12). */
  readonly agreement: number;
  /** The camera's yaw, so the compass turns with the view. */
  readonly yaw: number;
  /** Show the number beside the compass; otherwise only on hover and focus. */
  readonly showNumber: boolean;
  readonly size?: number;
}

const TICK_INNER = 0.8;

/**
 * The heading compass (ADR-0008, the spike's review c): one tick per bird's heading on a ring,
 * and an arrow along the flock's mean heading as long as the directional agreement. Scattered
 * ticks and a short arrow mean disorder; a tight fan and a long arrow mean the flock agrees.
 */
export function HeadingCompass({ angles, mean, agreement, yaw, showNumber, size = 56 }: HeadingCompassProps) {
  const { ticks, arrow } = compassMarks(angles, mean, agreement, yaw);
  const value = agreement.toFixed(2);
  const head = arrow && Math.hypot(arrow.x, arrow.y) > 0.12 ? arrow : null;
  return (
    <div className={showNumber ? "dial compass with-number" : "dial compass"}>
      <div className="dial-body compass-dial" tabIndex={0} role="img" aria-label={`Heading compass: ${ticks.length} birds' headings; directional agreement ${value} of 1`}>
        <svg width={size} height={size} viewBox="-1.25 -1.25 2.5 2.5" aria-hidden="true">
          <circle r="1.12" className="dial-face" />
          {ticks.map((tick, index) => (
            <line key={index} className="compass-tick" x1={tick.x * TICK_INNER} y1={tick.y * TICK_INNER} x2={tick.x * 1.08} y2={tick.y * 1.08} />
          ))}
          {arrow ? <line className="compass-arrow" x1="0" y1="0" x2={arrow.x} y2={arrow.y} /> : null}
          {head ? (
            <polygon
              className="compass-head"
              points={[
                [head.x, head.y],
                [head.x * 0.7 - head.y * 0.22, head.y * 0.7 + head.x * 0.22],
                [head.x * 0.7 + head.y * 0.22, head.y * 0.7 - head.x * 0.22],
              ]
                .map(([x, y]) => `${x},${y}`)
                .join(" ")}
            />
          ) : null}
          <circle r="0.09" className="compass-hub" />
        </svg>
        <output className="dial-number compass-number" data-element="readout-number" data-observable="directionalAgreement" data-value={String(agreement)}>
          {value}
        </output>
      </div>
      <OriginTag origin="computed-observation" quiet />
    </div>
  );
}
