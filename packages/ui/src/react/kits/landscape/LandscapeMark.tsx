/** The landscape kit's mark: a ball in a valley on an aqua disc. */
export function LandscapeMark({ size = 34 }: { readonly size?: number }) {
  return (
    <svg className="kit-mark" width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="15" fill="var(--aqua)" stroke="var(--ink)" strokeWidth="2" />
      <path d="M6 13 Q17 30 28 13" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12.5" cy="17.2" r="3.2" fill="var(--cream)" stroke="var(--ink)" strokeWidth="1.5" />
    </svg>
  );
}
