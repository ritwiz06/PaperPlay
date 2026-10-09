/**
 * /world/hook: the flocking world on the game-first shell (ADR-0008), played from its WorldSpec
 * as the builder made it (ADR-0016). The stage fills the window and frames the field in the room
 * the HUD leaves free; the world card, level map, guide and level card lie over it, and the paper
 * journal slides over on demand. Each level's one control moves its real engine variable, and
 * every number shown comes from the primitive. A level opens once the one before has been moved
 * through its range: touched, never solved.
 */
import { isPlaceholder, type AnchorRef, type PendingSource, type SourceManifest } from "@paperplay/contracts";
import type { BuiltLevel } from "@paperplay/pipeline";
import { flockDefaultParams, type FlockObservables } from "@paperplay/primitives";
import { DEFAULT_CAMERA } from "@paperplay/ui/stage-core";
import {
  BirdMark,
  BookIcon,
  Guide,
  GroupsCounter,
  HeadingCompass,
  isDepth,
  LevelCard,
  LevelMap,
  OriginTag,
  PaperJournal,
  PlayIcon,
  SpacingGauge,
  useFreeRect,
  WorldStage,
  type Depth,
  type GuideLine,
  type JournalPassage,
  type MapLevel,
} from "@paperplay/ui/react";
import { useRef, useState, type ReactNode } from "react";
import { FLOCKING, sessionOptionsFor } from "../world/authored-world.ts";
import { createWorldSession, type SessionSnapshot, type WorldSession } from "../world/session.ts";
import { guideLines, trendOf, type Trend } from "./guide.ts";

const WORLD = FLOCKING;
const LEVELS = WORLD.levels;
const STAGE_LABEL = `${WORLD.title}: a flock of ${flockDefaultParams.agentCount} birds with no leader, each steering only by its near neighbours.`;
const DEPTH_KEY = "paperplay.depth";
/** About a second and a half of readouts, for the guide's trend. */
const TREND_SAMPLES = 15;

const prefersReducedMotion = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const narrow = (): boolean => window.matchMedia("(max-width: 760px)").matches;

function levelAt(index: number): BuiltLevel {
  const level = LEVELS[index];
  if (!level) throw new Error(`the world has no level ${index + 1}`);
  return level;
}

function readDepth(): Depth {
  try {
    const stored = window.localStorage.getItem(DEPTH_KEY);
    return isDepth(stored) ? stored : "beginner";
  } catch {
    return "beginner";
  }
}

interface Explored {
  readonly low: number;
  readonly high: number;
}

/** Whether a level's control has been moved through its range: to within a quarter of each end. */
function exploredThrough(level: BuiltLevel, explored: Explored | undefined): boolean {
  if (!explored) return false;
  const [min, max] = level.action.range;
  const span = max - min;
  return explored.low <= min + span / 4 && explored.high >= max - span / 4;
}

/** Each level is open once every level before it has been moved through its range. */
function openLevels(explored: Readonly<Record<string, Explored>>): boolean[] {
  const open: boolean[] = [];
  LEVELS.forEach((level, index) => {
    const before = LEVELS[index - 1];
    open.push(index === 0 || ((open[index - 1] ?? false) && before !== undefined && exploredThrough(before, explored[before.id])));
  });
  return open;
}

const placeholderOnly = (anchors: readonly AnchorRef[]): boolean => anchors.length > 0 && anchors.every(isPlaceholder);
const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

/** "Reynolds 1987": the attribution every passage carries. */
function citationOf(source: SourceManifest | PendingSource): string {
  const surname = source.authors[0]?.split(" ").at(-1) ?? source.title;
  return `${surname}${source.authors.length > 1 ? " et al." : ""} ${source.year}`;
}

