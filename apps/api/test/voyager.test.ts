import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLANNER_MAX_TOKENS, REVIEWER_MAX_TOKENS, TRANSCRIBER_MAX_TOKENS } from "@paperplay/pipeline/stages";
import { loadModelConfig } from "../src/models/config.ts";
import { liveClient, liveRefusal, readBaseUrl, readKey } from "../src/models/live.ts";
import { voyagerClient, type VoyagerOptions } from "../src/models/voyager.ts";

// The Voyager gateway's client (ADR-0030), against a fake network: it never reaches the real one.
// Every key here is made up.

const KEY = `sk_${"Fake0".repeat(8)}`;
const ok = (body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });
const failure = (status: number, text: string, headers: Record<string, string> = {}) => new Response(text, { status, headers });
const completion = (text: string) => ({ model: "model-a", choices: [{ message: { content: text }, finish_reason: "stop" }], usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 } });

/** A client on a fake network that answers from a list, recording each call and each wait. */
function client(answers: readonly (Response | Error)[], options: Partial<VoyagerOptions> = {}) {
  const calls: { url: string; init: RequestInit; body: string }[] = [];
  const waits: number[] = [];
  let clock = 0;
  const fake = (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: typeof url === "string" ? url : url instanceof URL ? url.href : url.url, init: init ?? {}, body: typeof init?.body === "string" ? init.body : "" });
    const answer = answers[calls.length - 1];
    if (answer === undefined) return Promise.reject(new Error("the fake network has no more answers"));
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  };
  const made = voyagerClient({
    baseUrl: "https://gateway.test/v1/",
    apiKey: KEY,
    timeoutMs: 1000,
    retries: 2,
    backoffMs: 100,
    minIntervalMs: 0,
    fetch: fake,
    sleep: (milliseconds) => {
      waits.push(milliseconds);
      clock += milliseconds;
      return Promise.resolve();
    },
    now: () => clock,
    ...options,
  });
  return { made, calls, waits };
}

const request = { stage: "reader" as const, model: "model-a", messages: [{ role: "user" as const, content: "Name the groups." }], temperature: 0 };

describe("each stage's ceiling on a call's tokens (ADR-0051)", () => {
  it("is at or above the room each stage asks for, twice it where a reply that runs out is asked again, so every recording replays", () => {
    const { maxTokens } = loadModelConfig();
    expect(maxTokens.planner).toBeGreaterThanOrEqual(2 * PLANNER_MAX_TOKENS);
    expect(maxTokens.explainer).toBeGreaterThanOrEqual(2 * 16_000);
    expect(maxTokens["second-planner"]).toBeGreaterThanOrEqual(PLANNER_MAX_TOKENS);
    for (const stage of ["reviewer", "second-reviewer"] as const) expect(maxTokens[stage]).toBeGreaterThanOrEqual(REVIEWER_MAX_TOKENS);
    for (const stage of ["transcriber", "second-transcriber"] as const) expect(maxTokens[stage]).toBeGreaterThanOrEqual(TRANSCRIBER_MAX_TOKENS);
    expect(maxTokens.reader).toBeGreaterThanOrEqual(16_000);
    expect(maxTokens.router).toBeGreaterThanOrEqual(4000);
  });
});

