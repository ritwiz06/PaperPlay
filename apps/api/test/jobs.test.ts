import { describe, expect, it } from "vitest";
import type { JobRunner } from "../src/jobs.ts";
import { parseSource } from "../src/jobs.ts";
import { BODY_LIMIT, buildServer } from "../src/server.ts";

// The API's jobs (R11): real states streamed as server-sent events, in order and from where a
// client left off; artifacts and the world as JSON, the world only once the job is ready; bodies
// capped. The runner here is a script, not the pipeline.

/** A runner that walks a job through the given states, keeping a world when it reaches ready. */
const walk =
  (states: readonly ("parsing" | "planning" | "building" | "running" | "checking" | "ready" | "failed")[], pause = 0): JobRunner =>
  async (_source, sink, signal) => {
    for (const state of states) {
      if (pause) await new Promise((resolve) => setTimeout(resolve, pause));
      if (signal.aborted) {
        sink.emit("cancelled", "stopped", "the job was cancelled");
        return { state: "cancelled", message: "cancelled", world: null };
      }
      sink.emit(state, state, `now ${state}`);
    }
    if (states.at(-1) === "ready") sink.artifact("world", { title: "A world" });
    return { state: states.at(-1) ?? "failed", message: "done", world: null };
  };

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const eventsOf = (body: string) =>
  body
    .split("\n\n")
    .filter((block) => block.includes("data: "))
    .map((block) => ({ id: Number(/^id: (\d+)/m.exec(block)?.[1]), data: JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? "{}") as { state: string; seq: number } }));

describe("[R11] the API's jobs", () => {
  it("names only arXiv ids with a version, and PMCIDs, as sources", () => {
    expect(parseSource("arxiv:2506.19869v1")).toEqual({ kind: "arxiv", id: "2506.19869v1" });
    expect(parseSource("pmc:pmc12334037")).toEqual({ kind: "pmc", id: "PMC12334037" });
    expect(parseSource("arxiv:2506.19869")).toBeNull();
    expect(parseSource("https://example.com/paper.pdf")).toBeNull();
  });

  it("refuses a request it cannot read, and a body over its limit", async () => {
    const app = buildServer({ runner: walk(["parsing"]), dataFolder: null });
    try {
      expect((await app.inject({ method: "POST", url: "/jobs", payload: { source: "a paper" } })).statusCode).toBe(400);
      expect((await app.inject({ method: "POST", url: "/jobs", payload: { source: "arxiv:2506.19869v1", extra: 1 } })).statusCode).toBe(400);
      expect((await app.inject({ method: "POST", url: "/jobs", payload: { source: "x".repeat(BODY_LIMIT) } })).statusCode).toBe(413);
    } finally {
      await app.close();
    }
  });

  it("takes a PDF as itself, by its content type, naming the job after its file, and refuses a body that is not one", async () => {
    const seen: unknown[] = [];
    const runner: JobRunner = (source, sink) => {
      seen.push(source);
      sink.emit("parsing", "ingest", "reading the PDF");
      return Promise.resolve({ state: "failed", message: "done", world: null });
    };
    const app = buildServer({ runner, dataFolder: null });
    try {
      const pdf = new TextEncoder().encode("%PDF-1.5\n% a file that begins as a PDF does\n");
      const started = await app.inject({ method: "POST", url: "/jobs/pdf?name=hcv paper.pdf", headers: { "content-type": "application/pdf" }, payload: Buffer.from(pdf) });
      expect(started.statusCode).toBe(202);
      await settle();
      expect(seen).toMatchObject([{ kind: "pdf", name: "hcv paper.pdf" }]);
      expect((await app.inject({ method: "GET", url: `/jobs/${started.json<{ jobId: string }>().jobId}` })).json<{ source: string }>().source).toBe("pdf:hcv paper.pdf");
      expect((await app.inject({ method: "POST", url: "/jobs/pdf", headers: { "content-type": "application/pdf" }, payload: Buffer.from("<html>no</html>") })).statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it("streams a job's real states in order, each with its sequence number, and ends the stream when the job ends", async () => {
    const app = buildServer({ runner: walk(["parsing", "planning", "building", "running", "checking", "ready"]), dataFolder: null });
    try {
      const started = await app.inject({ method: "POST", url: "/jobs", payload: { source: "pmc:PMC12334037" } });
      expect(started.statusCode).toBe(202);
      const { jobId } = started.json<{ jobId: string }>();
      await settle();
      const stream = await app.inject({ method: "GET", url: `/jobs/${jobId}/events` });
      expect(stream.headers["content-type"]).toMatch(/^text\/event-stream/);
      const events = eventsOf(stream.body);
      expect(events.map((event) => event.data.state)).toEqual(["parsing", "planning", "building", "running", "checking", "ready"]);
      expect(events.map((event) => event.id)).toEqual([1, 2, 3, 4, 5, 6]);
      // A client that reconnects after event 4 is sent only what it missed.
      const resumed = await app.inject({ method: "GET", url: `/jobs/${jobId}/events`, headers: { "last-event-id": "4" } });
      expect(eventsOf(resumed.body).map((event) => event.data.state)).toEqual(["checking", "ready"]);
      expect((await app.inject({ method: "GET", url: `/jobs/${jobId}/world` })).json()).toEqual({ title: "A world" });
    } finally {
      await app.close();
    }
  });

  it("refuses the world of a job that is not ready, and cancels a running job", async () => {
    const app = buildServer({ runner: walk(["parsing", "planning", "building", "running"], 30), dataFolder: null });
    try {
      const { jobId } = (await app.inject({ method: "POST", url: "/jobs", payload: { source: "arxiv:2506.19869v1" } })).json<{ jobId: string }>();
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect((await app.inject({ method: "GET", url: `/jobs/${jobId}/world` })).statusCode).toBe(409);
      expect((await app.inject({ method: "DELETE", url: `/jobs/${jobId}` })).json()).toEqual({ cancelling: true });
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect((await app.inject({ method: "GET", url: `/jobs/${jobId}` })).json<{ state: string }>().state).toBe("cancelled");
      expect((await app.inject({ method: "GET", url: "/jobs/nope" })).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
