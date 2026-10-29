/**
 * The API inside the web app's development server (ADR-0059's amendment): one process, one port,
 * one URL. The web app's server hands every request under /api to this API in the same process,
 * so `npm run dev` is the whole of PaperPlay on this machine, at one address. Recorded model calls
 * by default, as `npm run dev:api` replays them; live ones, recorded as they are made, only when
 * `npm run pipeline:live -- serve` starts the server, since a live client is refused anywhere else
 * (ADR-0030). The gateway's key stays in apps/api/.env and in this Node process, never in a page:
 * the development server serves no .env file, and the built app holds no API at all.
 */
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { directoryStore, replayClient, resumingClient } from "@paperplay/pipeline/models";
import { outboundFetch } from "./contact.ts";
import { loadModelConfig } from "./models/config.ts";
import { liveClient } from "./models/live.ts";
import { pipelineRunner } from "./runner.ts";
import { buildServer } from "./server.ts";

const RECORDINGS = join(import.meta.dirname, "..", "..", "..", "fixtures", "recordings");

/** Which model calls the API makes: those recorded, or live ones, recorded as they are made. */
export type ApiCalls = "recorded" | "live";

export async function apiForDevelopment(calls: ApiCalls): Promise<FastifyInstance> {
  const config = loadModelConfig();
  if (calls === "live") {
    const missing = Object.entries(config.stages).filter(([, model]) => model === null).map(([stage]) => stage);
    if (missing.length > 0) throw new Error(`apps/api/models.json names no model for ${missing.join(", ")}; the bake-off chooses them (eval/models.md)`);
  }
  // A live call already recorded is replayed, so a job run again is the same job, at once.
  const client = calls === "live" ? resumingClient(liveClient(config), directoryStore(RECORDINGS)) : replayClient(directoryStore(RECORDINGS));
  const app = buildServer({ runner: pipelineRunner(client, config, outboundFetch()) });
  await app.ready();
  return app;
}
