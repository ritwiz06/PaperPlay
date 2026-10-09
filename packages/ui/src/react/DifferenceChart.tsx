export interface DifferenceChartProps {
  /** What is charted, in words: "Directional agreement". */
  readonly metricName: string;
  /** The level's time: the chart's width, in seconds. */
  readonly seconds: number;
  /** Seconds between samples. */
  readonly interval: number;
  /** Each world's samples, from the fork's first step. */
  readonly here: readonly number[];
  readonly there: readonly number[];
  /** The top of the value axis. */
  readonly top: number;
  /** A threshold the difference counts to, drawn as a line. */
  readonly threshold?: number;
  readonly hereName: string;
  readonly thereName: string;
}

const LEFT = 36;
const RIGHT = 312;
const TOP = 10;
const BOTTOM = 104;

const label = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(value < 1 ? 2 : 1));

/**
 * The fork's chart (ADR-0008): the measured difference's metric in both worlds over the level's
 * time, sample by sample, as the primitive measured it. This world is a solid line, the other a
 * dashed one, so the two differ without colour.
 */
export function DifferenceChart({ metricName, seconds, interval, here, there, top, threshold, hereName, thereName }: DifferenceChartProps) {
  const x = (index: number): number => LEFT + ((index * interval) / seconds) * (RIGHT - LEFT);
  const y = (value: number): number => BOTTOM - (Math.min(Math.max(value, 0), top) / top) * (BOTTOM - TOP);
  const line = (values: readonly number[]): string => values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const last = (values: readonly number[]): string => (values.length > 0 ? label(Number((values.at(-1) ?? 0).toFixed(2))) : "nothing yet");
  const elapsed = Math.max(here.length - 1, 0) * interval;
  return (
    <figure className="difference-chart" data-here-samples={here.length} data-there-samples={there.length}>
      <svg
        viewBox="0 0 320 128"
        role="img"
        aria-label={`${metricName} over ${seconds} seconds in both worlds. After ${elapsed.toFixed(1)} s, ${hereName} is at ${last(here)} and ${thereName} at ${last(there)}.`}
      >
        <line className="chart-axis" x1={LEFT} y1={BOTTOM} x2={RIGHT} y2={BOTTOM} />
        <line className="chart-axis" x1={LEFT} y1={TOP} x2={LEFT} y2={BOTTOM} />
        {[0, top / 2, top].map((value) => (
          <text key={`y${value}`} className="chart-tick" x={LEFT - 4} y={y(value) + 3} textAnchor="end">
            {label(value)}
          </text>
        ))}
        {[0, seconds / 2, seconds].map((value) => (
          <text key={`x${value}`} className="chart-tick" x={LEFT + (value / seconds) * (RIGHT - LEFT)} y={BOTTOM + 13} textAnchor="middle">
            {`${label(value)} s`}
          </text>
        ))}
        {threshold === undefined ? null : <line className="chart-threshold" x1={LEFT} y1={y(threshold)} x2={RIGHT} y2={y(threshold)} />}
        <polyline className="chart-here" points={line(here)} />
        <polyline className="chart-there" points={line(there)} />
      </svg>
      <figcaption className="chart-legend">
        <span>
          <svg width="22" height="8" aria-hidden="true">
            <line className="chart-here" x1="1" y1="4" x2="21" y2="4" />
          </svg>
          {hereName}
        </span>
        <span>
          <svg width="22" height="8" aria-hidden="true">
            <line className="chart-there" x1="1" y1="4" x2="21" y2="4" />
          </svg>
          {thereName}
        </span>
        <span className="chart-metric">{metricName}</span>
      </figcaption>
    </figure>
  );
}
