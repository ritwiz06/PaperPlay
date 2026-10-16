/**
 * Every model call recorded (ADR-0030): the model, a hash of the prompt, and the response. A
 * recording never holds the prompt itself, so no paper's text is stored with it; the hash is
 * enough to replay. Tests and CI replay recordings; only `npm run pipeline:live` records.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ModelError, type ChatRequest, type ChatResponse, type ModelClient } from "./types.ts";

/** A value with its object keys sorted, at every depth, so equal requests serialise alike. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

/** The SHA-256 of everything that shapes the reply: the model, the messages, the schema, the temperature and the limit. Not the stage, which is a label. */
export function promptHash(request: ChatRequest): string {
  const { stage: _stage, ...shaping } = request;
  return createHash("sha256").update(JSON.stringify(canonical(shaping))).digest("hex");
}

export const Recording = z.strictObject({
  schemaVersion: z.literal("recording/1"),
  stage: z.string().min(1),
  model: z.string().min(1),
  promptHash: z.string().regex(/^[0-9a-f]{64}$/),
  response: z.strictObject({
    model: z.string(),
    text: z.string(),
    usage: z.strictObject({ promptTokens: z.number().nonnegative(), completionTokens: z.number().nonnegative(), totalTokens: z.number().nonnegative() }),
    finishReason: z.string().nullable(),
  }),
  recordedAt: z.string().min(1),
});
export type Recording = z.infer<typeof Recording>;

export interface RecordingStore {
  get(promptHash: string): Recording | undefined;
  put(recording: Recording): void;
}

/** Recordings held in memory, for tests. */
export function memoryStore(initial: readonly Recording[] = []): RecordingStore & { readonly all: () => Recording[] } {
  const held = new Map(initial.map((recording) => [recording.promptHash, recording]));
  return {
    get: (hash) => held.get(hash),
    put: (recording) => void held.set(recording.promptHash, Recording.parse(recording)),
    all: () => [...held.values()],
  };
}

/** Recordings as one JSON file each, named by the prompt's hash, in a folder such as fixtures/recordings. */
export function directoryStore(folder: string): RecordingStore {
  const file = (hash: string): string => join(folder, `${hash}.json`);
  return {
    get(hash) {
      if (!/^[0-9a-f]{64}$/.test(hash) || !existsSync(file(hash))) return undefined;
      return Recording.parse(JSON.parse(readFileSync(file(hash), "utf8")));
    },
    put(recording) {
      mkdirSync(folder, { recursive: true });
      writeFileSync(file(recording.promptHash), `${JSON.stringify(Recording.parse(recording), null, 2)}\n`);
    },
  };
}

/** A client that answers only from recordings, and says so when it has none: what tests and CI use. */
export function replayClient(store: RecordingStore): ModelClient {
  return {
    complete(request) {
      const hash = promptHash(request);
      const recording = store.get(hash);
      if (!recording) {
        return Promise.reject(new ModelError("no-recording", `no recording of this ${request.stage} call to ${request.model} (prompt ${hash.slice(0, 12)}); record it with npm run pipeline:live`));
      }
      return Promise.resolve(recording.response);
    },
  };
}

/** A client that passes each call on and records its response under the prompt's hash. */
export function recordingClient(inner: ModelClient, store: RecordingStore, now: () => string = () => new Date().toISOString()): ModelClient {
  return {
    async complete(request) {
      const response: ChatResponse = await inner.complete(request);
      store.put({ schemaVersion: "recording/1", stage: request.stage, model: request.model, promptHash: promptHash(request), response, recordedAt: now() });
      return response;
    },
  };
}

/**
 * A client that answers from a recording when there is one, and otherwise passes the call on and
 * records it: for `npm run pipeline:live`, so a run cut short resumes without repeating a call.
 */
export function resumingClient(inner: ModelClient, store: RecordingStore, now?: () => string): ModelClient {
  const recording = recordingClient(inner, store, now);
  return {
    complete(request) {
      const kept = store.get(promptHash(request));
      return kept ? Promise.resolve(kept.response) : recording.complete(request);
    },
  };
}
