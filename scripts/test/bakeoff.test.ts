import { readFileSync } from "node:fs";
import { join } from "node:path";
import { directoryStore, replayClient } from "@paperplay/pipeline/models";
import { describe, expect, it } from "vitest";
import { loadModelConfig } from "../../apps/api/src/models/config.ts";
import { runDesignBakeoff, type DesignResults } from "../bakeoff/design.ts";
import { rankReaders, toModelsMarkdown, transcriberPair } from "../bakeoff/report.ts";
import { agreement, runBakeoff, type BakeoffResults } from "../bakeoff/run.ts";
import { CODE, sweep } from "../cache/sweeps.ts";

// The bake-off (eval/models.md) replayed from its recordings, with no gateway: every recorded
// reply scores as it did, so the table and the choices it proposes are reproducible. A call that
// failed live has no recording, so here it fails too; only its reason's words differ. Each replay is
// cached by the hash of its inputs, the recordings among them, checked before the committed results
// are trusted (ADR-0051).
const INPUTS = [...CODE, "scripts/bakeoff", "apps/api/src/models", "apps/api/models.json", "fixtures/recordings", "fixtures/papers", "fixtures/sources", "eval/bakeoff", "eval/models.md"];

const root = join(import.meta.dirname, "..", "..");
const recorded = JSON.parse(readFileSync(join(root, "eval", "bakeoff", "results.json"), "utf8")) as BakeoffResults;
const designed = JSON.parse(readFileSync(join(root, "eval", "bakeoff", "design.json"), "utf8")) as DesignResults;
const store = () => directoryStore(join(root, "fixtures", "recordings"));

/** Results with each failure's reason set aside: a live failure and a missing recording both fail. */
const comparable = (results: BakeoffResults | DesignResults): unknown =>
  JSON.parse(
    JSON.stringify(results, (key, value: unknown) =>
      key === "outcome" && typeof value === "object" && value !== null && (value as { ok: boolean }).ok === false ? { ok: false } : key === "error" && typeof value === "string" ? "failed" : value,
    ),
  );

describe("the model bake-off", () => {
  it("replays from its recordings to the same scores, and eval/models.md's tables follow from them", async () => {
    const written = readFileSync(join(root, "eval", "models.md"), "utf8");
    const expected = JSON.stringify({ scores: comparable(recorded), tables: true });
    const { output } = await sweep("bakeoff-models", INPUTS, expected, async () => {
      const replayed = await runBakeoff(replayClient(store()), loadModelConfig().structuredOutput, recorded.candidates);
      const { excluded } = loadModelConfig();
      const pair = transcriberPair(replayed, excluded);
      const agreed = pair.first && pair.second ? agreement(replayed, pair.first.model, pair.second.model) : [];
      const date = /Run on (\d{4}-\d{2}-\d{2})/.exec(written)?.[1] ?? "";
      // Up to the design half, which has its own results file.
      const [ours] = toModelsMarkdown(replayed, agreed, { date }, undefined, excluded).split("## Proposed per stage");
      return JSON.stringify({ scores: comparable(replayed), tables: written.startsWith((ours ?? "").split("## Planning")[0] ?? "") });
    });
    expect(JSON.parse(output)).toEqual(JSON.parse(expected));
  }, 120_000);

  it("replays its planning and reviewing to the same scores, from the best reader's readings", async () => {
    const best = rankReaders(recorded).find((row) => !loadModelConfig().excluded.models.includes(row.model))?.model;
    const readings = Object.fromEntries(recorded.readings.filter((entry) => entry.model === best && entry.outcome.ok).map((entry) => [entry.paper, (entry.outcome as { value: unknown }).value])) as Record<string, never>;
    const expected = JSON.stringify(comparable(designed));
    const { output } = await sweep("bakeoff-design", INPUTS, expected, async () => JSON.stringify(comparable(await runDesignBakeoff(replayClient(store()), loadModelConfig().structuredOutput, recorded.candidates, readings))));
    expect(JSON.parse(output)).toEqual(JSON.parse(expected));
  }, 300_000);
});
