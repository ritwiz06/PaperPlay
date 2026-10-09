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
