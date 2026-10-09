/**
 * /world/hook: the hook level on the game-first shell (ADR-0008), with hard-coded content
 * until WorldSpec. The stage fills the window and frames the field in the room the HUD leaves
 * free; the world card, level map, guide and level card lie over it, and the paper journal
 * slides over on demand. The control moves the real engine parameter, and every number shown
 * comes from the primitive.
 */
import { flockDefaultParams } from "@paperplay/primitives";
import { DEFAULT_CAMERA } from "@paperplay/ui/stage-core";
import {
  BirdMark,
  BookIcon,
  Guide,
  HeadingCompass,
  isDepth,
  LevelCard,
  LevelMap,
  OriginTag,
  PaperJournal,
  PlayIcon,
  useFreeRect,
  WorldStage,
  type Depth,
  type GuideLine,
  type MapLevel,
} from "@paperplay/ui/react";
import { useCallback, useRef, useState } from "react";
import { HOOK_SEED, LOCAL_ACTIONS, LOCAL_CONTROLS } from "../world/local-world.ts";
import { createWorldSession, type WorldSession } from "../world/session.ts";
import { guideLines, trendOf, type Trend } from "./guide.ts";
import { HOOK, LEVELS, PASSAGE } from "./hook-content.ts";

const STAGE_LABEL = `Murmuration Valley: a flock of ${flockDefaultParams.agentCount} birds with no leader, each steering only by its near neighbours.`;
const DEPTH_KEY = "paperplay.depth";
/** About a second and a half of readouts, for the guide's trend. */
const TREND_SAMPLES = 15;

const action = LOCAL_CONTROLS.find((entry) => entry.actionId === HOOK.control.actionId);
if (!action) throw new Error(`the local world has no control ${HOOK.control.actionId}`);
const [MIN, MAX] = action.range;
const START = action.defaultValue;

const prefersReducedMotion = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const narrow = (): boolean => window.matchMedia("(max-width: 760px)").matches;

function openSession(): WorldSession {
  return createWorldSession({ seed: HOOK_SEED, params: flockDefaultParams, actions: LOCAL_ACTIONS, playing: !prefersReducedMotion() });
}

function readDepth(): Depth {
  try {
    const stored = window.localStorage.getItem(DEPTH_KEY);
    return isDepth(stored) ? stored : "beginner";
  } catch {
    return "beginner";
  }
}

export function HookWorld() {
  const [session] = useState(openSession);
  const [snapshot, setSnapshot] = useState(() => session.snapshot());
  const [trend, setTrend] = useState<Trend>("steady");
  const [lastAction, setLastAction] = useState<{ from: number; to: number } | null>(null);
  const [cue, setCue] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [explored, setExplored] = useState(() => ({ low: snapshot.params.alignmentWeight, high: snapshot.params.alignmentWeight }));
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

  const refresh = useCallback(() => {
    const next = session.snapshot();
    samples.current = [...samples.current, next.observed.directionalAgreement].slice(-TREND_SAMPLES);
    setSnapshot(next);
    setTrend(trendOf(samples.current));
  }, [session]);

  const value = snapshot.params.alignmentWeight;
  const agreement = snapshot.observed.directionalAgreement;
  const span = MAX - MIN;
  // The next level opens once the control has been moved through its range: touched, not solved.
  const unlocked = explored.low <= MIN + span / 4 && explored.high >= MAX - span / 4;
  const [did, saw] = guideLines({ lastAction, alignment: value, agreement, trend, playing: snapshot.playing, depth });
  const lines: readonly GuideLine[] = [notice ? { text: notice, origin: "teaching-choice" } : did, saw];
  const levels: readonly MapLevel[] = LEVELS.map((level, index) => ({ ...level, state: index === 0 ? "now" : index === 1 && unlocked ? "open" : "locked" }));

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
    setCue((count) => count + 1);
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
    setHighlight(atPassage ? HOOK.id : null);
    setJournal(true);
  };

  const closeJournal = () => {
    setJournal(false);
    setHighlight(null);
    opener.current?.focus({ preventScroll: true });
  };

  // Tapping a passage focuses its control (R05); on a narrow screen the journal steps aside first.
  const tryIt = () => {
    if (narrow()) setJournal(false);
    setHighlight(HOOK.id);
    requestAnimationFrame(() => slider.current?.focus({ preventScroll: true }));
  };

  return (
    <main ref={container} className="game" data-step={snapshot.step} data-depth={depth} data-journal={journal ? "open" : "closed"}>
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
              <h1>Murmuration Valley</h1>
              <p>A PaperPlay world about flocking</p>
            </div>
          </div>

          <LevelMap
            levels={levels}
            onEnter={(id) => {
              if (id === HOOK.id) return;
              const level = LEVELS.find((entry) => entry.id === id);
              setNotice(`${level?.title ?? "That level"} comes with the authored world. Only the hook is built so far.`);
              setCue((count) => count + 1);
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
              <h2 id="what-if-title">{HOOK.whatIf.question}</h2>
              <p>
                <OriginTag origin="teaching-choice" quiet /> {HOOK.whatIf.answer}
              </p>
              <button type="button" className="btn btn-light" onClick={() => setWhatIf(false)}>
                Back to one world
              </button>
            </section>
          ) : null}

          <LevelCard
            kicker={`Level 1 of ${LEVELS.length}`}
            title={HOOK.title}
            goal={HOOK.goal}
            control={{
              label: HOOK.control.label,
              min: MIN,
              max: MAX,
              step: HOOK.control.step,
              value,
              unit: HOOK.control.unit,
              ends: HOOK.control.ends,
              origin: "paper-derived",
              placeholder: PASSAGE.placeholder,
              anchored: true,
            }}
            depth={depth}
            onDepth={setDepth}
            onChange={setAlignment}
            onControlFocus={() => {
              if (journal) setHighlight(HOOK.id);
            }}
            onFromPaper={(from) => openJournal(from, true)}
            readout={
              <HeadingCompass
                angles={snapshot.headings.angles}
                mean={snapshot.headings.mean}
                agreement={agreement}
                yaw={yaw}
                showNumber={depth !== "beginner"}
              />
            }
            advanced={
              <p>
                <OriginTag origin="teaching-choice" quiet /> {HOOK.explain.advanced}
              </p>
            }
            whatIfOpen={whatIf}
            whatIfId="what-if"
            onWhatIf={() => setWhatIf((open) => !open)}
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
        pages={[
          {
            id: HOOK.id,
            heading: `Level 1 · ${HOOK.title}`,
            passage: PASSAGE,
            control: HOOK.control.label,
            detail: (
              <>
                <p>
                  <OriginTag origin="teaching-choice" quiet /> Called “{HOOK.control.label}” here. It runs from {MIN}, {HOOK.control.ends[0].toLowerCase()}, to{" "}
                  {MAX}, {HOOK.control.ends[1].toLowerCase()}, {HOOK.control.unit}, and starts at {START}.
                </p>
                <p>
                  <OriginTag origin="teaching-choice" quiet /> {HOOK.explain[depth]}
                </p>
              </>
            ),
          },
        ]}
        stillToFind={LEVELS.slice(1).map((level, index) => ({ number: index + 2, title: level.title }))}
      />
    </main>
  );
}
