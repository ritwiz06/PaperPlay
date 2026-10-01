import type { Origin } from "@paperplay/contracts";

export const ORIGINS: readonly Origin[] = ["paper-derived", "teaching-choice", "computed-observation", "generated-inference"];

export const ORIGIN_LABELS: Readonly<Record<Origin, string>> = {
  "paper-derived": "Paper-derived",
  "teaching-choice": "Teaching choice",
  "computed-observation": "Computed observation",
  "generated-inference": "Generated inference",
};

export const ORIGIN_MEANINGS: Readonly<Record<Origin, string>> = {
  "paper-derived": "from the paper, with its passage",
  "teaching-choice": "chosen to help you learn",
  "computed-observation": "measured in this run",
  "generated-inference": "a model's guess, not evidence",
};

/** Where a statement comes from, in its origin's colour. */
export function OriginChip({ origin }: { readonly origin: Origin }) {
  return (
    <span className={`origin-chip origin-${origin}`} title={ORIGIN_MEANINGS[origin]}>
      {ORIGIN_LABELS[origin]}
    </span>
  );
}

/** The one legend for the four origins, always on screen. */
export function OriginLegend() {
  return (
    <ul className="origin-legend" aria-label="Where each statement comes from">
      {ORIGINS.map((origin) => (
        <li key={origin}>
          <OriginChip origin={origin} />
          <span className="origin-meaning">{ORIGIN_MEANINGS[origin]}</span>
        </li>
      ))}
    </ul>
  );
}
