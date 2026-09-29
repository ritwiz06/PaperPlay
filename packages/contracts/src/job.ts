import { z } from "zod";

/**
 * Real job states, in lifecycle order, then the branches. There is no timed or
 * percentage progress; progress is whichever of these a job last emitted.
 */
export const JobState = z.enum([
  "received",
  "parsing",
  "planning",
  "building",
  "running",
  "checking",
  "ready",
  "needs_information",
  "unsupported",
  "repairing",
  "failed",
  "cancelled",
]);
export type JobState = z.infer<typeof JobState>;