describe("[R09] the Voyager gateway's client", () => {
  it("sends an OpenAI-style completion with the key only in its Authorization header, and reads the reply and its usage", async () => {
    const { made, calls } = client([ok(completion('{"groups":["S"]}'))]);
    const response = await made.complete({ ...request, jsonSchema: { name: "groups", schema: { type: "object" } }, maxTokens: 50 });
    expect(response).toEqual({ model: "model-a", text: '{"groups":["S"]}', usage: { promptTokens: 7, completionTokens: 3, totalTokens: 10 }, finishReason: "stop" });
    expect(calls[0]?.url).toBe("https://gateway.test/v1/chat/completions");
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(calls[0]?.body ?? "") as Record<string, unknown>;
    expect(body).toEqual({
      model: "model-a",
      messages: request.messages,
      temperature: 0,
      max_tokens: 50,
      response_format: { type: "json_schema", json_schema: { name: "groups", schema: { type: "object" }, strict: true } },
      stream: true,
      stream_options: { include_usage: true },
    });
    expect(calls[0]?.body).not.toContain(KEY);
  });

  it("joins a streamed reply's pieces, its finish and its usage, and reads an error sent mid-stream as a failure to retry", async () => {
    const events = (chunks: readonly unknown[]) => new Response(`${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`, { status: 200, headers: { "content-type": "text/event-stream" } });
    const streamed = events([
      { model: "model-a", choices: [{ delta: { role: "assistant" } }] },
      { choices: [{ delta: { content: '{"groups":' } }] },
      { choices: [{ delta: { reasoning_content: "thinking" } }] },
      { choices: [{ delta: { content: '["S","I"]}' }, finish_reason: "stop" }] },
      { choices: [], usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 } },
    ]);
    const { made, calls } = client([events([{ error: { message: "upstream went away" } }]), streamed]);
    expect(await made.complete(request)).toEqual({ model: "model-a", text: '{"groups":["S","I"]}', usage: { promptTokens: 12, completionTokens: 6, totalTokens: 18 }, finishReason: "stop" });
    expect(calls).toHaveLength(2);
  });

  it("retries a rate limit and a server's error with exponential backoff, honouring Retry-After", async () => {
    const { made, waits, calls } = client([failure(503, "busy"), failure(429, "slow down", { "retry-after": "3" }), ok(completion("done"))]);
    expect((await made.complete(request)).text).toBe("done");
    expect(calls).toHaveLength(3);
    expect(waits).toEqual([100, 3000]);
  });

  it("gives up after its retries, with the gateway's own words, never the key, even when the gateway echoes it", async () => {
    const { made } = client([failure(500, `bad key ${KEY}`), failure(500, "again"), failure(500, `still ${KEY}`)]);
    const error = await made.complete(request).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ kind: "http", status: 500, message: "the gateway answered 500: still [key]" });
    expect(String((error as Error).message)).not.toContain(KEY);
  });

  it("does not retry what trying again cannot fix, such as a bad request", async () => {
    const { made, calls } = client([failure(400, "unknown model"), ok(completion("never"))]);
    await expect(made.complete(request)).rejects.toMatchObject({ kind: "http", status: 400, retryable: false });
    expect(calls).toHaveLength(1);
  });

  it("times a call out, and retries a network failure", async () => {
    const hanging = (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    const timed = voyagerClient({ baseUrl: "https://gateway.test/v1", apiKey: KEY, timeoutMs: 5, retries: 0, backoffMs: 1, minIntervalMs: 0, fetch: hanging });
    await expect(timed.complete(request)).rejects.toMatchObject({ kind: "timeout", message: "the gateway did not answer within 5 ms" });
    const { made, calls } = client([new Error("connection reset"), ok(completion("back"))]);
    expect((await made.complete(request)).text).toBe("back");
    expect(calls).toHaveLength(2);
  });

  it("spaces the starts of its calls by the minimum interval", async () => {
    const { made, waits } = client([ok(completion("1")), ok(completion("2")), ok(completion("3"))], { minIntervalMs: 1000 });
    await Promise.all([made.complete(request), made.complete(request), made.complete(request)]);
    expect(waits).toEqual([1000, 1000]);
  });

  it("lists the gateway's models with what it says about each", async () => {
    const { made } = client([ok({ data: [{ id: "model-a", owned_by: "rc", mode: "chat", supports_response_schema: true }] })]);
    expect(await made.listModels()).toEqual([{ id: "model-a", ownedBy: "rc", details: { mode: "chat", supports_response_schema: true } }]);
  });
});

