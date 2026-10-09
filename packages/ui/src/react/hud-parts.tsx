/**
 * Small pieces of the game-first HUD (ADR-0008): origin tags, the depth toggle, and icons.
 * They display what they are given and report what the learner does.
 */
import type { Origin } from "@paperplay/contracts";
import { ORIGIN_LABELS, ORIGIN_MEANINGS } from "./origin.tsx";

/** Each origin in a word or two, for the HUD. The journal's legend gives the full name and meaning. */
export const ORIGIN_WORDS: Readonly<Record<Origin, string>> = {
  "paper-derived": "Paper",
  "teaching-choice": "Teaching choice",
  "computed-observation": "Measured",
  "generated-inference": "Model's guess",
};

export interface OriginTagProps {
  readonly origin: Origin;
  /** Smaller and lighter, for the guide and the level card. */
  readonly quiet?: boolean;
  /** A paper-derived claim whose passage has not been mapped yet. */
  readonly placeholder?: boolean;
}

/** Where a statement comes from, in its origin's colour and in words. */
export function OriginTag({ origin, quiet = false, placeholder = false }: OriginTagProps) {
  const meaning = `${ORIGIN_LABELS[origin]}: ${ORIGIN_MEANINGS[origin]}${placeholder ? ". A placeholder until the source map exists." : ""}`;
  return (
    <span className={`origin-tag origin-tag-${origin}${quiet ? " origin-tag-quiet" : ""}${placeholder ? " origin-tag-placeholder" : ""}`} title={meaning}>
      <span aria-hidden="true">
        {ORIGIN_WORDS[origin]}
        {placeholder ? <span className="origin-tag-mark"> · placeholder</span> : null}
      </span>
      <span className="sr-only">
        {ORIGIN_LABELS[origin]}
        {placeholder ? ", placeholder" : ""}
      </span>
    </span>
  );
}

export type Depth = "beginner" | "intermediate" | "advanced";

export const DEPTHS: readonly { readonly depth: Depth; readonly label: string }[] = [
  { depth: "beginner", label: "Beginner" },
  { depth: "intermediate", label: "Intermediate" },
  { depth: "advanced", label: "Advanced" },
];

export const isDepth = (value: unknown): value is Depth => DEPTHS.some((entry) => entry.depth === value);

export interface DepthToggleProps {
  /** Radio group name; each toggle on a page needs its own. */
  readonly name: string;
  readonly value: Depth;
  readonly onChange: (depth: Depth) => void;
}

/** Beginner, Intermediate or Advanced: one choice, shown wherever a toggle stands. */
export function DepthToggle({ name, value, onChange }: DepthToggleProps) {
  return (
    <fieldset className="depth-toggle">
      <legend className="sr-only">How deep to go</legend>
      {DEPTHS.map((entry) => (
        <label key={entry.depth} className={entry.depth === value ? "on" : undefined}>
          <input type="radio" name={name} value={entry.depth} checked={entry.depth === value} onChange={() => onChange(entry.depth)} />
          {entry.label}
        </label>
      ))}
    </fieldset>
  );
}

export function BirdMark({ size = 34 }: { readonly size?: number }) {
  return (
    <svg className="bird-mark" width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="15" fill="var(--aqua)" stroke="var(--ink)" strokeWidth="2" />
      <path d="M9 20 L24 12 L19 22 L16 18 Z" fill="var(--ink)" />
    </svg>
  );
}

export function BookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2 3.5 Q5 2 8 3.5 Q11 2 14 3.5 V13 Q11 11.5 8 13 Q5 11.5 2 13 Z M8 3.5 V13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PlayIcon({ playing }: { readonly playing: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      {playing ? <path d="M4 3 H7 V13 H4 Z M9 3 H12 V13 H9 Z" fill="currentColor" /> : <path d="M4 2.5 L13 8 L4 13.5 Z" fill="currentColor" />}
    </svg>
  );
}

export function ChevronIcon({ up }: { readonly up: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d={up ? "M3 10 L8 5 L13 10" : "M3 6 L8 11 L13 6"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
