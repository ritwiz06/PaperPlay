/** The town kit's mark: a house on an aqua disc. */
export function TownMark({ size = 34 }: { readonly size?: number }) {
  return (
    <svg className="kit-mark" width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="15" fill="var(--aqua)" stroke="var(--ink)" strokeWidth="2" />
      <path d="M10 17 L17 10.5 L24 17 Z" fill="var(--ink)" />
      <rect x="12" y="17" width="10" height="7" fill="var(--cream)" stroke="var(--ink)" strokeWidth="1.5" />
    </svg>
  );
}
