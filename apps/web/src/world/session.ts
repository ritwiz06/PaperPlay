/**
 * A live run of the local world: the fixed-step loop, the learner's actions recorded as
 * RunRecord events, replay of the same seed, and the next seed. Framework-free, so it is
 * tested in Node. It computes no science itself: every state comes from the primitive's
 * init, step and apply, and every number shown comes from its measure and neighbourhood query.
 *
 * Event order matches runEvents: an event made while the world stands at step s is recorded
 * at s and applied before step s is taken, so the session can always be replayed from its record.
 */
import type { PlaceEvent, RunEvent } from "@paperplay/contracts";
import {
  flockHeadings,
  flockNeighbours,
  flockSpread,
  flockPlanarWeighted as flock,
  type Entity,
  type FlockObservables,
  type FlockParams,
  type FlockState,
  type Headings,
  type RunPlan,
} from "@paperplay/primitives";
import { advance, START_CLOCK, type FrameEmphasis, type Speed, type StageInput, type StepClock } from "@paperplay/ui/stage-core";

export interface SessionOptions {
  readonly seed: number;
  /** The world's balanced rules: the parameters it opens with and restores. */
  readonly params: FlockParams;
  /** Each action id and the parameter it moves, in the order the defaults are restored. */
  readonly actions: Readonly<Record<string, keyof FlockParams>>;
  /** A level's setup: placements at step 0, recorded as ordinary place events (ADR-0014). */
  readonly setup?: readonly PlaceEvent[];
  /** Draw the ring of the flock's spread (Q3) around its largest group. Presentation only. */
  readonly ring?: boolean;
  /** Start from this state instead of the seed's: a fork's branch from the moment it opens. */
  readonly start?: FlockState;
  readonly playing?: boolean;
}

export interface SessionSnapshot {
  readonly seed: number;
  readonly step: number;
  readonly seconds: number;
  readonly playing: boolean;
  /** Fixed steps per frame, times 1, 2 or 4: how fast the run goes, never what it computes. */
  readonly speed: Speed;
  /** True while a replay still has recorded events ahead of it. */
  readonly replaying: boolean;
  readonly params: FlockParams;
  readonly observed: FlockObservables;
  readonly events: readonly RunEvent[];
  readonly beacons: readonly Entity[];
  readonly obstacles: readonly Entity[];
  readonly selected: { readonly index: number; readonly seen: readonly number[]; readonly crowding: readonly number[] } | null;
  /** Each bird's heading and the flock's mean heading, from the primitive's query (Q2), for the compass. */
  readonly headings: Headings;
}

export interface WorldSession {
  snapshot(): SessionSnapshot;
  state(): FlockState;
  stageInput(): StageInput;
  emphasis(): FrameEmphasis;
  /** Takes the whole steps this much wall time allows while playing; returns how many. */
  tick(frameSeconds: number): number;
  /** Takes exactly this many fixed steps now, playing or not: a fork keeps two worlds in step this way. */
  stepBy(steps: number): void;
  /** Runs at 1x, 2x or 4x: more fixed steps per frame, the same steps. */
  setSpeed(speed: Speed): void;
  play(): void;
  pause(): void;
  setAction(actionId: string, value: number): void;
  restoreDefaults(): void;
  /** Places a named beacon or obstacle at the current step; returns its name. */
  place(entity: "beacon" | "obstacle", x: number, y: number): string;
  remove(entityId: string): void;
  select(index: number | null): void;
  nextSeed(): void;
  replaySameSeed(): void;
  /** The run so far as a plan runEvents can replay, with the parameters it started from. */
  plan(): RunPlan<FlockState> & { readonly params: FlockParams };
  /** Changes with every change, so a paused stage knows when to draw again. */
  version(): number;
  /** Starts afresh on other options, such as the next level's, keeping the same stage. */
  load(options: SessionOptions): void;
}

const TIMESTEP = flock.fixedTimestep;
/**
 * Trails reach back this many steps (3 s), drawn through one state in every TRAIL_STRIDE. The
 * flock often cruises near its minimum speed, so a shorter history would hide under each bird;
 * the stage caps a trail's length for fast birds.
 */
const TRAIL_STEPS = 180;
const TRAIL_STRIDE = 18;
const PREFIX = { beacon: "beacon", obstacle: "rock" } as const;

