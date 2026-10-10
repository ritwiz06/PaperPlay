/**
 * @paperplay/ui/react/valley: the valley kit's React half (ADR-0026): its mark, its tools, and
 * the flock's readouts, each showing the primitive's own values.
 */
import type { StageTool } from "../../WorldStage.tsx";

export { BirdMark } from "./BirdMark.tsx";
export { GroupsCounter, type GroupsCounterProps } from "./GroupsCounter.tsx";
export { HeadingCompass, type HeadingCompassProps } from "./HeadingCompass.tsx";
export { RocksCounter, type RocksCounterProps } from "./RocksCounter.tsx";
export { SpacingGauge, type SpacingGaugeProps } from "./SpacingGauge.tsx";
export { SpreadDial, type SpreadDialProps } from "./SpreadDial.tsx";

/** What a click does in the valley, beyond looking around: place a beacon or a rock, or pick a bird. */
export const VALLEY_TOOLS: Readonly<Record<"beacon" | "obstacle" | "bird", StageTool>> = Object.freeze({
  beacon: { does: "place", hint: "Click the field to place a beacon, or move the cursor with the arrow keys and press Enter." },
  obstacle: { does: "place", hint: "Click the field to place an obstacle, or move the cursor with the arrow keys and press Enter." },
  bird: { does: "pick", hint: "Click a bird to pick it, or move the cursor with the arrow keys and press Enter. Escape lets it go." },
});
