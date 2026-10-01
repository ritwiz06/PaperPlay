/**
 * @paperplay/ui/three-adapter: applies FrameDescriptions to a Three.js scene. It never
 * reads or writes simulation state; it cannot even import the packages that hold it.
 */
export { applyFrame } from "./apply-frame.ts";
export { paintValley, valleyGeometry, valleyHeight } from "./geometry.ts";
export { mountStage, webgl2Available, type FallbackStage, type MountedStage, type StageOptions, type WebGLStage } from "./mount.ts";
export { BIRD_CAPACITY, createStageScene, type StageScene } from "./scene.ts";
