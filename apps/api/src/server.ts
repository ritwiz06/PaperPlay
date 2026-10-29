import { TERMINAL_STATES, type JobEvent } from "@paperplay/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { PDF_LIMITS } from "@paperplay/pipeline/ingest";
import { CACHE_DIR, cacheKey, worldCache } from "./cache.ts";
import { JobStore, parseSource, type JobRunner } from "./jobs.ts";
import { urlOf, webPort } from "../../../scripts/machine/ports.ts";

/** The largest request body the API reads: a job's request is a line of JSON. */
export const BODY_LIMIT = 16 * 1024;

/** A request for a world; fresh asks for it to be made again even when one is kept (R13). */
const JobRequest = z.strictObject({ source: z.string().min(1).max(200), fresh: z.boolean().optional() });

export interface ServerOptions {
  /** Runs a job's pipeline: with recordings under `npm run dev:api`, live only under `npm run pipeline:live -- serve`. */
  readonly runner?: JobRunner;
  /** Where jobs are kept, or null to keep them in memory only, as tests do. */
  readonly dataFolder?: string | null;
  /** Where ready worlds are kept by paper and version; in memory when null, and by default beside the jobs, or in memory when they are. */
  readonly cacheFolder?: string | null;
}

/**
 * Builds the API without listening, so tests can drive it with `inject` (R11). Jobs run the
 * pipeline's controller; their events stream over server-sent events with their real states, and
 * a client that reconnects is sent what it missed. Secrets stay in apps/api/.env.
 */
export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: BODY_LIMIT });
  const cache = worldCache(options.cacheFolder !== undefined ? options.cacheFolder : options.dataFolder === null ? null : CACHE_DIR);
  const store = options.runner ? new JobStore(options.runner, options.dataFolder === undefined ? undefined : options.dataFolder, undefined, cache) : null;
  app.get("/health", () => ({ status: "ok" }));
  // The API has no pages: its root says so, and where the app is, rather than "Route GET:/ not found".
  app.get("/", () => ({
    service: "PaperPlay API",
    message: `This is the API behind the PaperPlay web app, and it has no pages. Run \`npm run dev\` and open the app, at ${urlOf(webPort())} (PAPERPLAY_WEB_PORT): /library lists every world, and /create makes one, reaching this API through /api.`,
    routes: ["GET /health", "GET /jobs", "POST /jobs", "POST /jobs/pdf", "GET /jobs/:id", "DELETE /jobs/:id", "GET /jobs/:id/events", "GET /jobs/:id/artifacts/:name", "GET /jobs/:id/world", "GET /jobs/:id/released", "GET /worlds/:key", "GET /worlds/:key/mechanism"],
  }));

  // This server's jobs, for the library on a development server: each world made here, by job.
  app.get("/jobs", () => ({
    jobs: (store?.list() ?? []).map((job) => {
      const world = job.state === "ready" ? (job.artifacts.get("world") as { title?: unknown; routing?: { family?: unknown }; levels?: { order?: unknown; title?: unknown; bonus?: unknown }[] } | undefined) : undefined;
      return {
        jobId: job.id,
        source: job.source,
        state: job.state,
        world: world ? { title: typeof world.title === "string" ? world.title : "", levels: (world.levels ?? []).map((level) => ({ order: Number(level.order), title: typeof level.title === "string" ? level.title : "", bonus: level.bonus === true })) } : null,
        // A world on a module a coding model wrote (ADR-0058), which the library marks as such.
        generatedModel: world?.routing?.family === "generated",
      };
    }),
  }));

  app.post("/jobs", async (request, reply) => {
    if (!store) return reply.code(503).send({ error: "this server runs no jobs" });
    const parsed = JobRequest.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "send {\"source\": \"arxiv:<id>v<n>\"} or {\"source\": \"pmc:PMC<n>\"}" });
    const source = parseSource(parsed.data.source);
    if (!source) return reply.code(400).send({ error: `${parsed.data.source} is not an arXiv id with its version or a PMCID` });
    // A paper made before, under today's rules, is served at once and no job runs (R13, ADR-0053).
    const kept = parsed.data.fresh === true ? null : cache.get(parsed.data.source);
    if (kept) return reply.code(200).send({ cached: { world: `/worlds/${cacheKey(parsed.data.source) ?? ""}`, jobId: kept.jobId, madeAt: kept.madeAt, rules: kept.rules } });
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

  // The levels released so far (R13, ADR-0053): each passed every check, and no reviewer has read them yet.
  app.get<{ Params: { id: string } }>("/jobs/:id/released", async (request, reply) => {
    const job = store?.get(request.params.id);
    if (!job) return reply.code(404).send({ error: "no such job" });
    if (!job.artifacts.has("released")) return reply.code(409).send({ error: "no level of this job has passed its checks yet" });
    return job.artifacts.get("released");
  });

  // A world kept by its paper and version, made by an earlier job under today's rules (R13).
  app.get<{ Params: { key: string } }>("/worlds/:key", async (request, reply) => {
    const kept = cache.getByKey(request.params.key);
    if (!kept) return reply.code(404).send({ error: "no world is kept for that paper under today's rules" });
    return kept.world;
  });

  // A generated world's module (ADR-0058): its page checks the hash against the world's, then runs it in the sandbox.
  app.get<{ Params: { key: string } }>("/worlds/:key/mechanism", async (request, reply) => {
    const kept = cache.getByKey(request.params.key);
    if (!kept?.mechanism) return reply.code(404).send({ error: "no generated module is kept for that paper" });
    return kept.mechanism;
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
