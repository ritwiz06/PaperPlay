import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SourceRegister, SourceText, type JobState } from "@paperplay/contracts";
import { runJob, type JobConfig, type JobSink } from "@paperplay/pipeline/controller";
import { directoryStore, replayClient } from "@paperplay/pipeline/models";
import { describe, expect, it } from "vitest";
import { workedExample } from "../src/runner.ts";

// Every recorded live job in fixtures/jobs/ that still replays (ADR-0035, ADR-0037): run again from
// its recorded calls, with the paper as ingest left it and no network, it reaches the same outcome
// through the same states, and a world it made is the world kept, but for when the source was
// fetched. A job made under rules that have since changed is kept as a record and not replayed.

const root = join(import.meta.dirname, "..", "..", "..");
const read = (path: string): unknown => JSON.parse(readFileSync(join(root, path), "utf8"));

interface JobRecord extends JobConfig {
  readonly sourceId: string;
  readonly replays?: boolean;
  readonly outcome?: JobState;
  readonly states?: readonly JobState[];
  readonly world?: string;
  readonly message?: string;
  readonly recordedOn?: string;
  readonly note?: string;
}

const all = readdirSync(join(root, "fixtures", "jobs"))
  .filter((file) => file.endsWith(".json"))
  .map((file) => ({ file, record: read(`fixtures/jobs/${file}`) as JobRecord }));
const records = all.filter(({ record }) => record.replays === true);

describe("[R10] [R11] the recorded live jobs", () => {
  // A rule that changes what a job does ends the replay of every job recorded before it, until a
  // job is run again under it (ADR-0044's second amendment): no record stops replaying silently.
  it("are kept, each one replaying or saying in its note why it no longer does, and when none replays, one names the rule that ended it", () => {
    expect(all.length).toBeGreaterThan(0);
    for (const { file, record } of all.filter(({ record }) => record.replays !== true)) expect(record.note?.length ?? 0, file).toBeGreaterThan(0);
    if (records.length === 0) expect(all.some(({ record }) => /Kept as a record since \d{4}-\d{2}-\d{2}: .*rule/.test(record.note ?? ""))).toBe(true);
  });

  for (const { file, record } of records) {
    it(`${file}: replays from its recordings to ${record.outcome ?? "?"}, through the states it took`, async () => {
      const text = SourceText.parse(read(`fixtures/sources/${record.sourceId}.json`));
      const register = SourceRegister.parse(read("fixtures/sources/register.json")).sources.find((entry) => entry.sourceId === record.sourceId);
      if (!register) throw new Error(`${record.sourceId} is not in the source register`);
      const states: JobState[] = [];
      const artifacts = new Map<string, unknown>();
      const sink: JobSink = { emit: (state) => void (states.at(-1) === state ? undefined : states.push(state)), artifact: (name, value) => void artifacts.set(name, value) };
      const outcome = await runJob(
        { source: { kind: "ingested", text, register }, client: replayClient(directoryStore(join(root, "fixtures", "recordings"))), config: { stages: record.stages, structuredOutput: record.structuredOutput }, fetch: () => Promise.reject(new Error("no network in a replay")), example: workedExample() },
        sink,
      );
      expect(outcome.state).toBe(record.outcome);
      if (record.states) expect(states).toEqual(record.states);
      // A job's events keep a message's first 600 characters, so a record holds what its events showed.
      if (record.message) expect(outcome.message.slice(0, 600)).toBe(record.message);
      if (record.world) {
        const withoutFetchTime = (world: { source: Record<string, unknown> }) => ({ ...world, source: { ...world.source, accessedAt: null } });
        expect(withoutFetchTime(artifacts.get("world") as { source: Record<string, unknown> })).toEqual(withoutFetchTime(read(record.world) as { source: Record<string, unknown> }));
      }
    }, 300_000);
  }
});
