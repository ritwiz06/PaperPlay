import type { Action } from "@paperplay/contracts";
import { flockDefaultParams, type FlockParams } from "@paperplay/primitives/flock";
import { LabBench, OriginChip, Readout, WorldStage, type BenchControl, type StageTool } from "@paperplay/ui/react";
import { useCallback, useState } from "react";
import { CONTROL_NOTES, HOOK_SEED, LOCAL_ACTIONS, LOCAL_CONTROLS, PRIMARY_ACTION, type LocalActionId } from "./local-world.ts";
import { createWorldSession, type SessionSnapshot, type WorldSession } from "./session.ts";

const TOOLS: readonly { readonly tool: StageTool; readonly label: string }[] = [
  { tool: "look", label: "Look around" },
  { tool: "beacon", label: "Place a beacon" },
  { tool: "obstacle", label: "Place an obstacle" },
  { tool: "bird", label: "Pick a bird" },
];

const STAGE_LABEL = `Murmuration Valley: a flock of ${flockDefaultParams.agentCount} birds, each steering only by its near neighbours.`;

const prefersReducedMotion = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/** "beacon-2" → "Beacon 2", "rock-1" → "Obstacle 1". */
function entityName(id: string): string {
  const [kind, number] = id.split("-");
  return `${kind === "rock" ? "Obstacle" : "Beacon"} ${number ?? ""}`;
}

function openSession(): WorldSession {
  return createWorldSession({ seed: HOOK_SEED, params: flockDefaultParams, actions: LOCAL_ACTIONS, playing: !prefersReducedMotion() });
}

/**
 * /world/local: the flock primitive on the hook seed, with live rule controls, placement, the
 * selected-neighbour view, next seed and replay same seed. It renders the session's state and
 * submits the learner's actions; every number it shows comes from the primitive.
 */
