/**
 * Jobs (R11, every-paper.md §3.8): each job runs the pipeline's controller once, keeps every event
 * in order and every artifact as JSON under apps/api/data/jobs/<id>/, which git ignores, and tells
 * whoever listens about each event as it happens. Nothing here is timed: a job's progress is the
 * last state it emitted.
 */
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { JobEvent, TERMINAL_STATES, type JobState } from "@paperplay/contracts";
import type { JobOutcome, JobSink, JobSource } from "@paperplay/pipeline/controller";
import type { WorldCache } from "./cache.ts";

export type JobRunner = (source: JobSource, sink: JobSink, signal: AbortSignal) => Promise<JobOutcome>;

export interface Job {
  readonly id: string;
  readonly source: string;
  readonly events: JobEvent[];
  readonly artifacts: Map<string, unknown>;
  state: JobState;
  readonly controller: AbortController;
  readonly listeners: Set<(event: JobEvent) => void>;
}

export const DATA_DIR = join(import.meta.dirname, "..", "data", "jobs");

/** A source as a client names it: arxiv:<id>v<n> or pmc:PMC<n>. */
export function parseSource(raw: string): JobSource | null {
  const arxiv = /^arxiv:((?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})v\d+)$/i.exec(raw.trim());
  if (arxiv) return { kind: "arxiv", id: arxiv[1] ?? "" };
  const pmc = /^pmc:(PMC\d{5,9})$/i.exec(raw.trim());
  if (pmc) return { kind: "pmc", id: (pmc[1] ?? "").toUpperCase() };
  return null;
}

export class JobStore {
  private readonly jobs = new Map<string, Job>();
  private readonly runner: JobRunner;
  private readonly folder: string | null;
  private readonly now: () => string;
  private readonly cache: WorldCache | null;

  /** With a cache, a world a job makes ready is kept by its paper and version (R13, ADR-0053). */
  constructor(runner: JobRunner, folder: string | null = DATA_DIR, now: () => string = () => new Date().toISOString(), cache: WorldCache | null = null) {
    this.runner = runner;
    this.folder = folder;
    this.now = now;
    this.cache = cache;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  list(): Job[] {
    return [...this.jobs.values()];
  }

  /** Starts a job and returns it at once; the controller runs on, emitting its events. */
  start(raw: string, source: JobSource): Job {
    const id = randomUUID().slice(0, 18);
    const job: Job = { id, source: raw, events: [], artifacts: new Map(), state: "received", controller: new AbortController(), listeners: new Set() };
    this.jobs.set(id, job);
    const folder = this.folder ? join(this.folder, id) : null;
    if (folder) mkdirSync(folder, { recursive: true });
    const sink: JobSink = {
      emit: (state, step, message) => {
        const event = JobEvent.parse({ jobId: id, seq: job.events.length + 1, at: this.now(), state, step: step.slice(0, 120), message: message.slice(0, 600) });
        job.events.push(event);
        job.state = state;
        if (folder) appendFileSync(join(folder, "events.jsonl"), `${JSON.stringify(event)}\n`);
        if (state === "ready" && job.artifacts.has("world")) this.cache?.put(raw, id, job.artifacts.get("world"), event.at);
        for (const listener of job.listeners) listener(event);
      },
      artifact: (name, value) => {
        job.artifacts.set(name, value);
        if (folder) writeFileSync(join(folder, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
      },
    };
    void this.runner(source, sink, job.controller.signal).catch((error: unknown) => {
      if (!TERMINAL_STATES.includes(job.state)) sink.emit("failed", "stopped", error instanceof Error ? error.message : String(error));
    });
    return job;
  }

  cancel(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job || TERMINAL_STATES.includes(job.state)) return false;
    job.controller.abort();
    return true;
  }
}
