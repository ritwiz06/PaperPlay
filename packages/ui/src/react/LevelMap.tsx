export interface MapLevel {
  readonly id: string;
  readonly title: string;
  /** The level being played, one the learner may enter, or one not reached yet. */
  readonly state: "now" | "open" | "locked";
}

export interface LevelMapProps {
  readonly levels: readonly MapLevel[];
  readonly onEnter?: (id: string) => void;
}

/**
 * The level path, compact, at the top (ADR-0008): a numbered dot per level, the current one
 * named. Levels open as the learner reaches them and can be entered again; a level opens once
 * the one before has been touched, never because it was solved.
 */
export function LevelMap({ levels, onEnter }: LevelMapProps) {
  return (
    <nav className="card level-map" aria-label="Levels" data-hud data-hud-frame>
      <ol>
        {levels.map((level, index) => (
          <li key={level.id} className={level.state}>
            <button
              type="button"
              aria-current={level.state === "now" ? "step" : undefined}
              disabled={level.state === "locked"}
              title={level.state === "locked" ? `${level.title}: not reached yet` : level.title}
              onClick={() => onEnter?.(level.id)}
            >
              <span className="dot" aria-hidden="true">
                {index + 1}
              </span>
              <span className={level.state === "now" ? "level-name" : "sr-only"}>
                {level.title}
                {level.state === "locked" ? ", not reached yet" : ""}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
