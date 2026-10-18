/**
 * The landscape kit's view of a session (ADR-0047): an optimizer's state as a ball on its loss
 * surface, with its trail. The ball is the primitive's position, read as it is, and nothing here
 * steps or measures. A learning world's session is the generic session with this view.
 */
import type { LandscapeModel, LandscapeParams, LandscapeState } from "@paperplay/primitives/learning";
import type { BaseEmphasis } from "@paperplay/ui/stage-core";
import { TRAIL_POINTS, type BallInput, type LandscapeInput, type SurfaceShape } from "@paperplay/ui/stage-core/landscape";
import { createSession, type CoreSnapshot, type SessionOptions as Options, type SessionView, type WorldSession } from "./session.ts";

/** What a learning world's snapshot adds: the loss where the ball stands, and where it started. */
export interface LandscapeReadings {
  readonly loss: number;
  readonly startLoss: number;
}

export type SessionOptions = Options<LandscapeParams, LandscapeState>;
export type LandscapeSnapshot = CoreSnapshot<LandscapeParams, Record<string, number>> & LandscapeReadings;
export type LandscapeSession = WorldSession<LandscapeParams, LandscapeState, Record<string, number>, LandscapeReadings, BaseEmphasis, LandscapeInput>;

/** The surface as the kit draws it, from the model's own spec. */
export function shapeOf(model: LandscapeModel): SurfaceShape {
  const { hx, hy, cx, cy, gx, gy, extent } = model.spec.surface;
  return { hx, hy, cx, cy, gx, gy, extent };
}

export function landscapeView(model: LandscapeModel): SessionView<LandscapeParams, LandscapeState, LandscapeReadings, BaseEmphasis, LandscapeInput> {
  const surface = shapeOf(model);
  const { position } = model.spec.optimizer;
  const at = (state: LandscapeState): readonly [number, number] => [state.x[position] ?? 0, state.y[position] ?? 0];
  return Object.freeze({
    extras: (state: LandscapeState, params: LandscapeParams): LandscapeReadings => ({
      loss: model.measure(state).loss,
      startLoss: model.measure(model.init(params, 0)).loss,
    }),
    emphasis: (): BaseEmphasis => ({}),
    input: (previous: LandscapeState, current: LandscapeState, alpha: number, _timestep: number, history: readonly LandscapeState[]): LandscapeInput => {
      const ball: BallInput = { role: "here", previous: at(previous), current: at(current), trail: [...history.map(at), at(current)] };
      return { surface, balls: [ball], alpha };
    },
    historySteps: TRAIL_POINTS,
    names: Object.freeze({}),
    entityIds: () => [],
    unpickable: () => "the ball is the optimizer itself, so there is nothing else on the surface to pick",
  });
}

/** In a fork, a pane's own ball and the other world's, each in its world's role, on the one surface. */
export function bothBalls(own: LandscapeInput, other: LandscapeInput, pane: "here" | "there"): LandscapeInput {
  const recast = (input: LandscapeInput, role: "here" | "there"): BallInput[] => input.balls.map((ball) => ({ ...ball, role }));
  const mine = recast(own, pane);
  const theirs = recast(other, pane === "here" ? "there" : "here");
  return { ...own, balls: pane === "here" ? [...mine, ...theirs] : [...theirs, ...mine] };
}

/** A learning world's session: learning.landscape bound to its rule, seen through the landscape kit. */
export function createLandscapeSession(model: LandscapeModel, options: SessionOptions): LandscapeSession {
  return createSession(model, landscapeView(model), options);
}
