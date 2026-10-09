import { OriginTag } from "./hud-parts.tsx";

export interface GroupsCounterProps {
  /** Groups, as the primitive counts them (E14): birds linked within 4.5 units and 45°, 4 or more. */
  readonly groups: number;
  /** The share of birds in no group (E18). */
  readonly strayShare: number;
  readonly birds: number;
  /** Show the number beside the counter; otherwise only on hover and focus. */
  readonly showNumber: boolean;
  readonly size?: number;
}

const DRAWN = 6;
const CLUSTER = [
  [0, -0.13],
  [-0.12, 0.08],
  [0.12, 0.08],
] as const;
const STRAYS = [
  [-0.7, -0.35],
  [0.55, -0.6],
  [0.1, 0.25],
  [-0.3, 0.7],
  [0.75, 0.45],
] as const;

/**
 * The groups counter (ADR-0014, ADR-0015): one small cluster on the dial per group, up to six,
 * and scattered strays when no group has formed. The number is the primitive's own count.
 */
export function GroupsCounter({ groups, strayShare, birds, showNumber, size = 56 }: GroupsCounterProps) {
  const drawn = Math.min(groups, DRAWN);
  const strays = Math.round(strayShare * birds);
  const ring = drawn <= 1 ? 0 : 0.62;
  const label = `Groups counter: ${groups} ${groups === 1 ? "group" : "groups"}; ${strays} of ${birds} birds are strays`;
  return (
    <div className={showNumber ? "dial groups with-number" : "dial groups"}>
      <div className="dial-body" tabIndex={0} role="img" aria-label={label}>
        <svg width={size} height={size} viewBox="-1.25 -1.25 2.5 2.5" aria-hidden="true">
          <circle r="1.12" className="dial-face" />
          {drawn === 0
            ? STRAYS.map(([x, y], index) => <circle key={index} className="groups-stray" cx={x} cy={y} r="0.08" />)
            : Array.from({ length: drawn }, (_, group) => {
                const angle = (group / drawn) * 2 * Math.PI - Math.PI / 2;
                const [cx, cy] = [ring * Math.cos(angle), ring * Math.sin(angle)];
                return CLUSTER.map(([x, y], index) => <circle key={`${group}-${index}`} className="groups-bird" cx={cx + x} cy={cy + y} r="0.09" />);
              })}
        </svg>
        <output className="dial-number" data-element="readout-number" data-observable="clusterCount" data-value={String(groups)}>
          {groups}
        </output>
      </div>
      <OriginTag origin="computed-observation" quiet />
    </div>
  );
}
