import type { Speed } from "../stage-core/index.ts";
import { SPEEDS } from "../stage-core/index.ts";

export interface SpeedButtonProps {
  readonly speed: Speed;
  readonly onChange: (speed: Speed) => void;
}

/**
 * The speed control: one small button showing the speed in use, "Speed 1×" (on a phone, "1×"),
 * which steps through 1x, 2x and 4x.
 * Faster means more fixed steps per frame; every step is the same as at 1x, so results do
 * not change.
 */
export function SpeedButton({ speed, onChange }: SpeedButtonProps) {
  const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] ?? 1;
  return (
    <button type="button" className="btn btn-light speed-button" data-speed={speed} aria-label={`Speed ${speed}×. Change to ${next}×`} title="Speed" onClick={() => onChange(next)}>
      <span className="btn-text">Speed </span>
      {speed}×
    </button>
  );
}
