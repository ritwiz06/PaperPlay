/**
 * npm run timing [-- <job id>...] [--since=YYYY-MM-DD]
 *
 * Where a generation's wall clock goes (R13, ADR-0053), from the jobs this machine ran: each job's
 * events (apps/api/data/jobs/<id>/events.jsonl), its trace, which times every call the client made,
 * and the recordings, a fresh job's first, which keep each reply's tokens and when it ended. A call the trace times
 * under a second was replayed from a recording, not asked, so it costs no wall clock. Calls nothing.
 *
 * Thinking tokens are an estimate: the gateway reports a reply's tokens, thinking and answer
 * together, so the answer's share is taken as its characters over four.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");

export interface Call {
  readonly stage: string;
  readonly model: string;
  readonly ok: boolean;
  readonly milliseconds: number;
  /** When the reply ended, from its recording; null for a call that failed. */
  readonly end: number | null;
  readonly promptTokens: number;
  readonly completionTokens: number;
  /** The reply's own characters, without its thinking. */
  readonly answerCharacters: number;
  readonly finishReason: string | null;
  /** Whether its recording was found, so its tokens are known. */
  readonly recorded: boolean;
}

export interface Job {
  readonly id: string;
  readonly source: string;
  readonly start: number;
  readonly end: number;
  readonly outcome: string;
  readonly repairs: number;
  readonly calls: readonly Call[];
}

/** A stretch where at least one call was in flight, and the call the job waited on longest in it. */
export interface Phase {
  readonly start: number;
  readonly end: number;
  readonly stages: readonly string[];
  readonly binding: string;
}

export const LIVE_MILLISECONDS = 1000;
const live = (call: Call): boolean => call.milliseconds >= LIVE_MILLISECONDS;
export const thinkingOf = (call: Call): number => (call.recorded ? Math.max(0, call.completionTokens - Math.round(call.answerCharacters / 4)) : 0);

/** The critical path: overlapping calls grouped, each group as long as its first start to its last end. */
export function phasesOf(calls: readonly Call[]): Phase[] {
  const spans = calls
    .filter((call) => live(call) && call.end !== null)
    .map((call) => ({ start: (call.end ?? 0) - call.milliseconds, end: call.end ?? 0, stage: call.stage }))
    .sort((a, b) => a.start - b.start);
  const phases: { start: number; end: number; stages: string[]; binding: string }[] = [];
  for (const span of spans) {
    const last = phases.at(-1);
    if (last && span.start < last.end) {
      last.stages.push(span.stage);
      if (span.end > last.end) Object.assign(last, { end: span.end, binding: span.stage });
    } else phases.push({ start: span.start, end: span.end, stages: [span.stage], binding: span.stage });
  }
  return phases;
}

/** How long the job had no call in flight: the local work, and the waits between calls. */
export const outsideCalls = (job: Job): number => job.end - job.start - phasesOf(job.calls).reduce((sum, phase) => sum + phase.end - phase.start, 0);

const percentile = (values: readonly number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : (sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0);
};
const minutes = (ms: number): string => (ms / 60_000).toFixed(1);
const thousands = (tokens: number): string => `${(tokens / 1000).toFixed(1)}k`;
const STAGE_ORDER = ["router", "reader", "transcriber", "second-transcriber", "planner", "second-planner", "explainer", "reviewer", "second-reviewer"];
const byStageOrder = (a: string, b: string): number => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b);
const groupsOf = (stages: readonly string[]): string => [...new Set(stages)].sort(byStageOrder).map((stage) => `${stage}${stages.filter((other) => other === stage).length > 1 ? ` ×${stages.filter((other) => other === stage).length}` : ""}`).join(" ‖ ");

/** Per stage across every live call: calls, latency, tokens, thinking, and the replies that ran out of room. */
export function stageTable(jobs: readonly Job[]): string {
  const calls = jobs.flatMap((job) => job.calls.filter(live));
  const lines = ["| Stage | Live calls | Failed | p50 min | p90 min | Prompt tokens, mean | Reply tokens, mean | Thinking, mean ≈ | Tokens a second | Ran out of room |", "|---|---|---|---|---|---|---|---|---|---|"];
  for (const stage of [...new Set(calls.map((call) => call.stage))].sort(byStageOrder)) {
    const mine = calls.filter((call) => call.stage === stage);
    const ok = mine.filter((call) => call.ok);
    const known = ok.filter((call) => call.recorded);
    const mean = (pick: (call: Call) => number): number => (known.length === 0 ? 0 : known.reduce((sum, call) => sum + pick(call), 0) / known.length);
    const rate = known.reduce((sum, call) => sum + call.completionTokens, 0) / Math.max(1, known.reduce((sum, call) => sum + call.milliseconds, 0) / 1000);
    const models = [...new Set(mine.map((call) => call.model))].join(", ");
    lines.push(`| ${stage} (${models}) | ${mine.length} | ${mine.length - ok.length} | ${minutes(percentile(ok.map((call) => call.milliseconds), 50))} | ${minutes(percentile(ok.map((call) => call.milliseconds), 90))} | ${thousands(mean((call) => call.promptTokens))} | ${thousands(mean((call) => call.completionTokens))} | ${thousands(mean(thinkingOf))} | ${rate.toFixed(0)} | ${ok.filter((call) => call.finishReason === "length").length} |`);
  }
  return lines.join("\n");
}

