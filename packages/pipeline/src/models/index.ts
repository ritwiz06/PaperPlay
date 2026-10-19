/**
 * @paperplay/pipeline/models: what a model call is, and the clients every stage calls through
 * (ADR-0030): recording and replay, a job's token budget and trace, and structured replies. No
 * vendor's client is here; the gateway's lives in apps/api, with its key. Node only, so the web
 * app, which imports the builder from the package's root, never reaches it.
 */
export { budgetedClient, newTrace, tokensSpent, type JobTrace, type TraceEntry } from "./budget.ts";
export { directoryStore, memoryStore, promptHash, Recording, recordingClient, replayClient, resumingClient, type RecordingStore } from "./recording.ts";
export { completeStructured, extractJson, jsonSchemaOf, type StructuredResult } from "./structured.ts";
export { ModelError, STAGES, type CallStage, type ChatMessage, type ChatRequest, type ChatResponse, type JsonSchemaFormat, type ModelClient, type ModelErrorKind, type Stage, type Usage } from "./types.ts";
export { cappedClient } from "./caps.ts";
