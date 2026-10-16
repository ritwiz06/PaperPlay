import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SourceRegister, SourceText, type JobState } from "@paperplay/contracts";
import { runJob, type JobSink } from "@paperplay/pipeline/controller";
import { directoryStore, replayClient } from "@paperplay/pipeline/models";
import { describe, expect, it } from "vitest";
import { loadModelConfig } from "../src/models/config.ts";
import { workedExample } from "../src/runner.ts";

// The first generated world (ADR-0035), fixtures/worldspecs/generated/pmc-PMC12334037.json, made
// by a live job through /create. Replayed here from that job's recorded calls, with the paper as
// ingest left it and no network: the same states, both repairs included, and the same world, but
// for when the source was fetched.

const root = join(import.meta.dirname, "..", "..", "..");
const read = (path: string): unknown => JSON.parse(readFileSync(join(root, path), "utf8"));
const SOURCE_ID = "pmc-PMC12334037";

describe("[R10] [R11] the first generated world", () => {
  it("replays from its recordings through every state to ready, two repairs on the way, to the world that was kept", async () => {
    const text = SourceText.parse(read(`fixtures/sources/${SOURCE_ID}.json`));
    const register = SourceRegister.parse(read("fixtures/sources/register.json")).sources.find((entry) => entry.sourceId === SOURCE_ID);
    if (!register) throw new Error(`${SOURCE_ID} is not in the source register`);
    const config = loadModelConfig();
    const states: JobState[] = [];
    const artifacts = new Map<string, unknown>();
    const sink: JobSink = { emit: (state) => void (states.at(-1) === state ? undefined : states.push(state)), artifact: (name, value) => void artifacts.set(name, value) };
    const outcome = await runJob(
      { source: { kind: "ingested", text, register }, client: replayClient(directoryStore(join(root, "fixtures", "recordings"))), config: { stages: config.stages, structuredOutput: config.structuredOutput }, fetch: () => Promise.reject(new Error("no network in a replay")), example: workedExample() },
      sink,
    );
    expect(outcome.state).toBe("ready");
    expect(states).toEqual(["received", "parsing", "planning", "building", "running", "repairing", "building", "running", "repairing", "building", "running", "checking", "ready"]);
    const kept = read(`fixtures/worldspecs/generated/${SOURCE_ID}.json`) as { source: Record<string, unknown> };
    const made = artifacts.get("world") as { source: Record<string, unknown> };
    const withoutFetchTime = (world: { source: Record<string, unknown> }) => ({ ...world, source: { ...world.source, accessedAt: null } });
    expect(withoutFetchTime(made)).toEqual(withoutFetchTime(kept));
  }, 300_000);
});
