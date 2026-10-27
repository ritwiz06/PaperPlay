/**
 * A live run of a world, for any primitive: the fixed-step loop, the learner's actions recorded as
 * RunRecord events, replay of the same seed, and the next seed. Framework-free, so it is tested
 * in Node. It computes no science itself: every state comes from the primitive's init, step and
 * apply, and every number shown comes from its measure and its read-only queries, which a scene
 * kit's view asks (ADR-0026).
 *
 * Event order matches runEvents: an event made while the world stands at step s is recorded
 * at s and applied before step s is taken, so the session can always be replayed from its record.
 */
import { RunRecord, type EntityKind, type PlaceEvent, type Prediction, type RunEvent } from "@paperplay/contracts";
import { runEvents, type Primitive, type RunPlan } from "@paperplay/primitives";
import { advance, START_CLOCK, type BaseEmphasis, type Speed, type StepClock } from "@paperplay/ui/stage-core";

/** A primitive state that counts its own steps, as every primitive's does. */
export interface Stepped {
  readonly stepIndex: number;
}

export interface SessionOptions<P, S> {
  readonly seed: number;
  /** The world's balanced rules: the parameters it opens with and restores. */
  readonly params: P;
  /** Each action id and the parameter it moves, in the order the defaults are restored. The primitive's schema checks the name. */
  readonly actions: Readonly<Record<string, string>>;
  /** A level's setup: placements at step 0, recorded as ordinary place events (ADR-0014). */
  readonly setup?: readonly PlaceEvent[];
  /** The observable the level watches, so the stage can emphasise it. Presentation only. */
  readonly emphasise?: string;
  /** Start from this state instead of the seed's: a fork's branch from the moment it opens. */
  readonly start?: S;
  readonly playing?: boolean;
}

/** What every session's snapshot holds, whatever its kit. */
export interface CoreSnapshot<P, O> {
  readonly seed: number;
  readonly step: number;
  /** The run's time, in the primitive's time unit. */
  readonly time: number;
  readonly playing: boolean;
  /** Fixed steps per frame, times 1, 2 or 4: how fast the run goes, never what it computes. */
  readonly speed: Speed;
  /** True while a replay still has recorded events ahead of it. */
  readonly replaying: boolean;
  readonly params: P;
  readonly observed: O;
  readonly events: readonly RunEvent[];
  /** The learner's predictions in this run, in step order: notes, never events, never scored. */
  readonly predictions: readonly Prediction[];
}

/**
 * A scene kit's view of a session (ADR-0026): what it reads from the primitive's queries for its
 * readouts, what it emphasises on the stage, and what the stage draws from. Presentation only.
 */
export interface SessionView<P, S, Extra, Emphasis extends BaseEmphasis, Input> {
  /** The snapshot's own part: the kit's readings, from the primitive's read-only queries. */
  extras(state: S, params: P, picked: number | null): Extra;
  emphasis(state: S, params: P, picked: number | null, emphasise: string | undefined): Emphasis;
  /** What the stage draws: the two latest states, how far between them, and a short history. */
  input(previous: S, current: S, alpha: number, timestep: number, history: readonly S[]): Input;
  /** How many states back the history reaches; presentation only. */
  readonly historySteps: number;
  /** The names a placed entity of each kind is given, before its number: "beacon-1", "rock-1". */
  readonly names: Readonly<Partial<Record<EntityKind, string>>>;
  /** The ids of every entity in a state, so a new name never repeats one. */
  entityIds(state: S): readonly string[];
  /** Why a pick names nothing in this state, or null when it names something. */
  unpickable(state: S, index: number): string | null;
}

