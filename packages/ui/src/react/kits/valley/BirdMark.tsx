/** The valley kit's mark: a bird in flight on an aqua disc. */
export function BirdMark({ size = 34 }: { readonly size?: number }) {
  return (
    <svg className="kit-mark" width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="15" fill="var(--aqua)" stroke="var(--ink)" strokeWidth="2" />
      <path d="M9 20 L24 12 L19 22 L16 18 Z" fill="var(--ink)" />
    </svg>
  );
}
