/**
 * A job's token budget and its trace (ADR-0030): every call a job makes, with its stage, model,
 * prompt hash, tokens and outcome. Usage on the gateway is free, but a runaway job still stops:
 * once the job has spent its budget, the next call is refused before it is made.
 */
import { promptHash } from "./recording.ts";
import { ModelError, type CallStage, type ChatResponse, type ModelClient } from "./types.ts";

export interface TraceEntry {
  readonly stage: CallStage;
  readonly model: string;
  readonly promptHash: string;
  readonly outcome: "ok" | "error";
  readonly tokens: number;
  /** Why it failed, in words; never a key. */
  readonly error?: string;
  readonly milliseconds: number;
}

export interface JobTrace {
  /** The job's token budget. */
  readonly budget: number;
  readonly entries: TraceEntry[];
}

export const tokensSpent = (trace: JobTrace): number => trace.entries.reduce((sum, entry) => sum + entry.tokens, 0);

export const newTrace = (budget: number): JobTrace => {
  if (!(Number.isInteger(budget) && budget > 0)) throw new RangeError(`a job's token budget is a whole number above 0, not ${budget}`);
  return { budget, entries: [] };
};

/** Passes each call on while the job has budget left, and writes every call, ok or not, to the trace. */
export function budgetedClient(inner: ModelClient, trace: JobTrace, clock: () => number = () => performance.now()): ModelClient {
  return {
    async complete(request) {
      const hash = promptHash(request);
      const spent = tokensSpent(trace);
      if (spent >= trace.budget) {
        const message = `the job has spent ${spent} of its ${trace.budget} tokens, so the ${request.stage} call is not made`;
        trace.entries.push({ stage: request.stage, model: request.model, promptHash: hash, outcome: "error", tokens: 0, error: message, milliseconds: 0 });
        throw new ModelError("budget", message);
      }
      const started = clock();
      try {
        const response: ChatResponse = await inner.complete(request);
        trace.entries.push({ stage: request.stage, model: request.model, promptHash: hash, outcome: "ok", tokens: response.usage.totalTokens, milliseconds: Math.round(clock() - started) });
        return response;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        trace.entries.push({ stage: request.stage, model: request.model, promptHash: hash, outcome: "error", tokens: 0, error: message, milliseconds: Math.round(clock() - started) });
        throw error;
      }
    },
  };
}
