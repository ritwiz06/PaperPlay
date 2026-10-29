/**
 * npm run dev:api: the API with recorded model calls only (ADR-0030). A job runs on a paper whose
 * calls were recorded by `npm run pipeline:live`; any other call fails with the reason, and nothing
 * reaches the gateway. For live calls, run `npm run pipeline:live -- serve`.
 */
import { join } from "node:path";
import { directoryStore, replayClient } from "@paperplay/pipeline/models";
import { outboundFetch } from "./contact.ts";
import { loadModelConfig } from "./models/config.ts";
import { pipelineRunner } from "./runner.ts";
import { listen } from "./listen.ts";
import { buildServer } from "./server.ts";

const client = replayClient(directoryStore(join(import.meta.dirname, "..", "..", "..", "fixtures", "recordings")));
const app = buildServer({ runner: pipelineRunner(client, loadModelConfig(), outboundFetch()) });
await listen(app, "api", "recorded model calls only");
