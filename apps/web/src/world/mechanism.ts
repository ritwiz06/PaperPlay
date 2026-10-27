/**
 * A generated world's session (ADR-0058): the shell's session, for a module that runs only in its
 * sandbox, in a worker in a separate-origin frame. A sandbox answers in its own time, so this
 * session asks ahead and shows what has arrived:
 * - a run's measurements, every step from the start, come in one request, so a run with fixed
 *   parameters, as each world of a fork is, is measured exactly and in step;
 * - the frames to draw come one request behind the clock, from a run the sandbox keeps, and a
 *   frame still on its way leaves the last one on screen: drawing only, never a measurement;
 * - once the learner moves the control, the measurements after that step come from the kept run.
 * It places nothing and records no run: a module's runs are checked in its sandbox, not replayed.
 */
import { parseFrame, type MechanismFrame, type MechanismManifest, type Prediction, type RunEvent } from "@paperplay/contracts";
import type { Primitive, RunPlan } from "@paperplay/primitives";
import { advance, START_CLOCK, type BaseEmphasis, type Speed, type StepClock } from "@paperplay/ui/stage-core";
import type { MechanismStageInput } from "@paperplay/ui/react/mechanism";
import { sampleIntervalOf, wallStepOf, type CoreSnapshot, type SessionOptions, type Stepped, type WorldSession } from "./session.ts";

/** What the session asks of a sandbox: the browser's, or a test's. */
export interface MechanismPort {
  request(body: Record<string, unknown>): Promise<({ readonly ok: true } & Record<string, unknown>) | { readonly ok: false; readonly error: string }>;
}

export interface MechanismState extends Stepped {
  readonly frame: MechanismFrame | null;
}

export type MechanismSession = WorldSession<Record<string, number>, MechanismState, Record<string, number>, Record<never, never>, BaseEmphasis, MechanismStageInput> & {
  /** Whether the run's measurements have arrived, so a fork can wait for both worlds before it steps. */
  ready(): boolean;
  /** What went wrong in the sandbox, if anything did. */
  failure(): string | null;
};

let runs = 0;