export function createWorldSession(first: SessionOptions): WorldSession {
  let options = first;
  let seed = options.seed >>> 0;
  let initialParams = flock.paramSchema.parse(options.params);
  let params = initialParams;
  /** The state the run starts from: the seed's, or a fork's branch. Events are counted in steps from it. */
  const origin = (): FlockState => options.start ?? flock.init(initialParams, seed);
  let current = origin();
  const stepsTaken = (): number => current.stepIndex - (options.start?.stepIndex ?? 0);
  let previous = current;
  let alpha = 0;
  let clock: StepClock = START_CLOCK;
  let playing = options.playing ?? false;
  let speed: Speed = 1;
  /** The setup's place events come first, at step 0, so replay and the next seed keep them. */
  const setupEvents = (): RunEvent[] => (options.setup ?? []).map((event) => ({ ...event, step: 0 }));
  let events: RunEvent[] = setupEvents();
  /** How many recorded events have been applied; fewer than all only during a replay. */
  let applied = 0;
  let placed = { beacon: 0, obstacle: 0 };
  let selected: number | null = null;
  /** The states before the current one, oldest first, for trails: presentation only. */
  let history: FlockState[] = [];
  let version = 0;
  const changed = () => void version++;

  const parameterOf = (actionId: string): keyof FlockParams => {
    const parameter = options.actions[actionId];
    if (parameter === undefined) throw new Error(`this world has no action ${actionId}`);
    return parameter;
  };

  const applyEvent = (event: RunEvent): void => {
    if (event.kind === "param") params = flock.paramSchema.parse({ ...params, [parameterOf(event.actionId)]: event.value });
    else current = flock.apply(current, event);
  };

  /** Records an event at the current step, after it has been applied. Acting during a replay ends it. */
  const record = (event: RunEvent): void => {
    events = events.slice(0, applied);
    const last = events.at(-1);
    if (event.kind === "param" && last?.kind === "param" && last.step === event.step && last.actionId === event.actionId) {
      events[events.length - 1] = event;
    } else {
      events.push(event);
    }
    applied = events.length;
    changed();
  };

  /** Applies the recorded events due at the current step, as a replay reaches them. */
  const applyDue = (): void => {
    for (let event = events[applied]; event !== undefined && event.step === stepsTaken(); event = events[++applied]) applyEvent(event);
  };

  const setAction = (actionId: string, value: number): void => {
    const parameter = parameterOf(actionId);
    params = flock.paramSchema.parse({ ...params, [parameter]: value });
    record({ kind: "param", step: stepsTaken(), actionId, value });
  };

  const restart = (): void => {
    current = origin();
    previous = current;
    params = initialParams;
    alpha = 0;
    clock = START_CLOCK;
    history = [];
    applied = 0;
    applyDue();
    changed();
  };

  applyDue();

  function stepBy(steps: number): void {
    for (let i = 0; i < steps; i++) {
      history.push(current);
      if (history.length > TRAIL_STEPS) history.shift();
      previous = current;
      current = flock.step(current, params, TIMESTEP);
      applyDue();
    }
    if (steps > 0) changed();
  }

  return {
    snapshot: () => ({
      seed,
      step: current.stepIndex,
      seconds: current.stepIndex * TIMESTEP,
      playing,
      speed,
      replaying: applied < events.length,
      params,
      observed: flock.measure(current),
      events: [...events],
      beacons: current.beacons,
      obstacles: current.obstacles,
      selected: selected === null ? null : { index: selected, ...flockNeighbours(current, params, selected) },
      headings: flockHeadings(current),
    }),
    state: () => current,
    stageInput: () => ({
      previous,
      current,
      alpha: playing ? alpha : 1,
      timestep: TIMESTEP,
      trail: history.filter((_, index) => (history.length - 1 - index) % TRAIL_STRIDE === 0),
    }),
    emphasis: () => {
      const spread = options.ring === true ? flockSpread(current) : null;
      const ring = spread?.centre ? { spread: { ...spread.centre, radius: spread.radius } } : {};
      return selected === null ? ring : { ...ring, selected, neighbours: flockNeighbours(current, params, selected).seen, reach: params.perceptionRadius };
    },
    tick(frameSeconds) {
      if (!playing) return 0;
      const next = advance(clock, frameSeconds, TIMESTEP, undefined, speed);
      clock = next.clock;
      alpha = next.alpha;
      stepBy(next.steps);
      return next.steps;
    },
    stepBy,
    setSpeed(next) {
      speed = next;
      changed();
    },
    play() {
      playing = true;
      changed();
    },
    pause() {
      playing = false;
      clock = START_CLOCK;
      changed();
    },
    setAction,
    restoreDefaults() {
      for (const [actionId, parameter] of Object.entries(options.actions)) {
        if (params[parameter] !== options.params[parameter]) setAction(actionId, options.params[parameter]);
      }
    },
    place(entity, x, y) {
      let entityId: string;
      const taken = (id: string) => current.beacons.some((e) => e.id === id) || current.obstacles.some((e) => e.id === id);
      do entityId = `${PREFIX[entity]}-${++placed[entity]}`;
      while (taken(entityId));
      const event = { kind: "place", step: stepsTaken(), entityId, entity, x, y } as const;
      current = flock.apply(current, event);
      record(event);
      return entityId;
    },
    remove(entityId) {
      const event = { kind: "remove", step: stepsTaken(), entityId } as const;
      current = flock.apply(current, event);
      record(event);
    },
    select(index) {
      if (index !== null && !(Number.isInteger(index) && index >= 0 && index < current.agents.length)) {
        throw new RangeError(`there is no bird ${index}; this flock has birds 0 to ${current.agents.length - 1}`);
      }
      selected = index;
      changed();
    },
    nextSeed() {
      seed = (seed + 1) >>> 0;
      // A branch belongs to its seed; the next seed starts from its own.
      options = { ...options, start: undefined };
      initialParams = params;
      events = setupEvents();
      placed = { beacon: 0, obstacle: 0 };
      selected = null;
      restart();
    },
    replaySameSeed() {
      restart();
    },
    plan: () => ({
      params: initialParams,
      initialState: origin(),
      events: events.slice(0, applied),
      totalSteps: stepsTaken(),
      sampleInterval: 60,
      timestep: TIMESTEP,
    }),
    version: () => version,
    load(next) {
      options = next;
      seed = next.seed >>> 0;
      initialParams = flock.paramSchema.parse(next.params);
      events = setupEvents();
      placed = { beacon: 0, obstacle: 0 };
      selected = null;
      playing = next.playing ?? playing;
      restart();
    },
  };
}
