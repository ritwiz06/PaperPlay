/**
 * The town kit's view of a session (ADR-0029): a compartment model's state as each compartment's
 * share of the whole, for the town's figures and its shares bar. The shares are a picture of the
 * solver's state, not a second model: they are its compartments, each divided by their sum, and
 * nothing here steps, infects or cures. A compartment world's session is the generic session with
 * this view.
 */
import type { CompartmentModel, CompartmentParams, CompartmentState } from "@paperplay/primitives/compartments";
import type { BaseEmphasis } from "@paperplay/ui/stage-core";
import type { TownInput } from "@paperplay/ui/stage-core/town";
import { createSession, type CoreSnapshot, type SessionOptions as Options, type SessionView, type WorldSession } from "./session.ts";

/** One compartment as the shares bar shows it: its id, its name, and its share of the whole. */
export interface Share {
  readonly id: string;
  readonly name: string;
  readonly share: number;
}

/** What a compartment world's snapshot adds: every compartment's share, in the model's order. */
export interface TownReadings {
  readonly shares: readonly Share[];
}

export type SessionOptions = Options<CompartmentParams, CompartmentState>;
export type TownSnapshot = CoreSnapshot<CompartmentParams, Record<string, number>> & TownReadings;
export type TownSession = WorldSession<CompartmentParams, CompartmentState, Record<string, number>, TownReadings, BaseEmphasis, TownInput>;

/** Each compartment's share of the whole, in the model's order: its value over the sum of all of them, or none of it when they sum to nothing. */
export function sharesOf(model: CompartmentModel, state: CompartmentState): number[] {
  const values = model.spec.compartments.map((compartment) => state.compartments[compartment.id] ?? 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  return values.map((value) => (total > 0 ? value / total : 0));
}

export function townView(model: CompartmentModel): SessionView<CompartmentParams, CompartmentState, TownReadings, BaseEmphasis, TownInput> {
  const names = model.spec.compartments.map((compartment) => ({ id: compartment.id, name: compartment.name }));
  return Object.freeze({
    extras: (state: CompartmentState): TownReadings => {
      const shares = sharesOf(model, state);
      return { shares: names.map((named, index) => ({ ...named, share: shares[index] ?? 0 })) };
    },
    // The town emphasises nothing on its stage: the shares bar outlines the watched compartment.
    emphasis: (): BaseEmphasis => ({}),
    input: (previous: CompartmentState, current: CompartmentState, alpha: number, timestep: number): TownInput => ({
      previous: sharesOf(model, previous),
      current: sharesOf(model, current),
      alpha,
      timeBefore: previous.stepIndex * timestep,
      timeNow: current.stepIndex * timestep,
    }),
    historySteps: 0,
    names: Object.freeze({}),
    entityIds: () => [],
    unpickable: () => "the town's figures are a picture of the model's shares, so there is no one in it to pick",
  });
}

/** A compartment world's session: compartments.ode bound to its model, seen through the town kit. */
export function createTownSession(model: CompartmentModel, options: SessionOptions): TownSession {
  return createSession(model, townView(model), options);
}
