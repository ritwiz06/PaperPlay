import type { ThreeKit } from "../scene.ts";
import { townThree } from "./town/index.ts";
import { valleyThree } from "./valley/index.ts";

/**
 * Every scene kit's Three.js half, by kit id. They load together, with Three.js, as the stage's
 * one chunk, after the page and its HUD have drawn (ADR-0017).
 */
export const THREE_KITS: Readonly<Record<string, ThreeKit>> = Object.freeze({ [valleyThree.id]: valleyThree, [townThree.id]: townThree });
