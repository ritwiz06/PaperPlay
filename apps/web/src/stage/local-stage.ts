import { flockDefaultParams, flockPlanarWeighted as flock } from "@paperplay/primitives";
import { advance, DEFAULT_CAMERA, describeFrame, START_CLOCK, valleyDay, withViewport } from "@paperplay/ui/stage-core";
import { mountStage } from "@paperplay/ui/three-adapter";

/**
 * Runs the flock at its fixed 1/60 s step and draws it on every animation frame. The
 * simulation advances by whole steps only; the renderer receives finished states.
 * Returns a function that stops the loop and releases the stage.
 */
export function startLocalStage(container: HTMLElement, seed = 42): () => void {
  const params = flockDefaultParams;
  const reducedMotion = container.ownerDocument.defaultView?.matchMedia("(prefers-reduced-motion: reduce)").matches ?? false;
  let redraw = (): void => undefined;
  const stage = mountStage(container, {
    label: `Murmuration Valley: a flock of ${params.agentCount} birds, each steering only by its near neighbours.`,
    onResize: () => redraw(),
  });
  if (stage.kind === "fallback") return () => stage.dispose();

  let previous = flock.init(params, seed);
  let current = previous;
  let clock = START_CLOCK;
  let last: number | null = null;
  let frames = 0;
  let handle = 0;

  const draw = (alpha: number): void => {
    const { width, height } = stage.viewport();
    const camera = withViewport(DEFAULT_CAMERA, width, height);
    stage.render(describeFrame({ previous, current, alpha, timestep: flock.fixedTimestep }, camera, valleyDay));
    frames += 1;
    container.dataset.frames = String(frames);
  };
  const tick = (now: number): void => {
    const next = advance(clock, last === null ? 0 : (now - last) / 1000, flock.fixedTimestep);
    last = now;
    clock = next.clock;
    for (let i = 0; i < next.steps; i++) {
      previous = current;
      current = flock.step(current, params, flock.fixedTimestep);
    }
    draw(next.alpha);
    handle = requestAnimationFrame(tick);
  };

  // With reduced motion the flock is shown still, redrawn only when the stage changes size.
  if (reducedMotion) {
    redraw = () => draw(0);
    draw(0);
  } else {
    handle = requestAnimationFrame(tick);
  }
  return () => {
    cancelAnimationFrame(handle);
    stage.dispose();
  };
}
