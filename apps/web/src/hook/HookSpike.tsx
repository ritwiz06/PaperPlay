/**
 * /world/hook: the game-first design spike (ADR-0008), with hard-coded content. The stage
 * fills the window; a world card, the level map, the guide and the level card lie over it,
 * and the paper journal slides over on demand. The control moves the real engine parameter,
 * and every number shown comes from the primitive. It is a spike: the shell proper, with its
 * components in packages/ui, comes once the owner has reviewed it.
 */
import type { Origin } from "@paperplay/contracts";
import { flockDefaultParams } from "@paperplay/primitives";
import { ORIGIN_LABELS, ORIGIN_MEANINGS, ORIGINS, WorldStage } from "@paperplay/ui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { HOOK_SEED, LOCAL_ACTIONS, LOCAL_CONTROLS } from "../world/local-world.ts";
import { createWorldSession, type WorldSession } from "../world/session.ts";
import { guideLines, trendOf, type Trend } from "./guide.ts";
import { CHIP_WORDS, DEPTHS, HOOK, LEVELS, PASSAGE, type Depth } from "./hook-content.ts";
import "./hook.css";

const STAGE_LABEL = `Murmuration Valley: a flock of ${flockDefaultParams.agentCount} birds with no leader, each steering only by its near neighbours.`;
const DEPTH_KEY = "paperplay.depth";
/** About a second and a half of readouts, for the guide's trend. */
const TREND_SAMPLES = 15;

const control = LOCAL_CONTROLS.find((action) => action.actionId === HOOK.control.actionId);
if (!control) throw new Error(`the local world has no control ${HOOK.control.actionId}`);
const [MIN, MAX] = control.range;

const prefersReducedMotion = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const narrow = (): boolean => window.matchMedia("(max-width: 760px)").matches;

function openSession(): WorldSession {
  return createWorldSession({ seed: HOOK_SEED, params: flockDefaultParams, actions: LOCAL_ACTIONS, playing: !prefersReducedMotion() });
}

function readDepth(): Depth {
  try {
    const stored = window.localStorage.getItem(DEPTH_KEY);
    return DEPTHS.some((entry) => entry.depth === stored) ? (stored as Depth) : "beginner";
  } catch {
    return "beginner";
  }
}

/** An origin in a word or two; the full name and meaning are read out, and shown on hover. */
function Chip({ origin }: { readonly origin: Origin }) {
  return (
    <span className={`chip chip-${origin}`} title={`${ORIGIN_LABELS[origin]}: ${ORIGIN_MEANINGS[origin]}`}>
      <span aria-hidden="true">{CHIP_WORDS[origin]}</span>
      <span className="sr-only">{ORIGIN_LABELS[origin]}</span>
    </span>
  );
}

