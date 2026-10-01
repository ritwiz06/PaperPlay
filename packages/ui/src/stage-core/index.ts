/**
 * @paperplay/ui/stage-core: pure, framework-free presentation. (state, camera, palette)
 * → FrameDescription. No Three.js, no DOM, no React; it never writes simulation state.
 */
export * from "./camera.ts";
export { contrastRatio, mixHex, relativeLuminance } from "./color.ts";
export * from "./fixed-step.ts";
export * from "./frame.ts";
export * from "./palettes.ts";
export { transform4, transformPoint, type Mat4, type Vec3 } from "./vec.ts";
