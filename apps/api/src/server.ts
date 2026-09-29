import Fastify, { type FastifyInstance } from "fastify";

/**
 * Builds the API without listening, so tests can drive it with `inject`.
 * Jobs, SSE events, worlds and runs arrive at G3; secrets stay in apps/api/.env.
 */
export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get("/health", () => ({ status: "ok" }));
  return app;
}
