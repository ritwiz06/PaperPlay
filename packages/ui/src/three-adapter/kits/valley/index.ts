/**
 * The valley kit's Three.js half (ADR-0026): low-poly birds with hinged wings, their trails,
 * beacons and rocks, over a valley with its meadow, lake, trees and rocks. It draws flock
 * frames only, and can import nothing that holds simulation state.
 */
import type { FlockFrame } from "../../../stage-core/kits/valley/index.ts";
import { createStageScene as createScene, type StageScene, type ThreeKit } from "../../scene.ts";
import { applyValley } from "./apply.ts";
import { createValley, disposeValley, type ValleyParts } from "./scene.ts";

export { applyFrame } from "../../apply-frame.ts";
export { paintValley, valleyGeometry, valleyHeight } from "./geometry.ts";
export { BIRD_CAPACITY, TRAIL_WIDTH, type ValleyParts } from "./scene.ts";

export const valleyThree: ThreeKit<ValleyParts, FlockFrame> = Object.freeze({
  id: "valley",
  create: createValley,
  draw: applyValley,
  dispose: disposeValley,
  words: Object.freeze({
    fallback:
      "Your browser has WebGL turned off or cannot start it, so the valley and its flock cannot be drawn here. The flock's rules and measurements do not depend on drawing it.",
    lost: "The browser took back this world's graphics, as it can when a tab sits in the background. Only the drawing stopped: the flock's run and its measurements carry on.",
  }),
});

/** A stage that draws the valley: the stage's own objects, and the valley's. */
export const createStageScene = (): StageScene<ValleyParts, FlockFrame> => createScene(valleyThree);