export interface WorldSession<P, S, O, Extra, Emphasis extends BaseEmphasis, Input> {
  snapshot(): CoreSnapshot<P, O> & Extra;
  state(): S;
  stageInput(): Input;
  emphasis(): Emphasis;
  /** Takes the whole steps this much wall time allows while playing; returns how many. */
  tick(frameSeconds: number): number;
  /** Takes exactly this many fixed steps now, playing or not: a fork keeps two worlds in step this way. */
  stepBy(steps: number): void;
  /** Whether the session can step yet: false while a generated world's measurements are on their way from its sandbox (ADR-0058). Absent means always. */
  ready?(): boolean;
  /** Runs at 1x, 2x or 4x: more fixed steps per frame, the same steps. */
  setSpeed(speed: Speed): void;
  play(): void;
  pause(): void;
  setAction(actionId: string, value: number): void;
  restoreDefaults(): void;
  /** Places a named entity of a kind the primitive declares, at the current step; returns its name. */
  place(entity: EntityKind, x: number, y: number): string;
  remove(entityId: string): void;
  /** Picks a thing by index, or lets it go. */
  select(index: number | null): void;
  nextSeed(): void;
  replaySameSeed(): void;
  /** Starts the run again on the same seed, from the parameters as they are now: a new run, with no events and no predictions yet. */
  startAgain(): void;
  /** Records a prediction at the current step, before a level's What-if (ADR-0018). It changes nothing in the run. */
  predict(levelId: string, prompt: string, choice: number, choiceText: string): void;
  /** The run so far as a plan runEvents can replay, with the parameters it started from. */
  plan(): RunPlan<S> & { readonly params: P };
  /** The run so far as a RunRecord (runrecord/3), its predictions included, given the identity the session cannot know. */
  record(identity: RunIdentity): RunRecord;
  /** Changes with every change, so a paused stage knows when to draw again. */
  version(): number;
  /** Starts afresh on other options, such as the next level's, keeping the same stage. */
  load(options: SessionOptions<P, S>): void;
  /** A new session of the same primitive and view: a fork's two worlds. */
  spawn(options: SessionOptions<P, S>): WorldSession<P, S, O, Extra, Emphasis, Input>;
}

/** What a record needs that the session cannot know: the run's name, its hashes and its runtime. */
export type RunIdentity = Pick<RunRecord, "runId" | "worldSpecHash" | "codeHash" | "lockHash" | "runtime" | "tolerance">;

/**
 * How many seconds of watching one step takes at 1x: the model's step over how much of its time
 * a second shows. The flock shows a second a second, so its step is its own, exactly.
 */
export const wallStepOf = (primitive: Primitive<unknown, unknown>): number => primitive.fixedTimestep / primitive.time.perWatchSecond;

/** Steps between a record's samples: one sample for each second of watching at 1x (60 for the flock). */
export const sampleIntervalOf = (primitive: Primitive<unknown, unknown>): number => Math.max(1, Math.round(primitive.time.perWatchSecond / primitive.fixedTimestep));

