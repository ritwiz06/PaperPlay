/**
 * A run of papers through the pipeline, recorded (ADR-0058's amendment): what `prebuild` writes of
 * each job to eval/runs/, for the session after it to count: the outcome, the time to the first
 * playable level and to the end, the levels released, and why it failed, by category.
 */

/** What a run of papers records of each job (ADR-0058's amendment): its outcome, its times, its levels, and why it failed. */
export interface RunRow {
  readonly source: string;
  readonly jobId: string | null;
  /** ready, needs-information, explainer fallback, failed, or cached. */
  readonly outcome: string;
  readonly firstPlayableSeconds: number | null;
  readonly endSeconds: number | null;
  readonly levelsReleased: number;
  readonly failure: string | null;
  readonly message: string;
}

/** A job's failure, by its ending's words: the category the next session counts. */
export function failureOf(state: string, message: string, explainer: boolean): string | null {
  if (state === "ready") return null;
  const said = message.toLowerCase();
  if (said.includes("no mechanism")) return "the writer refused: no mechanism to simulate";
  if (said.includes("still fails its checks") || said.includes("no time for fix")) return "the module never passed its checks";
  if (said.includes("did not arrive") || (said.includes("writer call") && said.includes("ran past"))) return "the writer ran out of time";
  if (said.includes("candidate levels pass the rules")) return "too few candidate levels passed the rules";
  if (said.includes("time ran out") || said.includes("deadline")) return "the job's deadline";
  if (state === "needs_information") return said.includes("hook") ? "a reviewer blocked the hook" : "a reviewer's block left to the owner";
  if (said.includes("planner") || said.includes("picks")) return "the planners chose no valid levels";
  if (said.includes("words")) return "the explainer's words";
  if (said.includes("fetch") || said.includes("source") || said.includes("ingest")) return "ingest";
  return explainer ? "the explainer page, for another reason" : "other";
}
