import { useLayoutEffect, useRef, useState } from "react";

export interface DifferenceChartProps {
  /** What is charted, in words: "Directional agreement". */
  readonly metricName: string;
  /** The level's time: the chart's width, in the world's time unit. */
  readonly duration: number;
  /** Time between samples, in the same unit. */
  readonly interval: number;
  /** The time unit, as the axis writes it ("s") and as a sentence says it ("seconds"). */
  readonly unit: { readonly short: string; readonly words: string };
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

/** Room for the value labels, the axis labels below, and a little air. */
const LEFT = 40;
const RIGHT_GAP = 12;
const TOP = 10;
const BOTTOM_GAP = 22;
/** Drawn at its own width, one unit to a CSS pixel, so its text keeps its size on any screen. */
const NARROW = 480;

const label = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(value < 1 ? 2 : 1));

/**
 * The fork's chart (ADR-0008): the measured difference's metric in both worlds over the level's
 * time, sample by sample, as the primitive measured it. This world is a solid line, the other a
 * dashed one, so the two differ without colour.
 */
export function DifferenceChart({ metricName, duration, interval, unit, here, there, top, threshold, hereName, thereName }: DifferenceChartProps) {
  const figure = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(320);
  useLayoutEffect(() => {
    const element = figure.current;
    if (!element) return;
    const measure = (): void => {
      const measured = Math.round(element.clientWidth);
      if (measured > 0) setWidth(measured);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const height = width < NARROW ? 120 : 140;
  const RIGHT = width - RIGHT_GAP;
  const BOTTOM = height - BOTTOM_GAP;
  const x = (index: number): number => LEFT + ((index * interval) / duration) * (RIGHT - LEFT);
  const y = (value: number): number => BOTTOM - (Math.min(Math.max(value, 0), top) / top) * (BOTTOM - TOP);
  const line = (values: readonly number[]): string => values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const last = (values: readonly number[]): string => (values.length > 0 ? label(Number((values.at(-1) ?? 0).toFixed(2))) : "nothing yet");
  const elapsed = Math.max(here.length - 1, 0) * interval;
  return (
    <figure ref={figure} className="difference-chart" data-here-samples={here.length} data-there-samples={there.length}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={`${metricName} over ${duration} ${unit.words} in both worlds. After ${elapsed.toFixed(1)} ${unit.short}, ${hereName} is at ${last(here)} and ${thereName} at ${last(there)}.`}
      >
        <line className="chart-axis" x1={LEFT} y1={BOTTOM} x2={RIGHT} y2={BOTTOM} />
        <line className="chart-axis" x1={LEFT} y1={TOP} x2={LEFT} y2={BOTTOM} />
        {[0, top / 2, top].map((value) => (
          <text key={`y${value}`} className="chart-tick" x={LEFT - 6} y={y(value) + 4} textAnchor="end">
            {label(value)}
          </text>
        ))}
        {[0, duration / 2, duration].map((value) => (
          <text key={`x${value}`} className="chart-tick" x={LEFT + (value / duration) * (RIGHT - LEFT)} y={BOTTOM + 16} textAnchor={value === duration ? "end" : value === 0 ? "start" : "middle"}>
            {`${label(value)} ${unit.short}`}
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