describe("[R09] the live client", () => {
  it("is refused under CI, under a test, and anywhere but npm run pipeline:live", () => {
    expect(liveRefusal({ CI: "true", npm_lifecycle_event: "pipeline:live" })).toMatch(/never run on CI/);
    expect(liveRefusal({ VITEST: "true", npm_lifecycle_event: "pipeline:live" })).toMatch(/never run under a test/);
    expect(liveRefusal({ npm_lifecycle_event: "test" })).toMatch(/only through npm run pipeline:live/);
    expect(liveRefusal({ npm_lifecycle_event: "pipeline:live" })).toBeNull();
    // Here, the test runner or CI refuses it, whichever the environment shows first.
    expect(() => liveClient()).toThrow(/never run (under a test|on CI)/);
  });

  it("reads the key from an env file, quoted or not, and names a missing one without a value", () => {
    const folder = mkdtempSync(join(tmpdir(), "paperplay-env-"));
    try {
      const file = join(folder, ".env");
      writeFileSync(file, `# the gateway\nVOYAGER_API_KEY="${KEY}"\n`);
      expect(readKey(file)).toBe(KEY);
      writeFileSync(file, "VOYAGER_API_KEY=\n");
      expect(() => readKey(file)).toThrow(/does not set VOYAGER_API_KEY/);
      expect(() => readKey(join(folder, "missing.env"))).toThrow(/must be in/);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("is configured from apps/api/models.json: the limits, a budget and a model per stage, and the gateway's address from apps/api/.env alone", () => {
    const config = loadModelConfig();
    expect("baseUrl" in config).toBe(false);
    const folder = mkdtempSync(join(tmpdir(), "paperplay-env-"));
    try {
      const env = join(folder, ".env");
      writeFileSync(env, "VOYAGER_BASE_URL=https://gateway.example/v1\n");
      expect(readBaseUrl(env)).toBe("https://gateway.example/v1");
      writeFileSync(env, "VOYAGER_API_KEY=x\n");
      expect(() => readBaseUrl(env)).toThrow(`${env} does not set VOYAGER_BASE_URL, the gateway's address`);
      writeFileSync(env, "VOYAGER_BASE_URL=not a url\n");
      expect(() => readBaseUrl(env)).toThrow(/is not a URL/);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
    expect(Object.keys(config.stages).sort()).toEqual(["explainer", "planner", "reader", "reviewer", "router", "second-planner", "second-reviewer", "second-transcriber", "transcriber"]);
    expect(config.jobTokenBudget).toBeGreaterThan(0);
  });

  it("refuses a model the portal marks \"Testing in progress\" in any stage, and uses none today", () => {
    const config = loadModelConfig();
    expect(config.excluded.models).toContain("qwen35-397b-a17b");
    for (const model of Object.values(config.stages)) expect(config.excluded.models).not.toContain(model);
    const folder = mkdtempSync(join(tmpdir(), "paperplay-config-"));
    try {
      const file = join(folder, "models.json");
      writeFileSync(file, JSON.stringify({ ...config, stages: { ...config.stages, router: "qwen35-397b-a17b" } }));
      expect(() => loadModelConfig(file)).toThrow(/Testing in progress/);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("refuses a reviewer that is the model that planned or wrote what it reviews, and has none today", () => {
    const config = loadModelConfig();
    const authors = [config.stages.planner, config.stages["second-planner"], config.stages.explainer];
    expect(authors).not.toContain(config.stages.reviewer);
    expect(authors).not.toContain(config.stages["second-reviewer"]);
    const folder = mkdtempSync(join(tmpdir(), "paperplay-config-"));
    try {
      const file = join(folder, "models.json");
      writeFileSync(file, JSON.stringify({ ...config, stages: { ...config.stages, "second-reviewer": config.stages.explainer } }));
      expect(() => loadModelConfig(file)).toThrow(/the second-reviewer, .*, is also the .*explainer: a reviewer may never be the model that planned or wrote what it reviews/);
      writeFileSync(file, JSON.stringify({ ...config, stages: { ...config.stages, reviewer: config.stages["second-planner"] } }));
      expect(() => loadModelConfig(file)).toThrow(/the reviewer, .*, is also the second-planner/);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe("[R13] thinking and deadlines (ADR-0053)", () => {
  it("asks a call set not to think with the chat templates' switch, and asks a model as before once its gateway refuses it", async () => {
    const { made, calls } = client([failure(400, "unknown field chat_template_kwargs"), ok(completion("{}")), ok(completion("{}"))]);
    await made.complete({ ...request, thinking: false });
    expect(JSON.parse(calls[0]?.body ?? "{}")).toMatchObject({ chat_template_kwargs: { enable_thinking: false, thinking: false } });
    expect(JSON.parse(calls[1]?.body ?? "{}")).not.toHaveProperty("chat_template_kwargs");
    await made.complete({ ...request, thinking: false });
    expect(JSON.parse(calls[2]?.body ?? "{}")).not.toHaveProperty("chat_template_kwargs");
    expect(calls).toHaveLength(3);
  });

  it("ends a call when its job's deadline passes, and never retries it", async () => {
    const deadline = new AbortController();
    let attempts = 0;
    const { made } = client([], {
      fetch: (_url: string | URL | Request, init?: RequestInit) => {
        attempts++;
        return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
      },
    });
    const call = made.complete({ ...request, signal: deadline.signal });
    deadline.abort();
    await expect(call).rejects.toMatchObject({ kind: "timeout", retryable: false });
    expect(attempts).toBe(1);
  });

  it("keeps thinking for the transcriptions and the reviewers alone, and gives a job twelve minutes", () => {
    const config = loadModelConfig();
    expect(Object.entries(config.thinking).filter(([, thinks]) => thinks).map(([stage]) => stage).sort()).toEqual(["reviewer", "second-reviewer", "second-transcriber", "transcriber"]);
    expect(config.deadline.jobMs).toBe(720_000);
    for (const [stage, ms] of Object.entries(config.deadline.stageMs)) expect(ms, stage).toBeLessThanOrEqual(config.deadline.jobMs);
    expect(config.jobTokenBudget).toBe(600_000);
  });
});
