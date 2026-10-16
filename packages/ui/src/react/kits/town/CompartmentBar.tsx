import { shareInWords, townDay } from "../../../stage-core/kits/town/index.ts";
import { OriginTag } from "../../hud-parts.tsx";

/** One compartment as the readout shows it: its name, how many it holds, as the solver gives it, and its share of the whole. */
export interface CompartmentReading {
  readonly id: string;
  readonly name: string;
  readonly value: number;
  readonly share: number;
}

export interface CompartmentBarProps {
  /** Every compartment, in the model's order. */
  readonly compartments: readonly CompartmentReading[];
  /** The level's observable: its id, its value as the primitive measures it, and its decimals. */
  readonly observable: { readonly metricId: string; readonly value: number; readonly decimals: number };
  /** Which compartment the observable is, when it is one, to outline. */
  readonly watched: number | null;
  /** Counts from Intermediate on; words at Beginner. */
  readonly showNumber: boolean;
  /**
   * For a model of shares of a population: each amount shown as people in a town of this size, a
   * teaching choice the note says (ADR-0037). The data stays the primitive's own.
   */
  readonly townOf?: number;
  /** Teaching choices the readout makes, said beneath it: the town's size, a lens. */
  readonly notes?: readonly string[];
}

const COUNT = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

/**
 * The town's readout (ADR-0029): the model's compartments as one bar, each part as wide as its
 * share, in the figures' own colours, labelled beneath with its count, or at Beginner in words.
 * The watched compartment is outlined, and its count is the primitive's own measurement.
 */
export function CompartmentBar({ compartments, observable, watched, showNumber, townOf, notes = [] }: CompartmentBarProps) {
  const people = (value: number): string => COUNT.format(value * (townOf ?? 1));
  const colour = (index: number): string => townDay.figures[Math.min(index, townDay.figures.length - 1)] ?? townDay.wall;
  return (
    <div className="compartments" role="group" aria-label="The town now">
      <div className="compartments-bar" aria-hidden="true">
        {compartments.map((compartment, index) =>
          compartment.share > 0 ? (
            <span
              key={compartment.id}
              className={index === watched ? "compartments-part watched" : "compartments-part"}
              data-compartment={compartment.id}
              style={{ flexGrow: compartment.share, background: colour(index) }}
            />
          ) : null,
        )}
      </div>
      <OriginTag origin="computed-observation" quiet />
      <ul className="compartments-legend">
        {compartments.map((compartment, index) => {
          const isWatched = index === watched;
          const amount = showNumber ? (townOf ? people(isWatched ? observable.value : compartment.value) : isWatched ? observable.value.toFixed(observable.decimals) : COUNT.format(compartment.value)) : shareInWords(compartment.share);
          return (
            <li key={compartment.id} className={isWatched ? "watched" : undefined}>
              <span className="compartments-swatch" style={{ background: colour(index) }} aria-hidden="true" />
              <span className="compartments-name">{compartment.name}</span>
              <span
                className="compartments-amount"
                {...(isWatched ? { "data-element": "readout-number", "data-observable": observable.metricId, "data-value": String(observable.value) } : {})}
              >
                {amount}
              </span>
            </li>
          );
        })}
      </ul>
      {notes.map((note) => (
        <p key={note} className="compartments-note">
          <OriginTag origin="teaching-choice" quiet /> {note}
        </p>
      ))}
    </div>
  );
}
