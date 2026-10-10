import { OriginTag } from "../../hud-parts.tsx";

export interface RocksCounterProps {
  /** Each rock, with how many birds are at it now (Q4). */
  readonly rocks: readonly { readonly id: string; readonly birds: number }[];
  /** Birds at one rock or more, each counted once: the primitive's own count (E20). */
  readonly birds: number;
  /** Show the number beside the counter; otherwise only on hover and focus. */
  readonly showNumber: boolean;
  readonly size?: number;
}

const DRAWN = 6;
/** A low rock, as on the stage. */
const ROCK = "-0.2,0.12 -0.13,-0.1 0.04,-0.16 0.19,-0.05 0.21,0.12";

/**
 * The rocks counter (ADR-0018): the birds inside rocks right now, and one rock on the dial for
 * each rock in the valley, lit while a bird is at it, as the rock on the stage is. The number is
 * the primitive's own count.
 */
export function RocksCounter({ rocks, birds, showNumber, size = 56 }: RocksCounterProps) {
  const drawn = rocks.slice(0, DRAWN);
  const lit = rocks.filter((rock) => rock.birds > 0).length;
  const label = `Rocks counter: ${birds} ${birds === 1 ? "bird is" : "birds are"} inside a rock; ${lit} of ${rocks.length} ${rocks.length === 1 ? "rock has" : "rocks have"} a bird at it`;
  return (
    <div className={showNumber ? "dial rocks with-number" : "dial rocks"}>
      <div className="dial-body" tabIndex={0} role="img" aria-label={label}>
        <svg width={size} height={size} viewBox="-1.25 -1.25 2.5 2.5" aria-hidden="true">
          <circle r="1.12" className="dial-face" />
          {drawn.map((rock, index) => {
            // Rocks sit on a ring, a quarter turn apart for four, as the level's rocks stand in the valley.
            const angle = (index / drawn.length) * 2 * Math.PI - Math.PI / 4;
            const [x, y] = drawn.length === 1 ? [0, 0] : [0.6 * Math.cos(angle), 0.6 * Math.sin(angle)];
            return (
              <polygon
                key={rock.id}
                className={rock.birds > 0 ? "rocks-rock rocks-lit" : "rocks-rock"}
                data-rock={rock.id}
                data-birds={String(rock.birds)}
                points={ROCK}
                transform={`translate(${x.toFixed(3)} ${y.toFixed(3)}) scale(1.6)`}
              />
            );
          })}
        </svg>
        <output className="dial-number" data-element="readout-number" data-observable="birdsAtObstacles" data-value={String(birds)}>
          {birds}
        </output>
      </div>
      <OriginTag origin="computed-observation" quiet />
    </div>
  );
}
