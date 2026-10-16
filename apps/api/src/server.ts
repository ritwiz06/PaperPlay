import { TERMINAL_STATES, type JobEvent } from "@paperplay/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { PDF_LIMITS } from "@paperplay/pipeline/ingest";
import { JobStore, parseSource, type JobRunner } from "./jobs.ts";

/** The largest request body the API reads: a job's request is a line of JSON. */
export const BODY_LIMIT = 16 * 1024;

const JobRequest = z.strictObject({ source: z.string().min(1).max(200) });

export interface ServerOptions {
  /** Runs a job's pipeline: with recordings under `npm run dev:api`, live only under `npm run pipeline:live -- serve`. */
  readonly runner?: JobRunner;
  /** Where jobs are kept, or null to keep them in memory only, as tests do. */
  readonly dataFolder?: string | null;
}

/**
 * Builds the API without listening, so tests can drive it with `inject` (R11). Jobs run the
 * pipeline's controller; their events stream over server-sent events with their real states, and
 * a client that reconnects is sent what it missed. Secrets stay in apps/api/.env.
 */
export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: BODY_LIMIT });
  const store = options.runner ? new JobStore(options.runner, options.dataFolder === undefined ? undefined : options.dataFolder) : null;
  app.get("/health", () => ({ status: "ok" }));

  app.post("/jobs", async (request, reply) => {
    if (!store) return reply.code(503).send({ error: "this server runs no jobs" });
    const parsed = JobRequest.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "send {\"source\": \"arxiv:<id>v<n>\"} or {\"source\": \"pmc:PMC<n>\"}" });
    const source = parseSource(parsed.data.source);
    if (!source) return reply.code(400).send({ error: `${parsed.data.source} is not an arXiv id with its version or a PMCID` });
    const job = store.start(parsed.data.source, source);
    return reply.code(202).send({ jobId: job.id, state: job.state, events: `/jobs/${job.id}/events` });
  });

  // A PDF from this machine (ADR-0038): its bytes, up to what the PDF reader takes, and its name.
  app.addContentTypeParser("application/pdf", { parseAs: "buffer", bodyLimit: PDF_LIMITS.bytes }, (_request, body, done) => done(null, body));
  app.post<{ Querystring: { name?: string } }>("/jobs/pdf", { bodyLimit: PDF_LIMITS.bytes }, async (request, reply) => {
    if (!store) return reply.code(503).send({ error: "this server runs no jobs" });
    const body = request.body;
    if (!(body instanceof Buffer) || body.length === 0) return reply.code(400).send({ error: "send the PDF itself as the body, with content-type application/pdf" });
    const bytes = new Uint8Array(body);
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") return reply.code(400).send({ error: "the body is not a PDF: it does not begin %PDF-" });
    const name = (request.query.name ?? "paper.pdf").replace(/[^\w .()-]/g, "_").slice(0, 120) || "paper.pdf";
    const job = store.start(`pdf:${name}`, { kind: "pdf", bytes, name });
    return reply.code(202).send({ jobId: job.id, state: job.state, events: `/jobs/${job.id}/events` });
  });

  app.get<{ Params: { id: string } }>("/jobs/:id", async (request, reply) => {
    const job = store?.get(request.params.id);
    if (!job) return reply.code(404).send({ error: "no such job" });
    return { jobId: job.id, source: job.source, state: job.state, events: job.events.length, artifacts: [...job.artifacts.keys()] };
  });

  app.delete<{ Params: { id: string } }>("/jobs/:id", async (request, reply) => {
    if (!store?.get(request.params.id)) return reply.code(404).send({ error: "no such job" });
    return { cancelling: store.cancel(request.params.id) };
  });

  app.get<{ Params: { id: string; name: string } }>("/jobs/:id/artifacts/:name", async (request, reply) => {
    const job = store?.get(request.params.id);
    if (!job?.artifacts.has(request.params.name)) return reply.code(404).send({ error: "no such artifact" });
    return job.artifacts.get(request.params.name);
  });

  app.get<{ Params: { id: string } }>("/jobs/:id/world", async (request, reply) => {
    const job = store?.get(request.params.id);
    if (!job) return reply.code(404).send({ error: "no such job" });
    if (job.state !== "ready") return reply.code(409).send({ error: `the job is ${job.state}, not ready` });
    return job.artifacts.get("world");
  });

  app.get<{ Params: { id: string }; Querystring: { after?: string } }>("/jobs/:id/events", (request, reply) => {
    const job = store?.get(request.params.id);
    if (!job) return reply.code(404).send({ error: "no such job" });
    const after = Number(request.headers["last-event-id"] ?? request.query.after ?? 0) || 0;
    reply.hijack();
    const out = reply.raw;
    out.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "keep-alive" });
    const send = (event: JobEvent): void => void out.write(`id: ${event.seq}\nevent: state\ndata: ${JSON.stringify(event)}\n\n`);
    for (const event of job.events.filter((entry) => entry.seq > after)) send(event);
    if (TERMINAL_STATES.includes(job.state)) {
      out.end();
      return undefined;
    }
    const listener = (event: JobEvent): void => {
      send(event);
      if (TERMINAL_STATES.includes(event.state)) {
        job.listeners.delete(listener);
        out.end();
      }
    };
    job.listeners.add(listener);
    request.raw.on("close", () => job.listeners.delete(listener));
    return undefined;
  });

  return app;
}
