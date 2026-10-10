import type { Origin } from "@paperplay/contracts";
import { useEffect, useRef, type ReactNode } from "react";
import { DepthToggle, OriginTag, type Depth } from "./hud-parts.tsx";
import { ORIGIN_LABELS, ORIGIN_MEANINGS, ORIGINS } from "./origin.tsx";

export interface JournalPassage {
  readonly title: string;
  readonly text: string;
  /** Where in the source it stands: section and page. Left out for a page beyond the paper. */
  readonly locator?: string;
  /** Paper-derived unless the page goes beyond the paper, as a bonus level's does. */
  readonly origin?: Origin;
  /** Not yet mapped to the source; says so on the page. */
  readonly placeholder?: boolean;
}

export interface JournalPage {
  readonly id: string;
  /** "Level 1 · A flock with no leader". */
  readonly heading: string;
  readonly passage: JournalPassage;
  /** The control the passage's rule became, for "Try it". */
  readonly control: string;
  /** The control's teaching choices in this world: its friendly name, range and start. */
  readonly detail: ReactNode;
}

/** One thing the world cannot show, with where the statement comes from. */
export interface CannotShowItem {
  readonly text: string;
  readonly origin: Origin;
  /** Paper-derived, but not yet mapped to the source. */
  readonly placeholder?: boolean;
}

export interface PaperJournalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly depth: Depth;
  readonly onDepth: (depth: Depth) => void;
  /** The pages unlocked so far, in level order. */
  readonly pages: readonly JournalPage[];
  /** Levels not reached yet: their pages appear when they are. */
  readonly stillToFind: readonly { readonly number: number; readonly title: string }[];
  /** The page whose passage is highlighted, if any. */
  readonly highlighted: string | null;
  /** Tapping a passage focuses its control (R05). */
  readonly onTryIt: (pageId: string) => void;
  /** What the world cannot show (ADR-0027): its limits, and how its scene kit draws what it does not measure. Open from the start. */
  readonly cannotShow?: readonly CannotShowItem[];
}

/**
 * The paper journal (ADR-0008): a slide-over, opened on demand, holding each reached level's
 * passage, the depth toggle, the page of what the world cannot show, and the origin legend. Opening it moves focus to the highlighted
 * passage, or to Close; Escape closes it.
 */
export function PaperJournal({ open, onClose, depth, onDepth, pages, stillToFind, highlighted, onTryIt, cannotShow = [] }: PaperJournalProps) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const passages = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    if (!open) return;
    const target = (highlighted ? passages.current.get(highlighted) : undefined) ?? closeButton.current;
    target?.focus({ preventScroll: false });
  }, [open, highlighted]);

  return (
    <aside
      id="paper-journal"
      className={open ? "card journal open" : "card journal"}
      aria-labelledby="journal-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="journal-head">
        <h2 id="journal-title">Paper journal</h2>
        <button ref={closeButton} type="button" className="btn btn-light btn-icon" aria-label="Close the journal" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="journal-intro">Each level adds the passage of the paper it comes from. Tap a passage to try its control.</p>
      <DepthToggle name="journal-depth" value={depth} onChange={onDepth} />

      <ol className="pages">
        {pages.map((page) => (
          <li key={page.id} className={page.id === highlighted ? "page highlighted" : "page"} data-page={page.id}>
            <p className="page-level">{page.heading}</p>
            <button
              ref={(element) => {
                if (element) passages.current.set(page.id, element);
                else passages.current.delete(page.id);
              }}
              type="button"
              className="passage"
              onClick={() => onTryIt(page.id)}
            >
              <span className="passage-head">
                <OriginTag origin={page.passage.origin ?? "paper-derived"} placeholder={page.passage.placeholder ?? false} />
              </span>
              <span className="passage-title">{page.passage.title}</span>
              <span className="passage-text">{page.passage.text}</span>
              {page.passage.locator ? <span className="passage-locator">{page.passage.locator}</span> : null}
              <span className="passage-try">Try it: {page.control}</span>
            </button>
            <div className="page-detail">{page.detail}</div>
          </li>
        ))}
        {stillToFind.length > 0 ? (
          <li className="page locked">
            <p className="page-level">Still to find</p>
            <ul className="locked-list">
              {stillToFind.map((level) => (
                <li key={level.number}>
                  <span className="dot" aria-hidden="true">
                    {level.number}
                  </span>
                  {level.title}
                </li>
              ))}
            </ul>
            <p className="locked-note">Each page appears when you reach its level.</p>
          </li>
        ) : null}
      </ol>

      {cannotShow.length > 0 ? (
        <section className="cannot-show" aria-labelledby="journal-cannot-show-title" data-section="cannot-show">
          <h3 id="journal-cannot-show-title">What this world cannot show</h3>
          <ul>
            {cannotShow.map((item) => (
              <li key={item.text}>
                <OriginTag origin={item.origin} placeholder={item.placeholder ?? false} quiet />
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="legend" aria-labelledby="journal-legend-title">
        <h3 id="journal-legend-title">Where each statement comes from</h3>
        <ul>
          {ORIGINS.map((origin) => (
            <li key={origin}>
              <OriginTag origin={origin} />
              <span>
                {ORIGIN_LABELS[origin]}: {ORIGIN_MEANINGS[origin]}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