/** The journal's passage for a level: the anchored quote, a placeholder that says so, or a page beyond the paper. */
function passageOf(level: BuiltLevel): JournalPassage {
  const { caption } = level;
  const anchor = caption.anchors[0];
  const cite = citationOf(WORLD.source);
  if (!anchor) return { title: caption.text, text: "A page beyond the paper: nothing here is quoted from it.", origin: caption.origin };
  if (isPlaceholder(anchor)) {
    return {
      title: caption.text,
      text: `Placeholder, quoting nothing yet. It will hold ${lowerFirst(anchor.need)}`,
      locator: `${cite}. Its section and page arrive with the source map.`,
      origin: caption.origin,
      placeholder: true,
    };
  }
  const section = "sections" in WORLD.source ? WORLD.source.sections.find((entry) => entry.id === anchor.sectionId) : undefined;
  return {
    title: caption.text,
    text: `“${anchor.quote}”`,
    locator: [cite, section?.title, anchor.page === undefined ? null : `page ${anchor.page}`].filter(Boolean).join(", "),
    origin: caption.origin,
  };
}

/** A variable's name in words: the control's own label, or the parameter spelled out. */
function nameOf(level: BuiltLevel, variable: string): string {
  return variable === level.action.variable ? `“${level.action.label}”` : variable.replace(/([A-Z])/g, " $1").toLowerCase();
}

/** The level's readout, chosen by its observable; it shows the primitive's own value. */
function readoutFor(level: BuiltLevel, snapshot: SessionSnapshot, showNumber: boolean, yaw: number): ReactNode {
  const { observed } = snapshot;
  switch (level.observable.metricId) {
    case "directionalAgreement":
      return <HeadingCompass angles={snapshot.headings.angles} mean={snapshot.headings.mean} agreement={observed.directionalAgreement} yaw={yaw} showNumber={showNumber} />;
    case "meanNeighbourDistance":
      return <SpacingGauge spacing={observed.meanNeighbourDistance} showNumber={showNumber} />;
    case "clusterCount":
      return <GroupsCounter groups={observed.clusterCount} strayShare={observed.strayShare} birds={snapshot.headings.angles.length} showNumber={showNumber} />;
    default: {
      const value = observed[level.observable.metricId as keyof FlockObservables];
      return (
        <output className="dial-number" data-element="readout-number" data-observable={level.observable.metricId} data-value={String(value)}>
          {value.toFixed(level.observable.decimals)}
        </output>
      );
    }
  }
}

