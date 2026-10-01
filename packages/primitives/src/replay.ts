import type { RunEvent, RunRecord } from "@paperplay/contracts";
import type { Primitive } from "./types.ts";

export interface RunSetup<P, S> {
  /** The primitive the run uses, at the exact version it was recorded with. */
  readonly primitive: Primitive<P, S>;
  /** Parameters at step 0, before any param event. */
  readonly params: P;
  /** The world's actions: each actionId names the parameter it moves. */
  readonly actions: Readonly<Record<string, string>>;
}

export interface RunPlan<S> {
  readonly initialState: S;
  readonly events: readonly RunEvent[];
  readonly totalSteps: number;
  readonly sampleInterval: number;
  readonly timestep: number;
}

export interface RunResult<S> {
  readonly observables: Record<string, number[]>;
  readonly finalState: S;
}

export interface ReplayReport<S> {
  readonly matches: boolean;
  /** Largest |recorded − replayed| over every compared sample. */
  readonly maxDeviation: number;
  /** Every sample further from the record than its tolerance, e.g. "directionalAgreement[5]: …". */
  readonly mismatches: readonly string[];
  readonly finalState: S;
}

/**
 * Runs a plan step by step. At each step s: observables are sampled when s is a multiple
 * of sampleInterval, then the events recorded at s are applied in order, then step s is
 * taken. Events at totalSteps are applied after the final sample and change no sample.
 */
export function runEvents<P, S>(setup: RunSetup<P, S>, plan: RunPlan<S>): RunResult<S> {
  const { primitive, actions } = setup;
  const { events, totalSteps, sampleInterval, timestep } = plan;
  if (!Number.isInteger(totalSteps) || totalSteps < 0) throw new RangeError(`totalSteps must be a whole number ≥ 0, got ${totalSteps}`);
  if (!Number.isInteger(sampleInterval) || sampleInterval < 1) {
    throw new RangeError(`sampleInterval must be a whole number ≥ 1, got ${sampleInterval}`);
  }
  events.forEach((event, index) => {
    const previous = events[index - 1];
    if ((previous && event.step < previous.step) || event.step > totalSteps) {
      throw new RangeError(`event ${index} at step ${event.step} is out of order or after the last step (${totalSteps})`);
    }
  });

  let state = plan.initialState;
  let params = setup.params;
  const observables: Record<string, number[]> = {};
  let next = 0;
  for (let step = 0; step <= totalSteps; step++) {
    if (step % sampleInterval === 0) {
      for (const [metric, value] of Object.entries(primitive.measure(state))) (observables[metric] ??= []).push(value);
    }
    for (let event = events[next]; event !== undefined && event.step === step; event = events[++next]) {
      if (event.kind === "param") {
        const parameter = actions[event.actionId];
        if (parameter === undefined) throw new Error(`event ${next}: the world defines no action ${event.actionId}`);
        params = primitive.paramSchema.parse({ ...params, [parameter]: event.value });
      } else {
        if (!primitive.apply) throw new Error(`${primitive.id}@${primitive.version} has no entities to place or remove`);
        state = primitive.apply(state, event);
      }
    }
    if (step < totalSteps) state = primitive.step(state, params, timestep);
  }
  return { observables, finalState: state };
}

/** Rebuilds a recorded run from its initial state and events, then compares every recorded sample. */
export function replayRecord<P, S>(record: RunRecord, setup: RunSetup<P, S>): ReplayReport<S> {
  const { primitive } = setup;
  if (record.primitive.id !== primitive.id || record.primitive.version !== primitive.version) {
    throw new Error(
      `record was made with ${record.primitive.id}@${record.primitive.version}; ${primitive.id}@${primitive.version} is a different version and cannot replay it`,
    );
  }
  const { observables, finalState } = runEvents(setup, {
    initialState: primitive.stateSchema.parse(record.initialState),
    events: record.events,
    totalSteps: record.totalSteps,
    sampleInterval: record.sampleInterval,
    timestep: record.timestep,
  });

  const mismatches: string[] = [];
  let maxDeviation = 0;
  for (const [metric, recorded] of Object.entries(record.observables)) {
    const replayed = observables[metric];
    if (!replayed) {
      mismatches.push(`${metric}: ${primitive.id} does not measure it`);
      continue;
    }
    recorded.forEach((value, index) => {
      const again = replayed[index] ?? Number.NaN;
      const deviation = Math.abs(value - again);
      if (!(deviation <= record.tolerance)) mismatches.push(`${metric}[${index}]: recorded ${value}, replayed ${again}`);
      if (deviation > maxDeviation) maxDeviation = deviation;
    });
  }
  return { matches: mismatches.length === 0, maxDeviation, mismatches, finalState };
}
