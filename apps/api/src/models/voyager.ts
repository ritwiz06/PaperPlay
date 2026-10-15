/**
 * ASU Research Computing's Voyager gateway, as a ModelClient (ADR-0030): OpenAI-compatible chat
 * completions over plain fetch, with a timeout on every call, retries with exponential backoff on
 * a rate limit, a server's error, a timeout or the network, and a minimum interval between calls.
 * The key goes only into the Authorization header; no message, error or trace ever holds it.
 */
import { ModelError, type ChatRequest, type ChatResponse, type ModelClient } from "@paperplay/pipeline/models";

export interface VoyagerOptions {
  readonly baseUrl: string;
  readonly apiKey: string;
  /** Each call's limit, in milliseconds. */
  readonly timeoutMs: number;
  /** How many times a failed call is tried again, when trying again might help. */
  readonly retries: number;
  /** The first wait before a retry, doubled each time, unless the gateway says how long. */
  readonly backoffMs: number;
  /** The least time between the starts of two calls, as a rate limit. */
  readonly minIntervalMs: number;
  /** The network. Required, so that only the live command passes the real one. */
  readonly fetch: typeof fetch;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly now?: () => number;
}

/** A model the gateway offers, with what it says about it. */
export interface GatewayModel {
  readonly id: string;
  readonly ownedBy: string | null;
  /** Every other field the gateway returns for it, such as a status, kept as given. */
  readonly details: Readonly<Record<string, unknown>>;
}

export interface VoyagerClient extends ModelClient {
  listModels(): Promise<GatewayModel[]>;
}

const RETRYABLE_STATUS = (status: number): boolean => status === 408 || status === 429 || status >= 500;

interface CompletionBody {
  readonly model?: string;
  readonly choices?: readonly { readonly message?: { readonly content?: string | null }; readonly finish_reason?: string | null }[];
  readonly usage?: { readonly prompt_tokens?: number; readonly completion_tokens?: number; readonly total_tokens?: number };
}

export function voyagerClient(options: VoyagerOptions): VoyagerClient {
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const now = options.now ?? (() => Date.now());
  const base = options.baseUrl.replace(/\/+$/, "");
  let nextStart = 0;
  let queue: Promise<void> = Promise.resolve();

  /** Waits for the call's turn: one start every minIntervalMs, in order. */
  const turn = (): Promise<void> => {
    const mine = queue.then(async () => {
      const wait = nextStart - now();
      if (wait > 0) await sleep(wait);
      nextStart = now() + options.minIntervalMs;
    });
    queue = mine.catch(() => undefined);
    return mine;
  };

  /** One HTTP call with a timeout; the gateway's own error text is kept, trimmed, and never holds the key. */
  async function send(path: string, init: { readonly method: "GET" | "POST"; readonly body?: string; readonly raw?: boolean }): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    let response: Response;
    try {
      response = await options.fetch(`${base}${path}`, {
        method: init.method,
        headers: { authorization: `Bearer ${options.apiKey}`, "content-type": "application/json", accept: init.raw ? "text/event-stream, application/json" : "application/json" },
        ...(init.body === undefined ? {} : { body: init.body }),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw new ModelError("timeout", `the gateway did not answer within ${options.timeoutMs} ms`, { retryable: true });
      // The cause's code, such as ECONNRESET, says more than fetch's own "fetch failed".
      const code = (error as { cause?: { code?: unknown }; code?: unknown }).cause?.code ?? (error as { code?: unknown }).code;
      throw new ModelError("network", `the gateway could not be reached: ${error instanceof Error ? error.message : String(error)}${typeof code === "string" ? ` (${code})` : ""}`, { retryable: true });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      const text = (await response.text().catch(() => "")).replaceAll(options.apiKey, "[key]").slice(0, 400);
      const error = new ModelError("http", `the gateway answered ${response.status}${text ? `: ${text}` : ""}`, { status: response.status, retryable: RETRYABLE_STATUS(response.status) });
      (error as ModelError & { retryAfterMs?: number }).retryAfterMs = retryAfter(response.headers.get("retry-after"));
      throw error;
    }
    return init.raw ? response.text() : response.json();
  }

  /** Tries a call, and again after a backoff while it may still succeed. */
  async function withRetries<T>(call: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      await turn();
      try {
        return await call();
      } catch (error) {
        if (!(error instanceof ModelError) || !error.retryable || attempt >= options.retries) throw error;
        const told = (error as ModelError & { retryAfterMs?: number }).retryAfterMs;
        await sleep(told ?? options.backoffMs * 2 ** attempt);
      }
    }
  }

  return {
    async complete(request: ChatRequest): Promise<ChatResponse> {
      const body = JSON.stringify({
        model: request.model,
        messages: request.messages,
        ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        ...(request.maxTokens === undefined ? {} : { max_tokens: request.maxTokens }),
        ...(request.jsonSchema ? { response_format: { type: "json_schema", json_schema: { name: request.jsonSchema.name, schema: request.jsonSchema.schema, strict: true } } } : {}),
        // Streamed, so bytes keep flowing while a slow model thinks: the gateway's proxy ends a
        // reply that sends nothing for too long (a 524). The reply is read whole, then joined.
        stream: true,
        stream_options: { include_usage: true },
      });
      const reply = await withRetries(async () => completionOf((await send("/chat/completions", { method: "POST", body, raw: true })) as string, request));
      const choice = reply.choices?.[0];
      const text = choice?.message?.content;
      if (typeof text !== "string") throw new ModelError("invalid-response", `${request.model} returned no message for the ${request.stage} call`);
      const usage = reply.usage ?? {};
      const promptTokens = usage.prompt_tokens ?? 0;
      const completionTokens = usage.completion_tokens ?? 0;
      return {
        model: reply.model ?? request.model,
        text,
        usage: { promptTokens, completionTokens, totalTokens: usage.total_tokens ?? promptTokens + completionTokens },
        finishReason: choice?.finish_reason ?? null,
      };
    },
    async listModels(): Promise<GatewayModel[]> {
      const reply = (await withRetries(() => send("/models", { method: "GET" }))) as { readonly data?: readonly Record<string, unknown>[] };
      return (reply.data ?? []).map(({ id, owned_by, ...details }) => ({ id: String(id), ownedBy: typeof owned_by === "string" ? owned_by : null, details }));
    },
  };
}

