/**
 * @paperplay/ui/react/mechanism: the generic scene kits a generated mechanism draws in (ADR-0058),
 * on a 2D canvas: particles, towers and beams, grid, network, landscape and charts. They display
 * a frame the app has already parsed; they never run the mechanism.
 */
export { drawMechanismFrame, MECHANISM_FONT_STACK, type CanvasSize } from "./draw.ts";
export { MechanismCanvas, type MechanismCanvasProps } from "./MechanismCanvas.tsx";
export { GROUP_COLOURS, groupColour, mechanismPalette } from "./palette.ts";
export { MechanismMark, MechanismStage, type MechanismStageInput, type MechanismStageProps } from "./MechanismStage.tsx";
