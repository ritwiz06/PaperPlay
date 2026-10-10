/**
 * @paperplay/ui/react: the React components of the stage, the bench and the game-first HUD
 * (ADR-0008). They display what they are given and report what the learner does; they may
 * read simulation types, but never import simulation code. Each scene kit's React half is its
 * own entry point, such as `@paperplay/ui/react/valley` (ADR-0026).
 */
export { Guide, GuideLines, GuideNote, GUIDE_SHOW_MS, type GuideAsk, type GuideLine, type GuideProps } from "./Guide.tsx";
export { DifferenceChart, type DifferenceChartProps } from "./DifferenceChart.tsx";
export { ForkView, type ForkPane, type ForkViewProps } from "./ForkView.tsx";
export {
  BookIcon,
  ChevronIcon,
  DEPTHS,
  DepthToggle,
  isDepth,
  ORIGIN_WORDS,
  OriginTag,
  PlayIcon,
  RestartIcon,
  type Depth,
  type DepthToggleProps,
  type KitMark,
  type OriginTagProps,
} from "./hud-parts.tsx";
export { LabBench, type BenchControl, type LabBenchProps } from "./LabBench.tsx";
export { LevelCard, type LevelCardProps, type LevelControl } from "./LevelCard.tsx";
export { LevelMap, type LevelMapProps, type MapLevel } from "./LevelMap.tsx";
export { ORIGIN_LABELS, ORIGIN_MEANINGS, ORIGINS, OriginChip, OriginLegend } from "./origin.tsx";
export { PaperJournal, type CannotShowItem, type JournalPage, type JournalPassage, type PaperJournalProps } from "./PaperJournal.tsx";
export { Readout, type ReadoutProps } from "./Readout.tsx";
export { SpeedButton, type SpeedButtonProps } from "./SpeedButton.tsx";
export { HUD_MARGIN, useFreeRect } from "./useFreeRect.ts";
export { WorldStage, type StageDriver, type StageTool, type WorldStageProps } from "./WorldStage.tsx";
