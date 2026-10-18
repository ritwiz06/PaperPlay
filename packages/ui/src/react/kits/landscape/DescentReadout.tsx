import { OriginTag } from "../../hud-parts.tsx";

export interface DescentReadoutProps {
  /** The level's observable: its id, its name, its value as the primitive measures it, and its decimals. */
  readonly observable: { readonly metricId: string; readonly label: string; readonly value: number; readonly decimals: number };
  /** The loss where the ball stands and where it started, for Beginner's words. */
  readonly loss: number;
  readonly startLoss: number;
  /** Numbers from Intermediate on; words at Beginner. */
  readonly showNumber: boolean;
  /** Teaching choices the readout makes, said beneath it. */
  readonly notes?: readonly string[];
}

/** How far down the ball has come, in words, as Beginner says it: a picture of the loss, never a second measurement. */
export function descentInWords(loss: number, startLoss: number): string {
  if (!Number.isFinite(loss)) return "off the surface";
  const left = startLoss > 0 ? loss / startLoss : 0;
  if (left > 1.05) return "higher than where it started";
  if (left > 0.6) return "still high up the slope";
  if (left > 0.2) return "part of the way down";
  if (left > 0.02) return "near the bottom";
  return "at the bottom";
}

/**
 * The landscape's readout (ADR-0047): the level's measurement as the primitive gives it, or at
 * Beginner how far down the ball has come, in words.
 */
export function DescentReadout({ observable, loss, startLoss, showNumber, notes = [] }: DescentReadoutProps) {
  return (
    <div className="descent" role="group" aria-label="The optimizer now">
      <p className="descent-line">
        <span className="descent-name">{showNumber ? observable.label : "The ball is"}</span>{" "}
        <span className="descent-amount" data-element="readout-number" data-observable={observable.metricId} data-value={String(observable.value)}>
          {showNumber ? observable.value.toFixed(observable.decimals) : descentInWords(loss, startLoss)}
        </span>{" "}
        <OriginTag origin="computed-observation" quiet />
      </p>
      {notes.map((note) => (
        <p key={note} className="compartments-note">
          <OriginTag origin="teaching-choice" quiet /> {note}
        </p>
      ))}
    </div>
  );
}
