import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { criticalPath, outsideCalls, phasesOf, readJob, thinkingOf, type Call, type Job } from "../timing.ts";

const T0 = Date.parse("2026-10-20T16:00:00.000Z");
const call = (stage: string, startMinute: number, minutes: number, extra: Partial<Call> = {}): Call => ({
  stage,
  model: "m",
  ok: true,
  milliseconds: minutes * 60_000,
  end: T0 + (startMinute + minutes) * 60_000,
  promptTokens: 1000,
  completionTokens: 5000,
  answerCharacters: 4000,
  finishReason: "stop",
  recorded: true,
  ...extra,
});

describe("timing", () => {
  const folders: string[] = [];
  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
  });

  it("groups calls in flight together, each group as long as its slowest, and keeps replays out", () => {
    const calls = [call("planner", 1, 10), call("second-planner", 1, 4), call("explainer", 11, 5), call("explainer", 11, 3), call("reviewer", 20, 2), call("reader", 0, 0.001)];
    const phases = phasesOf(calls);
    expect(phases.map((phase) => [phase.binding, (phase.end - phase.start) / 60_000])).toEqual([
      ["planner", 10],
      ["explainer", 5],
      ["reviewer", 2],
    ]);
    const job: Job = { id: "j", source: "arxiv:1", start: T0, end: T0 + 24 * 60_000, outcome: "ready", repairs: 0, calls };
    expect(outsideCalls(job) / 60_000).toBeCloseTo(7);
    expect(criticalPath(job)).toBe("j (arxiv:1, ready, 24.0 min): planner ‖ second-planner 10.0 → explainer ×2 5.0 → reviewer 2.0; outside calls 7.0");
  });

  it("estimates thinking as the reply's tokens beyond its answer's, and none for a call it has no recording of", () => {
    expect(thinkingOf(call("planner", 0, 1))).toBe(4000);
    expect(thinkingOf(call("planner", 0, 1, { recorded: false }))).toBe(0);
  });

  it("reads a job from its events, trace and recordings, a recording another job made counting as a replay", () => {
    const folder = mkdtempSync(join(tmpdir(), "timing-"));
    folders.push(folder);
    const job = join(folder, "jobs", "abc");
    const recordings = join(folder, "recordings");
    mkdirSync(job, { recursive: true });
    mkdirSync(recordings);
    const at = (minute: number) => new Date(T0 + minute * 60_000).toISOString();
    writeFileSync(join(job, "events.jsonl"), [{ at: at(0), state: "received", message: "received pmc:PMC1" }, { at: at(3), state: "repairing", message: "" }, { at: at(9), state: "ready", message: "" }].map((event) => JSON.stringify(event)).join("\n"));
    const recording = (hash: string, end: string) => writeFileSync(join(recordings, `${hash}.json`), JSON.stringify({ recordedAt: end, response: { text: "x".repeat(400), finishReason: "stop", usage: { promptTokens: 10, completionTokens: 300 } } }));
    recording("live", at(8));
    recording("old", "2026-10-01T00:00:00.000Z");
    writeFileSync(join(job, "trace.json"), JSON.stringify({ budget: 1, entries: [{ stage: "reader", model: "m", promptHash: "old", outcome: "ok", tokens: 310, milliseconds: 5 }, { stage: "planner", model: "m", promptHash: "live", outcome: "ok", tokens: 310, milliseconds: 6 * 60_000 }] }));
    const read = readJob(job, recordings);
    expect(read?.source).toBe("pmc:PMC1");
    expect(read?.repairs).toBe(1);
    expect(read?.calls.map((entry) => [entry.stage, entry.milliseconds, thinkingOf(entry)])).toEqual([
      ["reader", 0, 200],
      ["planner", 6 * 60_000, 200],
    ]);
    expect(phasesOf(read?.calls ?? []).map((phase) => [new Date(phase.start).toISOString(), phase.binding])).toEqual([[at(2), "planner"]]);
  });
});
