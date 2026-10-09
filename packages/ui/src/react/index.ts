/**
 * @paperplay/ui/react: the React components of the stage, the bench and the game-first HUD
 * (ADR-0008). They display what they are given and report what the learner does; they may
 * read simulation types, but never import simulation code.
 */
export { Guide, GUIDE_SHOW_MS, type GuideLine, type GuideProps } from "./Guide.tsx";
export { GroupsCounter, type GroupsCounterProps } from "./GroupsCounter.tsx";
export { HeadingCompass, type HeadingCompassProps } from "./HeadingCompass.tsx";
export {
  BirdMark,
  BookIcon,
  ChevronIcon,
  DEPTHS,
  DepthToggle,
  isDepth,
  ORIGIN_WORDS,
  OriginTag,
  PlayIcon,
  type Depth,
  type DepthToggleProps,
  type OriginTagProps,
} from "./hud-parts.tsx";
export { LabBench, type BenchControl, type LabBenchProps } from "./LabBench.tsx";
export { LevelCard, type LevelCardProps, type LevelControl } from "./LevelCard.tsx";
export { LevelMap, type LevelMapProps, type MapLevel } from "./LevelMap.tsx";
export { ORIGIN_LABELS, ORIGIN_MEANINGS, ORIGINS, OriginChip, OriginLegend } from "./origin.tsx";
export { PaperJournal, type JournalPage, type JournalPassage, type PaperJournalProps } from "./PaperJournal.tsx";
export { Readout, type ReadoutProps } from "./Readout.tsx";
export { SpacingGauge, type SpacingGaugeProps } from "./SpacingGauge.tsx";
export { HUD_MARGIN, useFreeRect } from "./useFreeRect.ts";
export { WorldStage, type StageDriver, type StageTool, type WorldStageProps } from "./WorldStage.tsx";