export function createSession<P, S extends Stepped, O extends Record<string, number>, Extra, Emphasis extends BaseEmphasis, Input>(
  primitive: Primitive<P, S, O>,
  view: SessionView<P, S, Extra, Emphasis, Input>,
  first: SessionOptions<P, S>,
): WorldSession<P, S, O, Extra, Emphasis, Input> {
  const TIMESTEP = primitive.fixedTimestep;
  /** A step's share of a second of watching at 1x: the flock's 1/60 s, an epidemic's tenth of a day at so many days a second. */
  const WATCHED = wallStepOf(primitive);
  const SAMPLE_INTERVAL = sampleIntervalOf(primitive);
  const apply = (state: S, edit: Parameters<NonNullable<Primitive<P, S, O>["apply"]>>[1]): S => {
    if (!primitive.apply) throw new Error(`${primitive.id}@${primitive.version} has no entities to place or remove`);
    return primitive.apply(state, edit);
  };
  let options = first;
  let seed = options.seed >>> 0;
  let initialParams = primitive.paramSchema.parse(options.params);
  let params = initialParams;
  /** The state the run starts from: the seed's, or a fork's branch. Events are counted in steps from it. */
  const origin = (): S => options.start ?? primitive.init(initialParams, seed);
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
  let placed: Partial<Record<EntityKind, number>> = {};
  let selected: number | null = null;
  let predictions: Prediction[] = [];
  /** The states before the current one, oldest first, for trails: presentation only. */
  let history: S[] = [];
  let version = 0;
  const changed = () => void version++;

  const parameterOf = (actionId: string): string => {
    const parameter = options.actions[actionId];
    if (parameter === undefined) throw new Error(`this world has no action ${actionId}`);
    return parameter;
  };

  const applyEvent = (event: RunEvent): void => {
    if (event.kind === "param") params = primitive.paramSchema.parse({ ...params, [parameterOf(event.actionId)]: event.value });
    else current = apply(current, event);
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
    params = primitive.paramSchema.parse({ ...params, [parameter]: value });
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

  /** A new run from the parameters as they are now: a branch belongs to its run, so it starts from its seed's own state. */
  const afresh = (): void => {
    options = { ...options, start: undefined };
    initialParams = params;
    events = setupEvents();
    placed = {};
    selected = null;
    predictions = [];
    restart();
  };

  applyDue();

  const plan = (): RunPlan<S> & { readonly params: P } => ({
    params: initialParams,
    initialState: origin(),
    events: events.slice(0, applied),
    totalSteps: stepsTaken(),
    sampleInterval: SAMPLE_INTERVAL,
    timestep: TIMESTEP,
  });

  function stepBy(steps: number): void {
    for (let i = 0; i < steps; i++) {
      history.push(current);
      if (history.length > view.historySteps) history.shift();
      previous = current;
      current = primitive.step(current, params, TIMESTEP);
      applyDue();
    }
    if (steps > 0) changed();
  }

  return {
    snapshot: () => ({
      seed,
      step: current.stepIndex,
      time: current.stepIndex * TIMESTEP,
      playing,
      speed,
      replaying: applied < events.length,
      params,
      observed: primitive.measure(current),
      events: [...events],
      predictions: [...predictions],
      ...view.extras(current, params, selected),
    }),
    state: () => current,
    stageInput: () => view.input(previous, current, playing ? alpha : 1, TIMESTEP, history),
    emphasis: () => view.emphasis(current, params, selected, options.emphasise),
    tick(frameSeconds) {
      if (!playing) return 0;
      const next = advance(clock, frameSeconds, WATCHED, undefined, speed);
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
      const now = params as Record<string, unknown>;
      const balanced = options.params as Record<string, unknown>;
      for (const [actionId, parameter] of Object.entries(options.actions)) {
        if (now[parameter] !== balanced[parameter]) setAction(actionId, balanced[parameter] as number);
      }
    },
    place(entity, x, y) {
      const prefix = view.names[entity];
      if (prefix === undefined) throw new Error(`${primitive.id} has no ${entity} to place`);
      let entityId: string;
      const taken = new Set(view.entityIds(current));
      do entityId = `${prefix}-${(placed[entity] = (placed[entity] ?? 0) + 1)}`;
      while (taken.has(entityId));
      const event = { kind: "place", step: stepsTaken(), entityId, entity, x, y } as const;
      current = apply(current, event);
      record(event);
      return entityId;
    },
    remove(entityId) {
      const event = { kind: "remove", step: stepsTaken(), entityId } as const;
      current = apply(current, event);
      record(event);
    },
    select(index) {
      const why = index === null ? null : view.unpickable(current, index);
      if (why !== null) throw new RangeError(why);
      selected = index;
      changed();
    },
    nextSeed() {
      seed = (seed + 1) >>> 0;
      afresh();
    },
    startAgain() {
      afresh();
    },
    replaySameSeed() {
      restart();
    },
    predict(levelId, prompt, choice, choiceText) {
      predictions.push({ step: stepsTaken(), levelId, prompt, choice, choiceText });
      changed();
    },
    plan,
    record(identity) {
      const run = plan();
      const { observables } = runEvents({ primitive, params: run.params, actions: options.actions }, run);
      return RunRecord.parse({
        schemaVersion: "runrecord/3",
        ...identity,
        primitive: { id: primitive.id, version: primitive.version },
        seed,
        initialState: run.initialState,
        timestep: run.timestep,
        sampleInterval: run.sampleInterval,
        totalSteps: run.totalSteps,
        events: run.events,
        // A prediction made later than a replay has reached belongs to the run being replaced.
        predictions: predictions.filter((prediction) => prediction.step <= run.totalSteps),
        observables,
        hashes: {},
      });
    },
    version: () => version,
    load(next) {
      options = next;
      seed = next.seed >>> 0;
      initialParams = primitive.paramSchema.parse(next.params);
      events = setupEvents();
      placed = {};
      selected = null;
      predictions = [];
      playing = next.playing ?? playing;
      restart();
    },
    spawn: (next) => createSession(primitive, view, next),
  };
}