export function LocalWorld() {
  const [session] = useState(openSession);
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(() => session.snapshot());
  const [tool, setTool] = useState<StageTool>("look");
  const [byHeading, setByHeading] = useState(false);
  const refresh = useCallback(() => setSnapshot(session.snapshot()), [session]);
  const act = (change: () => void) => {
    change();
    refresh();
  };
  const togglePlay = () => act(() => (session.snapshot().playing ? session.pause() : session.play()));

  const { params, observed, selected } = snapshot;
  const bench = (action: Action): BenchControl => {
    const notes = CONTROL_NOTES[action.actionId as LocalActionId];
    return {
      actionId: action.actionId,
      label: action.label,
      unit: action.unit,
      min: action.range[0],
      max: action.range[1],
      step: notes.step,
      value: params[action.targetVariable as keyof FlockParams],
      help: notes.help,
      origin: action.origin,
    };
  };
  const primary = LOCAL_CONTROLS.find((action) => action.actionId === PRIMARY_ACTION);
  if (!primary) throw new Error(`the local world has no control ${PRIMARY_ACTION}`);
  const rules = LOCAL_CONTROLS.filter((action) => action !== primary);
  const canRestore = Object.values(LOCAL_ACTIONS).some((parameter) => params[parameter] !== flockDefaultParams[parameter]);
  const placed = [...snapshot.beacons, ...snapshot.obstacles];

  return (
    <div
      className="world"
      data-seed={snapshot.seed}
      data-step={snapshot.step}
      data-events={snapshot.events.length}
      data-playing={String(snapshot.playing)}
      data-replaying={String(snapshot.replaying)}
    >
      <section className="stage-area" aria-label="The world">
        <WorldStage
          driver={session}
          label={STAGE_LABEL}
          tool={tool}
          look={{ birdColor: byHeading ? "heading" : "plain" }}
          onGround={(kind, point) => act(() => void session.place(kind, point.x, point.y))}
          onBird={(index) => act(() => session.select(index))}
          onTogglePlay={togglePlay}
          onReadout={refresh}
        >
          <div className="stage-tools" role="toolbar" aria-label="World tools">
            {TOOLS.map((entry) => (
              <button key={entry.tool} type="button" aria-pressed={tool === entry.tool} onClick={() => setTool(entry.tool)}>
                {entry.label}
              </button>
            ))}
          </div>
        </WorldStage>
        <div className="transport" role="group" aria-label="Playback">
          <button type="button" className="play" onClick={togglePlay}>
            {snapshot.playing ? "Pause" : "Play"}
          </button>
          <p className="transport-time">
            <span>{snapshot.seconds.toFixed(1)} s</span> <span className="transport-step">step {snapshot.step}</span>
          </p>
          <button type="button" onClick={() => act(() => session.replaySameSeed())}>
            Replay same seed
          </button>
          <button type="button" onClick={() => act(() => session.nextSeed())}>
            Next seed
          </button>
        </div>
      </section>

      <aside className="bench" aria-label="Lab bench and measurements">
        <section className="about" aria-labelledby="about-title">
          <div className="section-head">
            <h2 id="about-title">This world</h2>
            <OriginChip origin="teaching-choice" />
          </div>
          <p>
            Every bird steers only by the birds near it, and no bird leads. Change how strongly they match each other&rsquo;s heading,
            and watch the whole flock respond.
          </p>
        </section>

        <LabBench
          primary={bench(primary)}
          rules={rules.map(bench)}
          onChange={(actionId, value) => act(() => session.setAction(actionId, value))}
          onRestore={() => act(() => session.restoreDefaults())}
          canRestore={canRestore}
          display={
            <div className="control display-option">
              <label>
                <input type="checkbox" checked={byHeading} onChange={(event) => setByHeading(event.currentTarget.checked)} aria-describedby="by-heading-help" />{" "}
                Colour birds by heading
              </label>
              <p id="by-heading-help" className="control-help">
                Each bird takes the colour of the way it flies, so a flock that agrees turns one colour. It changes only how the birds look.
              </p>
            </div>
          }
        />

        <section className="measured" aria-labelledby="measured-title">
          <div className="section-head">
            <h2 id="measured-title">Measured live state</h2>
            <OriginChip origin="computed-observation" />
          </div>
          <dl className="readouts">
            <Readout
              label="Directional agreement"
              observable="directionalAgreement"
              value={observed.directionalAgreement}
              text={observed.directionalAgreement.toFixed(2)}
              unit="of 1"
            />
            <Readout label="Groups" observable="clusterCount" value={observed.clusterCount} text={String(observed.clusterCount)} />
            <Readout
              label="Nearest neighbour"
              observable="meanNeighbourDistance"
              value={observed.meanNeighbourDistance}
              text={observed.meanNeighbourDistance.toFixed(2)}
              unit="world units"
            />
          </dl>
        </section>

        <section className="picked" aria-labelledby="picked-title">
          <div className="section-head">
            <h2 id="picked-title">Picked bird</h2>
            <OriginChip origin="computed-observation" />
          </div>
          {selected ? (
            <p data-bird={selected.index} data-seen={selected.seen.length} data-crowding={selected.crowding.length}>
              Bird {selected.index + 1} sees {plural(selected.seen.length, "bird", "birds")} within {params.perceptionRadius} world units
              {selected.crowding.length > 0 ? `, and ${plural(selected.crowding.length, "bird is", "birds are")} too close.` : "."}
            </p>
          ) : (
            <p className="quiet">Choose Pick a bird, then click a bird, or press Enter on the stage, to see which birds it follows.</p>
          )}
        </section>

        <section className="placed" aria-labelledby="placed-title">
          <h2 id="placed-title">Placed in this world</h2>
          <ul aria-label="Placed in this world">
            {placed.map((entity) => (
              <li key={entity.id}>
                <span>
                  {entityName(entity.id)} at {entity.x.toFixed(1)}, {entity.y.toFixed(1)}
                </span>
                <button type="button" aria-label={`Remove ${entityName(entity.id).toLowerCase()}`} onClick={() => act(() => session.remove(entity.id))}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          {placed.length === 0 ? <p className="quiet">Nothing yet. Place a beacon to draw birds in, or an obstacle to push them away.</p> : null}
        </section>

        <section className="seed" aria-labelledby="seed-title">
          <div className="section-head">
            <h2 id="seed-title">Seed {snapshot.seed}</h2>
            <OriginChip origin="teaching-choice" />
          </div>
          <p>
            {snapshot.seed === HOOK_SEED
              ? "The opening seed: of the seeds the rules were chosen on, the one whose flock becomes a single group soonest."
              : "A fresh start: the same rules, with every bird placed and headed anew."}
          </p>
        </section>
      </aside>
    </div>
  );
}