/** One row a job: its wall clock, calls, repairs, and how much of it was spent waiting on calls. */
export function jobTable(jobs: readonly Job[]): string {
  const lines = ["| Job | Paper | Began | Outcome | Wall min | Live calls | Repairs | In calls min | Outside calls min | Tokens recorded | Thinking ≈ |", "|---|---|---|---|---|---|---|---|---|---|---|"];
  for (const job of jobs) {
    const calls = job.calls.filter(live);
    const inCalls = phasesOf(job.calls).reduce((sum, phase) => sum + phase.end - phase.start, 0);
    lines.push(`| ${job.id} | ${job.source} | ${new Date(job.start).toISOString().slice(0, 16).replace("T", " ")} | ${job.outcome} | ${minutes(job.end - job.start)} | ${calls.length} | ${job.repairs} | ${minutes(inCalls)} | ${minutes(outsideCalls(job))} | ${thousands(calls.reduce((sum, call) => sum + (call.recorded ? call.promptTokens + call.completionTokens : 0), 0))} | ${thousands(calls.reduce((sum, call) => sum + thinkingOf(call), 0))} |`);
  }
  return lines.join("\n");
}

/** A job's critical path in words: each phase, how long, and what it waited on. */
export function criticalPath(job: Job): string {
  const phases = phasesOf(job.calls);
  const parts = phases.map((phase) => `${groupsOf(phase.stages)} ${minutes(phase.end - phase.start)}`);
  return `${job.id} (${job.source}, ${job.outcome}, ${minutes(job.end - job.start)} min): ${parts.join(" → ")}; outside calls ${minutes(outsideCalls(job))}`;
}

/** A job as this machine kept it, or null when it made no live call; its recordings looked for in each folder in turn. */
export function readJob(directory: string, recordings: string | readonly string[]): Job | null {
  const folders = typeof recordings === "string" ? [recordings] : recordings;
  const eventsFile = join(directory, "events.jsonl");
  const traceFile = join(directory, "trace.json");
  if (!existsSync(eventsFile) || !existsSync(traceFile)) return null;
  const events = readFileSync(eventsFile, "utf8").split("\n").filter((line) => line.trim() !== "").map((line) => JSON.parse(line) as { at: string; state: string; message: string });
  const first = events[0];
  const last = events.at(-1);
  if (!first || !last) return null;
  const trace = JSON.parse(readFileSync(traceFile, "utf8")) as { entries: { stage: string; model: string; promptHash: string; outcome: string; tokens: number; milliseconds: number }[] };
  const start = Date.parse(first.at);
  const end = Date.parse(last.at);
  const within = (at: number): boolean => at >= start - 1000 && at <= end + 1000;
  type Kept = { recordedAt: string; response: { text: string; finishReason?: string; usage: { promptTokens: number; completionTokens: number } } };
  const calls: Call[] = trace.entries.map((entry) => {
    // One prompt can be recorded in more than one folder, by different jobs: the one this job made, if any.
    const found = folders.map((folder) => join(folder, `${entry.promptHash}.json`)).filter((candidate) => existsSync(candidate)).map((file) => JSON.parse(readFileSync(file, "utf8")) as Kept);
    const recording = entry.outcome === "ok" ? (found.find((kept) => within(Date.parse(kept.recordedAt))) ?? found[0] ?? null) : null;
    return {
      stage: entry.stage,
      model: entry.model,
      ok: entry.outcome === "ok",
      milliseconds: entry.milliseconds,
      end: recording ? Date.parse(recording.recordedAt) : null,
      promptTokens: recording?.response.usage.promptTokens ?? 0,
      completionTokens: recording?.response.usage.completionTokens ?? entry.tokens,
      answerCharacters: recording?.response.text.length ?? 0,
      finishReason: recording?.response.finishReason ?? null,
      recorded: recording !== null,
    };
  });
  // A recording made by another job ends outside this one: the call here was its replay.
  const own = calls.map((call) => (call.end !== null && !within(call.end) ? { ...call, milliseconds: 0 } : call));
  if (!own.some(live)) return null;
  return { id: directory.split("/").at(-1) ?? directory, source: first.message.replace(/^received /, ""), start, end, outcome: last.state, repairs: events.filter((event) => event.state === "repairing").length, calls: own };
}

if (import.meta.main) {
  const directory = join(root, "apps", "api", "data", "jobs");
  const asked = process.argv.slice(2).filter((value) => !value.startsWith("--"));
  const since = Date.parse(process.argv.find((value) => value.startsWith("--since="))?.slice("--since=".length) ?? "1970-01-01");
  const jobs = (existsSync(directory) ? readdirSync(directory) : [])
    .filter((id) => asked.length === 0 || asked.includes(id))
    // A fresh job's recordings are kept apart from the committed ones (ADR-0053).
    .flatMap((id) => readJob(join(directory, id), [join(root, "apps", "api", "data", "recordings"), join(root, "fixtures", "recordings")]) ?? [])
    .filter((job) => job.start >= since)
    .sort((a, b) => a.start - b.start);
  const wall = jobs.map((job) => job.end - job.start);
  console.log(`${jobs.length} jobs with live calls${since > 0 ? ` since ${new Date(since).toISOString().slice(0, 10)}` : ""}; wall clock p50 ${minutes(percentile(wall, 50))} min, p90 ${minutes(percentile(wall, 90))} min; ${jobs.filter((job) => job.outcome === "ready").length} ready\n`);
  console.log(`${jobTable(jobs)}\n\n${stageTable(jobs)}\n\nCritical paths:\n${jobs.map((job) => `- ${criticalPath(job)}`).join("\n")}`);
}
