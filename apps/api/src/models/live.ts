/**
 * The only way to a live gateway client (ADR-0030). Tests and CI replay recordings and never call
 * Voyager; only `npm run pipeline:live` does. So a live client is built only inside that npm
 * script, never under CI or a test runner, and its key is read from apps/api/.env alone.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadModelConfig, type ModelConfig } from "./config.ts";
import { nodeFetch } from "./node-fetch.ts";
import { voyagerClient, type VoyagerClient } from "./voyager.ts";

export const ENV_FILE = join(import.meta.dirname, "..", "..", ".env");
export const KEY_NAME = "VOYAGER_API_KEY";
export const LIVE_SCRIPT = "pipeline:live";

/** Why a live call may not be made here, or null when it may. */
export function liveRefusal(env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  if (env.CI) return "live model calls never run on CI, which replays recordings";
  if (env.VITEST) return "live model calls never run under a test, which replays recordings";
  if (env.npm_lifecycle_event !== LIVE_SCRIPT) return `live model calls run only through npm run ${LIVE_SCRIPT}`;
  return null;
}

/** The key, from apps/api/.env. Its value is never printed; a missing key is named, not shown. */
export function readKey(file: string = ENV_FILE): string {
  if (!existsSync(file)) throw new Error(`${KEY_NAME} must be in ${file}, which does not exist`);
  const line = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${KEY_NAME}=`));
  const value = line?.slice(line.indexOf("=") + 1).trim().replace(/^(["'])(.*)\1$/, "$2") ?? "";
  if (value.length === 0) throw new Error(`${file} does not set ${KEY_NAME}`);
  return value;
}

/** The gateway's client with the key and the configuration, for the live command alone. */
export function liveClient(config: ModelConfig = loadModelConfig()): VoyagerClient {
  const refusal = liveRefusal();
  if (refusal !== null) throw new Error(refusal);
  return voyagerClient({
    baseUrl: config.baseUrl,
    apiKey: readKey(),
    timeoutMs: config.timeoutMs,
    retries: config.retries,
    backoffMs: config.backoffMs,
    minIntervalMs: config.minIntervalMs,
    // Not Node's own fetch, which gives up on a reply after 300 seconds whatever the timeout says.
    fetch: nodeFetch as typeof fetch,
  });
}
