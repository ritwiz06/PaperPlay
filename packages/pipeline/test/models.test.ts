import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  budgetedClient,
  completeStructured,
  extractJson,
  memoryStore,
  ModelError,
  newTrace,
  promptHash,
  recordingClient,
  replayClient,
  tokensSpent,
  type ChatRequest,
  type ChatResponse,
  type ModelClient,
} from "../src/models/index.ts";

// The pipeline's model calls (ADR-0030): recorded by the prompt's hash and replayed, held to a
// job's token budget with every call in its trace, and validated, with one retry, as data.

const request = (content = "Name the groups.", model = "model-a"): ChatRequest => ({ stage: "reader", model, messages: [{ role: "user", content }], temperature: 0 });
const reply = (text: string, tokens = 10): ChatResponse => ({ model: "model-a", text, usage: { promptTokens: tokens / 2, completionTokens: tokens / 2, totalTokens: tokens }, finishReason: "stop" });

/** A client that answers from a list, in order, and counts its calls. */
function scripted(texts: readonly string[], tokens = 10): ModelClient & { calls: ChatRequest[] } {
  const calls: ChatRequest[] = [];
  return {
    calls,
    complete(next) {
      calls.push(next);
      const text = texts[calls.length - 1];
      return text === undefined ? Promise.reject(new Error("no more replies")) : Promise.resolve(reply(text, tokens));
    },
  };
}

describe("a prompt's hash", () => {
  it("is the same for equal requests however their keys are ordered, and differs when anything shaping the reply does", () => {
    const a = request();
    const reordered = { temperature: 0, messages: [{ content: "Name the groups.", role: "user" as const }], model: "model-a", stage: "planner" as const };
    expect(promptHash(reordered)).toBe(promptHash(a));
    expect(promptHash(request("Name the rates."))).not.toBe(promptHash(a));
    expect(promptHash(request(undefined, "model-b"))).not.toBe(promptHash(a));
    expect(promptHash({ ...a, temperature: 0.5 })).not.toBe(promptHash(a));
    expect(promptHash(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("recording and replay", () => {
  it("records each response under its prompt's hash, without the prompt, and replays it exactly", async () => {
    const store = memoryStore();
    const live = scripted(['{"a":1}']);
    const response = await recordingClient(live, store, () => "2026-10-14T00:00:00.000Z").complete(request("A paper's whole text."));
    const [recording] = store.all();
    expect(recording?.promptHash).toBe(promptHash(request("A paper's whole text.")));
    expect(JSON.stringify(recording)).not.toContain("A paper's whole text.");
    expect(await replayClient(store).complete(request("A paper's whole text."))).toEqual(response);
  });

  it("refuses a call it has no recording of, saying how to make one", async () => {
    await expect(replayClient(memoryStore()).complete(request())).rejects.toMatchObject({ kind: "no-recording", message: expect.stringMatching(/npm run pipeline:live/) as unknown });
  });
});

describe("a job's token budget", () => {
  it("traces every call, and refuses the next once the budget is spent, before making it", async () => {
    const trace = newTrace(25);
    const inner = scripted(["one", "two", "three"], 10);
    const client = budgetedClient(inner, trace, () => 0);
    await client.complete(request());
    await client.complete(request());
    await client.complete(request());
    expect(tokensSpent(trace)).toBe(30);
    await expect(client.complete(request())).rejects.toMatchObject({ kind: "budget" });
    expect(inner.calls).toHaveLength(3);
    expect(trace.entries.map((entry) => entry.outcome)).toEqual(["ok", "ok", "ok", "error"]);
    expect(trace.entries[3]?.error).toBe("the job has spent 30 of its 25 tokens, so the reader call is not made");
  });

  it("traces a failed call too, with its reason", async () => {
    const trace = newTrace(100);
    const failing: ModelClient = { complete: () => Promise.reject(new ModelError("http", "the gateway answered 503", { status: 503, retryable: true })) };
    await expect(budgetedClient(failing, trace, () => 0).complete(request())).rejects.toThrow("503");
    expect(trace.entries).toMatchObject([{ outcome: "error", tokens: 0, error: "the gateway answered 503" }]);
  });
});

describe("structured replies", () => {
  const Groups = z.strictObject({ groups: z.array(z.string()).min(1) });

  it("finds the JSON in a reply, bare or fenced", () => {
    expect(extractJson('{"groups":["S"]}')).toEqual({ groups: ["S"] });
    expect(extractJson('Here it is:\n```json\n{"groups":["S","I"]}\n```')).toEqual({ groups: ["S", "I"] });
    expect(() => extractJson("no JSON here")).toThrow(SyntaxError);
  });

  it("sends the schema to a model that honours it, and validates the reply", async () => {
    const client = scripted(['{"groups":["S","I","R"]}']);
    const result = await completeStructured(client, request(), Groups, { name: "groups", structuredOutput: true });
    expect(result).toEqual({ value: { groups: ["S", "I", "R"] }, attempts: 1 });
    expect(client.calls[0]?.jsonSchema?.name).toBe("groups");
  });

  it("asks a model that does not for plain JSON, and retries once with the error", async () => {
    const client = scripted(['{"groups":[]}', '{"groups":["S","I","R"]}']);
    const result = await completeStructured(client, request(), Groups, { name: "groups", structuredOutput: false });
    expect(result.attempts).toBe(2);
    expect(client.calls[0]?.jsonSchema).toBeUndefined();
    expect(client.calls[0]?.messages.at(-1)?.content).toMatch(/^Reply with one JSON object and nothing else/);
    expect(client.calls[1]?.messages.at(-1)?.content).toMatch(/That reply cannot be used\. It does not match the schema:\n- groups:/);
  });

  it("fails after a second invalid reply, saying why", async () => {
    await expect(completeStructured(scripted(["no JSON", "still none"]), request(), Groups, { name: "groups", structuredOutput: false })).rejects.toMatchObject({
      kind: "invalid-response",
      message: expect.stringMatching(/invalid twice\. It is not valid JSON/) as unknown,
    });
  });
});