function DepthToggle({ name, value, onChange }: { readonly name: string; readonly value: Depth; readonly onChange: (depth: Depth) => void }) {
  return (
    <fieldset className="depth">
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

function BirdMark() {
  return (
    <svg className="bird-mark" width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="15" fill="var(--aqua)" stroke="var(--ink)" strokeWidth="2" />
      <path d="M9 20 L24 12 L19 22 L16 18 Z" fill="var(--ink)" />
    </svg>
  );
}

function PlayIcon({ playing }: { readonly playing: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      {playing ? <path d="M4 3 H7 V13 H4 Z M9 3 H12 V13 H9 Z" fill="currentColor" /> : <path d="M4 2.5 L13 8 L4 13.5 Z" fill="currentColor" />}
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 3.5 Q5 2 8 3.5 Q11 2 14 3.5 V13 Q11 11.5 8 13 Q5 11.5 2 13 Z M8 3.5 V13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function HookSpike() {
  const [session] = useState(openSession);
  const [snapshot, setSnapshot] = useState(() => session.snapshot());
  const [trend, setTrend] = useState<Trend>("steady");
  const [lastAction, setLastAction] = useState<{ from: number; to: number } | null>(null);
  const [explored, setExplored] = useState(() => ({ low: snapshot.params.alignmentWeight, high: snapshot.params.alignmentWeight }));
  const [depth, setDepthState] = useState<Depth>(readDepth);
  const [journal, setJournal] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const [whatIf, setWhatIf] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const samples = useRef<number[]>([]);
  const slider = useRef<HTMLInputElement>(null);
  const passage = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  const refresh = useCallback(() => {
    const next = session.snapshot();
    samples.current = [...samples.current, next.observed.directionalAgreement].slice(-TREND_SAMPLES);
    setSnapshot(next);
    setTrend(trendOf(samples.current));
  }, [session]);

  // When the journal opens, focus moves into it: to the passage if it was asked for, else to Close.
  useEffect(() => {
    if (!journal) return;
    (highlight ? passage.current : closeButton.current)?.focus({ preventScroll: true });
  }, [journal, highlight]);

  const value = snapshot.params.alignmentWeight;
  const agreement = snapshot.observed.directionalAgreement;
  const span = MAX - MIN;
  // The next level opens once the control has been moved through its range: touched, not solved.
  const unlocked = explored.low <= MIN + span / 4 && explored.high >= MAX - span / 4;
  const [did, saw] = guideLines({ lastAction, alignment: value, agreement, trend, playing: snapshot.playing, depth });

  const setDepth = (next: Depth) => {
    setDepthState(next);
    try {
      window.localStorage.setItem(DEPTH_KEY, next);
    } catch {
      // A browser that refuses storage keeps the choice for this visit only.
    }
  };

  const setAlignment = (next: number) => {
    setLastAction({ from: value, to: next });
    setExplored((range) => ({ low: Math.min(range.low, next), high: Math.max(range.high, next) }));
    setNotice(null);
    samples.current = [];
    session.setAction(HOOK.control.actionId, next);
    refresh();
  };

  const togglePlay = () => {
    if (session.snapshot().playing) session.pause();
    else session.play();
    refresh();
  };

  const openJournal = (from: HTMLElement, atPassage: boolean) => {
    opener.current = from;
    setHighlight(atPassage);
    setJournal(true);
  };

  const closeJournal = () => {
    setJournal(false);
    setHighlight(false);
    opener.current?.focus();
  };

  // Tapping the passage focuses its control; on a narrow screen the journal gets out of the way first.
  const focusControl = () => {
    if (narrow()) setJournal(false);
    setHighlight(true);
    requestAnimationFrame(() => slider.current?.focus({ preventScroll: true }));
  };

  return (
    <main className="hook" data-step={snapshot.step} data-depth={depth} data-journal={journal ? "open" : "closed"}>
      <WorldStage driver={session} label={STAGE_LABEL} tool="look" onTogglePlay={togglePlay} onReadout={refresh} />

      <div className="hud">
        <header className="hud-top">
          <div className="card world-card">
            <BirdMark />
            <div>
              <h1>Murmuration Valley</h1>
              <p>A PaperPlay world about flocking</p>
            </div>
          </div>

          <nav className="card level-map" aria-label="Levels">
            <ol>
              {LEVELS.map((level, index) => {
                const state = index === 0 ? "now" : index === 1 && unlocked ? "open" : "locked";
                return (
                  <li key={level.id} className={state}>
                    <button
                      type="button"
                      aria-current={state === "now" ? "step" : undefined}
                      disabled={state === "locked"}
                      title={state === "locked" ? `${level.title}: not reached yet` : level.title}
                      onClick={() => {
                        if (state === "open") setNotice(`${level.title} comes with the authored world. This spike has only the hook.`);
                      }}
                    >
                      <span className="dot" aria-hidden="true">
                        {index + 1}
                      </span>
                      <span className={state === "now" ? "level-name" : "sr-only"}>
                        {level.title}
                        {state === "locked" ? ", not reached yet" : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="hud-buttons">
            <button type="button" className="btn btn-light" onClick={togglePlay}>
              <PlayIcon playing={snapshot.playing} />
              <span className="btn-text">{snapshot.playing ? "Pause" : "Play"}</span>
            </button>
            <button
              type="button"
              className="btn"
              aria-expanded={journal}
              aria-controls="journal"
              onClick={(event) => (journal ? closeJournal() : openJournal(event.currentTarget, false))}
            >
              <BookIcon />
              <span className="btn-text">Journal</span>
            </button>
          </div>
        </header>

        <div className="hud-bottom">
          {whatIf ? null : (
            <aside className="card guide" aria-label="Guide">
              <BirdMark />
              <ul>
                <li aria-live="polite">
                  <Chip origin="teaching-choice" /> <span>{notice ?? did.text}</span>
                </li>
                <li>
                  <Chip origin={saw.origin} /> <span>{saw.text}</span>
                </li>
              </ul>
            </aside>
          )}

          {whatIf ? (
            <section id="what-if" className="card what-if" aria-labelledby="what-if-title">
              <h2 id="what-if-title">{HOOK.whatIf.question}</h2>
              <p>
                <Chip origin="teaching-choice" /> {HOOK.whatIf.answer}
              </p>
              <button type="button" className="btn btn-light" onClick={() => setWhatIf(false)}>
                Back to one world
              </button>
            </section>
          ) : null}

          <section className="card level-card" aria-labelledby="level-title">
            <div className="level-top">
              <p className="level-kicker">Level 1 of {LEVELS.length}</p>
              <DepthToggle name="depth-card" value={depth} onChange={setDepth} />
            </div>
            <h2 id="level-title">{HOOK.title}</h2>
            <p id="hook-goal" className="level-goal">
              {HOOK.goal}
            </p>

            <div className="control-line">
              <label htmlFor="hook-control">{HOOK.control.label}</label>
              <Chip origin="teaching-choice" />
              <button type="button" className="from-paper" onClick={(event) => openJournal(event.currentTarget, true)}>
                <BookIcon /> From the paper
              </button>
            </div>
            <div className="slider-row">
              <input
                id="hook-control"
                ref={slider}
                type="range"
                min={MIN}
                max={MAX}
                step={HOOK.control.step}
                value={value}
                aria-describedby={depth === "advanced" ? "hook-goal hook-explain" : "hook-goal"}
                aria-valuetext={`${value.toFixed(2)} ${HOOK.control.unit}`}
                onChange={(event) => setAlignment(Number(event.currentTarget.value))}
                onFocus={() => {
                  if (journal) setHighlight(true);
                }}
              />
              <output htmlFor="hook-control" className="value-pill">
                {value.toFixed(2)}
              </output>
            </div>
            {depth === "advanced" ? (
              <p id="hook-explain" className="explain">
                <Chip origin="teaching-choice" /> {HOOK.explain.advanced}
              </p>
            ) : null}

            <div className="level-foot">
              <p className="readout-line">
                <span>Agreement</span>
                <output data-observable="directionalAgreement" data-value={String(agreement)}>
                  {agreement.toFixed(2)}
                </output>
                <span className="unit">of 1</span>
                <Chip origin="computed-observation" />
              </p>
              <button type="button" className="btn" aria-expanded={whatIf} aria-controls="what-if" onClick={() => setWhatIf((open) => !open)}>
                What if
              </button>
            </div>
          </section>
        </div>
      </div>

      <aside
        id="journal"
        className={journal ? "card journal open" : "card journal"}
        aria-labelledby="journal-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") closeJournal();
        }}
      >
        <div className="journal-head">
          <h2 id="journal-title">Paper journal</h2>
          <button ref={closeButton} type="button" className="btn btn-light btn-icon" aria-label="Close the journal" onClick={closeJournal}>
            ×
          </button>
        </div>
        <p className="journal-intro">Each level adds the passage of the paper it comes from. Tap a passage to try its control.</p>
        <DepthToggle name="depth-journal" value={depth} onChange={setDepth} />

        <ol className="pages">
          <li className={highlight ? "page highlighted" : "page"}>
            <p className="page-level">Level 1 · {LEVELS[0]?.title}</p>
            <button ref={passage} type="button" className="passage" onClick={focusControl}>
              <span className="passage-head">
                <Chip origin="paper-derived" />
                <span className="placeholder-tag">Placeholder</span>
              </span>
              <span className="passage-title">{PASSAGE.title}</span>
              <span className="passage-text">{PASSAGE.text}</span>
              <span className="passage-locator">{PASSAGE.locator}</span>
              <span className="passage-try">Try it: {HOOK.control.label}</span>
            </button>
            <p className="in-this-world">
              <Chip origin="teaching-choice" /> {HOOK.explain[depth]}
            </p>
          </li>
          <li className="page locked">
            <p className="page-level">Still to find</p>
            <ul className="locked-list">
              {LEVELS.slice(1).map((level, index) => (
                <li key={level.id}>
                  <span className="dot" aria-hidden="true">
                    {index + 2}
                  </span>
                  {level.title}
                </li>
              ))}
            </ul>
            <p className="locked-note">Each page appears when you reach its level.</p>
          </li>
        </ol>

        <section className="legend" aria-labelledby="legend-title">
          <h3 id="legend-title">Where each statement comes from</h3>
          <ul>
            {ORIGINS.map((origin) => (
              <li key={origin}>
                <Chip origin={origin} />
                <span>
                  {ORIGIN_LABELS[origin]}: {ORIGIN_MEANINGS[origin]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </main>
  );
}
