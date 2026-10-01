/**
 * @paperplay/ui/react: the React components of the stage and the bench. They display what
 * they are given and report what the learner does; they may read simulation types, but never
 * import simulation code.
 */
export { LabBench, type BenchControl, type LabBenchProps } from "./LabBench.tsx";
export { ORIGIN_LABELS, ORIGIN_MEANINGS, ORIGINS, OriginChip, OriginLegend } from "./origin.tsx";
export { Readout, type ReadoutProps } from "./Readout.tsx";
export { WorldStage, type StageDriver, type StageTool, type WorldStageProps } from "./WorldStage.tsx";