interface StreamChunk {
  readonly model?: string;
  readonly choices?: readonly { readonly delta?: { readonly content?: string | null }; readonly finish_reason?: string | null }[];
  readonly usage?: CompletionBody["usage"] | null;
  readonly error?: { readonly message?: string } | string;
}

/**
 * A streamed reply, server-sent events of chunks, joined into one completion: the content's pieces
 * in order, the last finish reason, the usage the final chunk reports. A gateway that answers with
 * one JSON body instead is read as that body.
 */
export function completionOf(text: string, request: ChatRequest): CompletionBody {
  const events = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter((data) => data.length > 0 && data !== "[DONE]");
  if (events.length === 0) {
    try {
      return JSON.parse(text) as CompletionBody;
    } catch {
      throw new ModelError("invalid-response", `${request.model} sent a reply that is neither events nor JSON for the ${request.stage} call`);
    }
  }
  let content = "";
  let model: string | undefined;
  let finish: string | null = null;
  let usage: CompletionBody["usage"];
  let sawContent = false;
  for (const data of events) {
    let chunk: StreamChunk;
    try {
      chunk = JSON.parse(data) as StreamChunk;
    } catch {
      throw new ModelError("invalid-response", `${request.model} sent an event that is not JSON for the ${request.stage} call`);
    }
    if (chunk.error) throw new ModelError("http", `the gateway's stream ended in an error: ${typeof chunk.error === "string" ? chunk.error : (chunk.error.message ?? "unnamed")}`.slice(0, 400), { retryable: true });
    model ??= chunk.model;
    const choice = chunk.choices?.[0];
    const piece = choice?.delta?.content;
    if (typeof piece === "string") {
      content += piece;
      sawContent = true;
    }
    if (choice?.finish_reason) finish = choice.finish_reason;
    if (chunk.usage) usage = chunk.usage;
  }
  return { ...(model ? { model } : {}), choices: [{ message: { content: sawContent ? content : null }, finish_reason: finish }], ...(usage ? { usage } : {}) };
}

/** A Retry-After header in milliseconds: seconds, or an HTTP date. */
function retryAfter(header: string | null): number | undefined {
  if (header === null) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}
