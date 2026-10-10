/**
 * @paperplay/ui/stage-core: pure, framework-free presentation. (state, camera, palette)
 * → FrameDescription, through a scene kit's pure half (ADR-0026). No Three.js, no DOM, no
 * React; it never writes simulation state. Each kit's half is its own entry point, such as
 * `@paperplay/ui/stage-core/valley`.
 */
export * from "./camera.ts";
export { contrastRatio, mixHex, relativeLuminance } from "./color.ts";
export * from "./fixed-step.ts";
export * from "./frame.ts";
export * from "./palettes.ts";
export * from "./picking.ts";
export * from "./screen.ts";
export { transform4, transformPoint, type Mat4, type Vec3 } from "./vec.ts";
