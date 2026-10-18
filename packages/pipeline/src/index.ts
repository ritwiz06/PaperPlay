/**
 * @paperplay/pipeline: agent roles, model adapters, independent checks, controller. The
 * deterministic builder comes first (G2); the agents and the mock adapter follow at G3.
 */
export {
  BUILD_DEPTHS,
  buildWorld,
  SHELL,
  type BuildProblem,
  type BuildResult,
  type BuiltAction,
  type BuiltFork,
  type BuiltLevel,
  type BuiltOverride,
  type BuiltPlacement,
  type BuiltWorld,
  type Depth,
} from "./builder/build.ts";
export { claimHolds, SAMPLE_STEPS, sampleCount, summarise } from "./builder/difference.ts";
export { NEIGHBOURHOOD, SKIES, startsOf, sweepAccuracy, sweepLevels, worldsAt, type AccuracyResult, type LevelResult, type SkyResult, type Start } from "./rule/sweep.ts";
export { ballsApartOf, chartTopOf, LENS_FIGURES, SHARE_TOWN, sharesOf, TOWN_FIGURES, townFigureCounts, townLensOf, VISIBLE_APART, VISIBLE_FIGURES, VISIBLE_SHARE, visibilityOf, type Lens, type LevelVisibility } from "./rule/visibility.ts";
export { checkFindings, LEVELS_ON_FINDINGS, type FindingsCheck } from "./rule/findings.ts";
export { checkClaim, decideReviews, definitionalProblem, describeDirectEffect, directEffectOf, isSystemWide, termHolds, type DirectEffect, type ModelClaim, type ReviewRecord } from "./rule/direct.ts";
