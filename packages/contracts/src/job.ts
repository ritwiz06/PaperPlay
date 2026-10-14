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

/** States a job ends in: nothing follows them. */
export const TERMINAL_STATES: readonly JobState[] = Object.freeze(["ready", "needs_information", "unsupported", "failed", "cancelled"]);

/**
 * Which state may follow which (R11). `ready` follows only `checking`, and the controller reaches
 * it only when every required check has run and passed; `repairing` leads back into the stage it
 * repairs. Any state but a terminal one may end in `failed` or `cancelled`.
 */
export const JOB_TRANSITIONS: Readonly<Record<JobState, readonly JobState[]>> = Object.freeze({
  received: ["parsing"],
  parsing: ["planning", "unsupported"],
  planning: ["building", "repairing", "needs_information", "unsupported"],
  building: ["running", "repairing"],
  running: ["checking", "repairing"],
  checking: ["ready", "repairing", "needs_information"],
  repairing: ["planning", "building", "running", "checking", "needs_information"],
  ready: [],
  needs_information: [],
  unsupported: [],
  failed: [],
  cancelled: [],
});

export const canMove = (from: JobState, to: JobState): boolean =>
  JOB_TRANSITIONS[from].includes(to) || (!TERMINAL_STATES.includes(from) && (to === "failed" || to === "cancelled"));

/** One thing a job did, as its events stream says it: its state, the step within it, and why, in words. */
export const JobEvent = z.strictObject({
  jobId: z.string().regex(/^[a-z0-9-]{6,64}$/),
  /** Its place in the job's events, from 1, so a client that reconnects asks for what it missed. */
  seq: z.int().positive(),
  at: z.iso.datetime(),
  state: JobState,
  /** What the job is doing within the state, such as "the second transcription". */
  step: z.string().min(1).max(120),
  message: z.string().min(1).max(600),
});
export type JobEvent = z.infer<typeof JobEvent>;
