/**
 * The valley kit's view of a session (ADR-0026): the flock's own readings for its readouts, from
 * the primitive's read-only queries Q1–Q4, what the stage emphasises, and the trail history it
 * draws. A flocking world's session is the generic session with this view.
 */
import { flockPlanarWeighted as flock, type AtRocks, type Entity, type FlockObservables, type FlockParams, type FlockState, type Headings } from "@paperplay/primitives/flock";
import type { FrameEmphasis, StageInput } from "@paperplay/ui/stage-core/valley";
import { createSession, type CoreSnapshot, type SessionOptions as Options, type SessionView, type WorldSession as Session } from "./session.ts";

/** What a flocking world's snapshot adds: the flock's readings, as its readouts show them. */
export interface FlockReadings {
  readonly beacons: readonly Entity[];
  readonly obstacles: readonly Entity[];
  readonly selected: { readonly index: number; readonly seen: readonly number[]; readonly crowding: readonly number[] } | null;
  /** Each bird's heading and the flock's mean heading, from the primitive's query (Q2), for the compass. */
  readonly headings: Headings;
  /** Each rock and the birds at it, from the primitive's query (Q4), for the rocks counter. */
  readonly rocks: AtRocks;
}

export type SessionOptions = Options<FlockParams, FlockState>;
export type SessionSnapshot = CoreSnapshot<FlockParams, FlockObservables> & FlockReadings;
export type FlockSession = Session<FlockParams, FlockState, FlockObservables, FlockReadings, FrameEmphasis, StageInput>;

/**
 * Trails reach back this many steps (3 s), drawn through one state in every TRAIL_STRIDE. The
 * flock often cruises near its minimum speed, so a shorter history would hide under each bird;
 * the stage caps a trail's length for fast birds.
 */
const TRAIL_STEPS = 180;
const TRAIL_STRIDE = 18;

export const valleyView: SessionView<FlockParams, FlockState, FlockReadings, FrameEmphasis, StageInput> = Object.freeze({
  extras: (state: FlockState, params: FlockParams, picked: number | null): FlockReadings => ({
    beacons: state.beacons,
    obstacles: state.obstacles,
    selected: picked === null ? null : { index: picked, ...flock.queries.neighbours(state, params, picked) },
    headings: flock.queries.headings(state),
    rocks: flock.queries.atRocks(state),
  }),
  emphasis: (state: FlockState, params: FlockParams, picked: number | null, emphasise: string | undefined): FrameEmphasis => {
    // The spread level rings the flock's largest group (Q3): presentation only.
    const spread = emphasise === "groupSpread" ? flock.queries.spread(state) : null;
    const ring = spread?.centre ? { spread: { ...spread.centre, radius: spread.radius } } : {};
    // Rocks with a bird at them light up (Q4): presentation only.
    const lit = state.obstacles.length === 0 ? [] : flock.queries.atRocks(state).rocks.filter((rock) => rock.birds.length > 0).map((rock) => rock.id);
    const touched = lit.length === 0 ? {} : { touched: lit };
    const shown = { ...ring, ...touched };
    return picked === null ? shown : { ...shown, selected: picked, neighbours: flock.queries.neighbours(state, params, picked).seen, reach: params.perceptionRadius };
  },
  input: (previous: FlockState, current: FlockState, alpha: number, timestep: number, history: readonly FlockState[]): StageInput => ({
    previous,
    current,
    alpha,
    timestep,
    trail: history.filter((_, index) => (history.length - 1 - index) % TRAIL_STRIDE === 0),
  }),
  historySteps: TRAIL_STEPS,
  names: Object.freeze({ beacon: "beacon", obstacle: "rock" }),
  entityIds: (state: FlockState) => [...state.beacons, ...state.obstacles].map((entity) => entity.id),
  unpickable: (state: FlockState, index: number) =>
    Number.isInteger(index) && index >= 0 && index < state.agents.length ? null : `there is no bird ${index}; this flock has birds 0 to ${state.agents.length - 1}`,
});

/** A flocking world's session: flock.planar.weighted, seen through the valley kit. */
export function createWorldSession(options: SessionOptions): FlockSession {
  return createSession(flock, valleyView, options);
}