export function createMechanismSession(port: MechanismPort, primitive: Primitive<Record<string, number>, unknown>, manifest: MechanismManifest, first: SessionOptions<Record<string, number>, MechanismState>): MechanismSession {
  const run = `run-${(runs += 1)}`;
  const WATCHED = wallStepOf(primitive);
  const ids = manifest.measurements.map((measurement) => measurement.id);
  let options = first;
  let seed = options.seed >>> 0;
  let initialParams = primitive.paramSchema.parse(options.params);
  let params = initialParams;
  let step = 0;
  let clock: StepClock = START_CLOCK;
  let playing = options.playing ?? false;
  let speed: Speed = 1;
  let events: RunEvent[] = [];
  let applied = 0;
  let predictions: Prediction[] = [];
  let version = 0;
  const changed = () => void (version += 1);
  /** Which run the answers belong to: a restart makes every answer for the run before it stale. */
  let generation = 0;
  /** The run's measurements from its start, at its first parameters, and the last step they hold for. */
  let measured: readonly (readonly number[])[] | null = null;
  let measuredUntil = Number.POSITIVE_INFINITY;
  /** The kept run in the sandbox: its step, its latest measurement and frame, and whether a request is out. */
  let kept = 0;
  let latest: readonly number[] | null = null;
  let frame: MechanismFrame | null = null;
  let asking = false;
  let failed: string | null = null;

  const fail = (why: string) => {
    failed = why;
    changed();
  };
  const restart = () => {
    generation += 1;
    const mine = generation;
    step = 0;
    clock = START_CLOCK;
    params = initialParams;
    applied = 0;
    measured = null;
    measuredUntil = Number.POSITIVE_INFINITY;
    kept = 0;
    latest = null;
    asking = true;
    changed();
    void port.request({ op: "run", seed, params: initialParams, steps: manifest.steps, every: 1, frameAt: [] }).then((answer) => {
      if (mine !== generation) return;
      if (!answer.ok) return fail(answer.error);
      measured = answer["measures"] as number[][];
      changed();
    });
    void port.request({ op: "start", run, seed, params: initialParams }).then((answer) => {
      if (mine !== generation) return;
      asking = false;
      if (!answer.ok) return fail(answer.error);
      take(answer);
      follow();
    });
  };
  /** A kept run's answer: its step, measurement and frame, the frame drawn only once it parses in its kit. */
  const take = (answer: Record<string, unknown>) => {
    kept = Number(answer["step"] ?? kept);
    latest = (answer["measure"] as number[] | undefined) ?? latest;
    const parsed = parseFrame(manifest.kit, answer["frame"]);
    if (parsed.ok) frame = parsed.frame;
    changed();
  };
  /** Keeps the kept run up with the clock, one request at a time. */
  const follow = () => {
    if (asking || failed || kept >= step) return;
    asking = true;
    const mine = generation;
    void port.request({ op: "advance", run, steps: step - kept, params }).then((answer) => {
      if (mine !== generation) return;
      asking = false;
      if (!answer.ok) return fail(answer.error);
      take(answer);
      follow();
    });
  };
  const applyDue = () => {
    for (let event = events[applied]; event !== undefined && event.step === step; event = events[++applied]) {
      if (event.kind === "param") params = primitive.paramSchema.parse({ ...params, [options.actions[event.actionId] ?? event.actionId]: event.value });
    }
  };
  const stepBy = (count: number) => {
    for (let i = 0; i < count; i += 1) {
      step += 1;
      applyDue();
    }
    if (count > 0) {
      follow();
      changed();
    }
  };
  const observedNow = (): Record<string, number> => {
    const row = measured && step <= measuredUntil && step < measured.length ? measured[step] : latest;
    return Object.fromEntries(ids.map((id, index) => [id, row?.[index] ?? Number.NaN]));
  };
  const setAction = (actionId: string, value: number) => {
    const parameter = options.actions[actionId];
    if (parameter === undefined) throw new Error(`this world has no action ${actionId}`);
    params = primitive.paramSchema.parse({ ...params, [parameter]: value });
    // From here the measurements come from the kept run, which steps at the new value.
    measuredUntil = Math.min(measuredUntil, step);
    events = events.slice(0, applied);
    const last = events.at(-1);
    const event: RunEvent = { kind: "param", step, actionId, value };
    if (last?.kind === "param" && last.step === step && last.actionId === actionId) events[events.length - 1] = event;
    else events.push(event);
    applied = events.length;
    changed();
  };
  const afresh = () => {
    initialParams = params;
    events = [];
    predictions = [];
    restart();
  };

  restart();

  const session: MechanismSession = {
    snapshot: (): CoreSnapshot<Record<string, number>, Record<string, number>> & Record<never, never> => ({ seed, step, time: step * primitive.fixedTimestep, playing, speed, replaying: applied < events.length, params, observed: observedNow(), events: [...events], predictions: [...predictions] }),
    state: () => ({ stepIndex: step, frame }),
    stageInput: () => ({ frame }),
    emphasis: () => ({}),
    tick(frameSeconds) {
      // A run waits for its measurements, so its steps and its readings never part.
      if (!playing || measured === null) return 0;
      const next = advance(clock, frameSeconds, WATCHED, undefined, speed);
      clock = next.clock;
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
        if (params[parameter] !== options.params[parameter]) setAction(actionId, options.params[parameter] ?? 0);
      }
    },
    place() {
      throw new Error("a generated world has nothing to place");
    },
    remove() {
      throw new Error("a generated world has nothing to remove");
    },
    select(index) {
      if (index !== null) throw new RangeError("a generated world has nothing to pick");
    },
    nextSeed() {
      seed = (seed + 1) >>> 0;
      afresh();
    },
    replaySameSeed() {
      restart();
    },
    startAgain() {
      afresh();
    },
    predict(levelId, prompt, choice, choiceText) {
      predictions.push({ step, levelId, prompt, choice, choiceText });
      changed();
    },
    plan: (): RunPlan<MechanismState> & { readonly params: Record<string, number> } => ({ params: initialParams, initialState: { stepIndex: 0, frame: null }, events: events.slice(0, applied), totalSteps: step, sampleInterval: sampleIntervalOf(primitive), timestep: primitive.fixedTimestep }),
    record() {
      throw new Error("a generated world's runs are checked in its sandbox, not recorded");
    },
    version: () => version,
    load(next) {
      options = next;
      seed = next.seed >>> 0;
      initialParams = primitive.paramSchema.parse(next.params);
      events = [];
      predictions = [];
      playing = next.playing ?? playing;
      restart();
    },
    spawn: (next) => createMechanismSession(port, primitive, manifest, next),
    ready: () => measured !== null,
    failure: () => failed,
  };
  return session;
}
