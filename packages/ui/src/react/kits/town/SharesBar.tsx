import { townDay } from "../../../stage-core/kits/town/index.ts";
import { OriginTag } from "../../hud-parts.tsx";

export interface SharesBarProps {
  /** Each compartment, in the model's order: its name and its share of the whole, as the solver gives it. */
  readonly compartments: readonly { readonly id: string; readonly name: string; readonly share: number }[];
  /** The level's observable, which the number shows. */
  readonly observable: { readonly metricId: string; readonly label: string };
  /** Its value, as the primitive measures it, and how many decimals to show. */
  readonly value: number;
  readonly decimals: number;
  /** Which compartment the observable is, when it is one, to outline on the bar. */
  readonly watched: number | null;
  /** Show the number beside the bar; otherwise only on hover and focus. */
  readonly showNumber: boolean;
  readonly size?: number;
}

/**
 * The town's readout (ADR-0029): the model's compartments as one bar, each as wide as its share,
 * in the figures' own colours, with the level's observable outlined and its number beside it.
 */
export function SharesBar({ compartments, observable, value, decimals, watched, showNumber, size = 56 }: SharesBarProps) {
  const total = compartments.reduce((sum, compartment) => sum + Math.max(compartment.share, 0), 0) || 1;
  const widths = compartments.map((compartment) => (Math.max(compartment.share, 0) / total) * 2);
  // Each part starts where the parts before it end, from the bar's left edge at −1.
  const starts = widths.map((_, index) => widths.slice(0, index).reduce((sum, width) => sum + width, -1));
  const shown = value.toFixed(decimals);
  const parts = compartments.map((compartment) => `${compartment.name} ${Math.round((Math.max(compartment.share, 0) / total) * 100)}%`).join(", ");
  return (
    <div className={showNumber ? "dial shares with-number" : "dial shares"}>
      <div className="dial-body" tabIndex={0} role="img" aria-label={`Shares of the town: ${parts}. ${observable.label}: ${shown}`}>
        <svg width={size} height={size} viewBox="-1.25 -1.25 2.5 2.5" aria-hidden="true">
          <circle r="1.12" className="dial-face" />
          {compartments.map((compartment, index) => (
            <rect
              key={compartment.id}
              className={index === watched ? "shares-part shares-watched" : "shares-part"}
              data-compartment={compartment.id}
              x={starts[index]}
              y={-0.32}
              width={widths[index]}
              height={0.64}
              fill={townDay.figures[Math.min(index, townDay.figures.length - 1)]}
            />
          ))}
        </svg>
        <output className="dial-number" data-element="readout-number" data-observable={observable.metricId} data-value={String(value)}>
          {shown}
        </output>
      </div>
      <OriginTag origin="computed-observation" quiet />
    </div>
  );
}