export function HookWorld() {
  const [session] = useState<WorldSession>(() => createWorldSession(sessionOptionsFor(levelAt(0), !prefersReducedMotion())));
  const [snapshot, setSnapshot] = useState(() => session.snapshot());
  const [index, setIndex] = useState(0);
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set([levelAt(0).id]));
  const [explored, setExplored] = useState<Readonly<Record<string, Explored>>>({});
  const [trend, setTrend] = useState<Trend>("steady");
  const [lastAction, setLastAction] = useState<{ from: number; to: number } | null>(null);
  const [cue, setCue] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [depth, setDepthState] = useState<Depth>(readDepth);
  const [journal, setJournal] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [whatIf, setWhatIf] = useState(false);
  const [yaw, setYaw] = useState(DEFAULT_CAMERA.yaw);
  const container = useRef<HTMLElement>(null);
  const free = useFreeRect(container);
  const samples = useRef<number[]>([]);
  const slider = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  const level = levelAt(index);
  const metric = level.observable.metricId as keyof FlockObservables;
  const [min, max] = level.action.range;
  const visible = level.visible[depth];
  /** The level being played, set on entering one, for readouts that arrive while it loads. */
  const entered = useRef(levelAt(0));

  const refresh = () => {
    const now = entered.current;
    const next = session.snapshot();
    samples.current = [...samples.current, next.observed[now.observable.metricId as keyof FlockObservables]].slice(-TREND_SAMPLES);
    setSnapshot(next);
    setTrend(trendOf(samples.current, now.guide.trend.within));
  };

  const value = snapshot.params[level.action.variable as keyof SessionSnapshot["params"]];
  const open = openLevels(explored);
  const [did, saw] = guideLines(level.guide, { min, step: level.action.step }, level.observable, {
    lastAction,
    value,
    observed: snapshot.observed[metric],
    trend,
    playing: snapshot.playing,
    depth,
  });
  const lines: readonly GuideLine[] = [notice ? { text: notice, origin: "teaching-choice" } : did, saw];
  const levels: readonly MapLevel[] = LEVELS.map((entry, at) => ({
    id: entry.id,
    title: entry.title,
    bonus: entry.bonus,
    state: at === index ? "now" : open[at] ? "open" : "locked",
  }));

  const setDepth = (next: Depth) => {
    setDepthState(next);
    try {
      window.localStorage.setItem(DEPTH_KEY, next);
    } catch {
      // A browser that refuses storage keeps the choice for this visit only.
    }
  };

  const enter = (next: number) => {
    const target = levelAt(next);
    entered.current = target;
    session.load(sessionOptionsFor(target, session.snapshot().playing));
    samples.current = [];
    setIndex(next);
    setVisited((seen) => new Set(seen).add(target.id));
    setLastAction(null);
    setNotice(null);
    setWhatIf(false);
    setHighlight((shown) => (shown === null ? null : target.id));
    setSnapshot(session.snapshot());
    setTrend("steady");
  };

  const setControl = (next: number) => {
    const range = explored[level.id] ?? { low: level.action.defaultValue, high: level.action.defaultValue };
    const widened = { low: Math.min(range.low, next), high: Math.max(range.high, next) };
    const following = LEVELS[index + 1];
    const opensNext = following !== undefined && !exploredThrough(level, range) && exploredThrough(level, widened) && !open[index + 1];
    setExplored((all) => ({ ...all, [level.id]: widened }));
    setNotice(opensNext ? `${following.bonus ? "A bonus level" : `Level ${following.order}`} is open on the map: ${following.title}.` : null);
    setLastAction({ from: value, to: next });
    setCue((count) => count + 1);
    samples.current = [];
    session.setAction(level.action.actionId, next);
    refresh();
  };

  const togglePlay = () => {
    if (session.snapshot().playing) session.pause();
    else session.play();
    refresh();
  };

  const openJournal = (from: HTMLElement, atPassage: boolean) => {
    opener.current = from;
    setHighlight(atPassage ? level.id : null);
    setJournal(true);
  };

  const closeJournal = () => {
    setJournal(false);
    setHighlight(null);
    opener.current?.focus({ preventScroll: true });
  };

  // Tapping a passage focuses its control (R05), entering its level first; on a narrow screen the journal steps aside.
  const tryIt = (pageId: string) => {
    const at = LEVELS.findIndex((entry) => entry.id === pageId);
    if (at >= 0 && at !== index) enter(at);
    if (narrow()) setJournal(false);
    setHighlight(pageId);
    requestAnimationFrame(() => slider.current?.focus({ preventScroll: true }));
  };

  const fork = level.fork;
  const overrides = fork.overrides.map((override) => `${nameOf(level, override.variable)} at ${override.to} (here ${override.from})`).join(" and ");
  const advanced = level.explanation.advanced;

  return (
    <main ref={container} className="game" data-level={level.id} data-step={snapshot.step} data-depth={depth} data-journal={journal ? "open" : "closed"}>
      <WorldStage
        driver={session}
        label={STAGE_LABEL}
        tool="look"
        window={free}
        framing="follow"
        look={{ birdColor: "heading" }}
        onTogglePlay={togglePlay}
        onReadout={refresh}
        onView={(view) => setYaw(view.yaw)}
      />

      <div className="hud">
        <header className="hud-top">
          <div className="card world-card" data-hud data-hud-frame>
            <BirdMark />
            <div>
              <h1>{WORLD.title}</h1>
              <p>A PaperPlay world about flocking</p>
            </div>
          </div>

          <LevelMap
            levels={levels}
            onEnter={(id) => {
              const at = LEVELS.findIndex((entry) => entry.id === id);
              if (at >= 0 && at !== index && open[at]) enter(at);
            }}
          />

          <div className="hud-buttons" data-hud data-hud-frame>
            <button type="button" className="btn btn-light" onClick={togglePlay}>
              <PlayIcon playing={snapshot.playing} />
              <span className="btn-text">{snapshot.playing ? "Pause" : "Play"}</span>
            </button>
            <button
              type="button"
              className="btn"
              aria-expanded={journal}
              aria-controls="paper-journal"
              onClick={(event) => (journal ? closeJournal() : openJournal(event.currentTarget, false))}
            >
              <BookIcon />
              <span className="btn-text">Journal</span>
            </button>
          </div>
        </header>

        <div className="hud-bottom">
          <Guide lines={lines} cue={cue} quiet={whatIf} />

          {whatIf ? (
            <section id="what-if" className="card what-if" aria-labelledby="what-if-title" data-hud>
              <h2 id="what-if-title">{fork.prompt}</h2>
              <p>
                <OriginTag origin={fork.origin} placeholder={placeholderOnly(fork.anchors)} quiet /> {fork.effect}
              </p>
              <p className="what-if-runs">
                <OriginTag origin="teaching-choice" quiet /> The other world runs with {overrides}.
                {fork.restarts ? <span data-restarts=""> Both worlds restart from the same seed.</span> : null}
              </p>
              <button type="button" className="btn btn-light" onClick={() => setWhatIf(false)}>
                Back to one world
              </button>
            </section>
          ) : null}

          <LevelCard
            key={level.id}
            kicker={level.bonus ? `Bonus level, ${level.order} of ${LEVELS.length}` : `Level ${level.order} of ${LEVELS.length}`}
            title={level.title}
            goal={level.goal}
            control={{
              label: level.action.label,
              min,
              max,
              step: level.action.step,
              value,
              unit: level.action.unit,
              ends: level.action.ends,
              origin: level.action.origin,
              placeholder: placeholderOnly(level.action.anchors),
              anchored: level.action.anchors.length > 0,
            }}
            depth={depth}
            visible={visible}
            onDepth={setDepth}
            onChange={setControl}
            onControlFocus={() => {
              if (journal) setHighlight(level.id);
            }}
            onFromPaper={(from) => openJournal(from, true)}
            readout={readoutFor(level, snapshot, visible.has("readout-number"), yaw)}
            equation={
              advanced.equation ? (
                <p>
                  <OriginTag origin={advanced.origin} placeholder={placeholderOnly(advanced.anchors)} quiet /> {advanced.equation}
                </p>
              ) : null
            }
            whatIfOpen={whatIf}
            whatIfId="what-if"
            onWhatIf={() => setWhatIf((shown) => !shown)}
            sliderRef={slider}
          />
        </div>
      </div>

      <PaperJournal
        open={journal}
        onClose={closeJournal}
        depth={depth}
        onDepth={setDepth}
        highlighted={highlight}
        onTryIt={tryIt}
        pages={LEVELS.filter((entry) => visited.has(entry.id)).map((entry) => {
          const variant = entry.explanation[depth];
          const shown = entry.visible[depth];
          const nextOpen = open[entry.order] ?? false;
          return {
            id: entry.id,
            heading: `Level ${entry.order} · ${entry.title}${entry.bonus ? " · a bonus page" : ""}`,
            passage: passageOf(entry),
            control: entry.action.label,
            detail: (
              <>
                <p>
                  <OriginTag origin="teaching-choice" quiet /> Called “{entry.action.label}” here. It runs from {entry.action.range[0]},{" "}
                  {entry.action.ends[0].toLowerCase()}, to {entry.action.range[1]}, {entry.action.ends[1].toLowerCase()}, {entry.action.unit}, and starts at{" "}
                  {entry.action.defaultValue}.
                </p>
                <p>
                  <OriginTag origin={variant.origin} placeholder={placeholderOnly(variant.anchors)} quiet /> {variant.text}
                </p>
                {shown.has("analogy") && variant.analogy ? (
                  <p data-element="analogy">
                    <OriginTag origin="teaching-choice" quiet /> {variant.analogy}
                  </p>
                ) : null}
                {entry.furtherReading.length > 0 ? (
                  <div>
                    <p>
                      <OriginTag origin="teaching-choice" quiet /> Further reading, beyond the paper:
                    </p>
                    <ul>
                      {entry.furtherReading.map((citation) => (
                        <li key={citation}>{citation}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {nextOpen ? (
                  <p>
                    <OriginTag origin="teaching-choice" quiet /> Going on: {entry.carryForward}
                  </p>
                ) : null}
              </>
            ),
          };
        })}
        stillToFind={LEVELS.filter((entry) => !visited.has(entry.id)).map((entry) => ({ number: entry.order, title: entry.bonus ? `Bonus: ${entry.title}` : entry.title }))}
      />
    </main>
  );
}
