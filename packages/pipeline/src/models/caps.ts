/**
 * Each stage's ceiling on a call's tokens, thinking and reply together (ADR-0051): a call asking
 * for more room than its stage allows is given its stage's ceiling, a retry with twice the room
 * among them. The ceilings live in apps/api/models.json; at or above the room every stage asks for
 * today, they change no prompt, so every recording replays as it was.
 */
import type { ModelClient } from "./types.ts";

/**
 * Each stage's thinking (R13, ADR-0053): a stage set to false is asked not to think, the field
 * then part of its prompt's hash, so a recording made while the model thought is never replayed
 * for it. A stage left thinking sends nothing new, and its recordings replay as they were.
 */
export function thinkingClient(client: ModelClient, thinking: Readonly<Partial<Record<string, boolean>>>): ModelClient {
  return {
    complete(request) {
      return client.complete(thinking[request.stage] === false ? { ...request, thinking: false } : request);
    },
  };
}

export function cappedClient(client: ModelClient, ceilings: Readonly<Partial<Record<string, number>>>): ModelClient {
  return {
    complete(request) {
      const ceiling = ceilings[request.stage];
      return client.complete(ceiling !== undefined && request.maxTokens !== undefined && request.maxTokens > ceiling ? { ...request, maxTokens: ceiling } : request);
    },
  };
}
