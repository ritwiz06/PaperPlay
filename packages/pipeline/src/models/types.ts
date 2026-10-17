/**
 * What every model call is, whichever vendor answers it (ADR-0030): a request for one stage of the
 * pipeline, a response with its token usage, and a client that turns one into the other. The
 * gateway's client lives in apps/api, with the key; tests use recordings and fakes.
 */

/** The pipeline's stages that call a model, and the probe that tests a model's abilities. */
/** Every stage a model is chosen for. The second planner and second reviewer, from other vendors, may be left unchosen: a job then has one of each (ADR-0043, ADR-0044). */
export const STAGES = ["reader", "transcriber", "second-transcriber", "router", "planner", "second-planner", "explainer", "reviewer", "second-reviewer"] as const;
export type Stage = (typeof STAGES)[number];
export type CallStage = Stage | "probe";

export interface ChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

/** A JSON Schema the reply must match, for a model that honours structured output. */
export interface JsonSchemaFormat {
  readonly name: string;
  readonly schema: Readonly<Record<string, unknown>>;
}

export interface ChatRequest {
  readonly stage: CallStage;
  readonly model: string;
  readonly messages: readonly ChatMessage[];
  /** Asks the gateway to hold the reply to this schema; left out for a model that does not honour it. */
  readonly jsonSchema?: JsonSchemaFormat;
  readonly temperature?: number;
  readonly maxTokens?: number;
}

export interface Usage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export interface ChatResponse {
  /** The model that answered, as the gateway names it. */
  readonly model: string;
  readonly text: string;
  readonly usage: Usage;
  readonly finishReason: string | null;
}

export interface ModelClient {
  complete(request: ChatRequest): Promise<ChatResponse>;
}

export type ModelErrorKind = "timeout" | "http" | "network" | "budget" | "no-recording" | "invalid-response" | "refused";

/** Why a call failed, in words a job's trace can show. It never holds a key. */
export class ModelError extends Error {
  readonly kind: ModelErrorKind;
  readonly status: number | undefined;
  /** Whether trying again might succeed: a timeout, a rate limit, a server's error or the network. */
  readonly retryable: boolean;

  constructor(kind: ModelErrorKind, message: string, options: { readonly status?: number; readonly retryable?: boolean } = {}) {
    super(message);
    this.name = "ModelError";
    this.kind = kind;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}
