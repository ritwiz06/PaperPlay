/**
 * @paperplay/ui/three-adapter: applies FrameDescriptions to a Three.js scene. It never
 * reads or writes simulation state; it cannot even import the packages that hold it. Each
 * scene kit's half draws its own layers (ADR-0026).
 */
export { applyFrame } from "./apply-frame.ts";
export { THREE_KITS } from "./kits/index.ts";
export { mountStage, webgl2Available, type FallbackStage, type MountedStage, type StageOptions, type WebGLStage } from "./mount.ts";
export { createStageScene, disposeGeometries, instanced, SKY_RADIUS, type BaseScene, type StageScene, type ThreeKit } from "./scene.ts";
