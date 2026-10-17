/**
 * A job's pipeline, wired: the controller with a model client wrapped, per job, in a token budget
 * whose trace is kept as the job's artifact (ADR-0030), and Threshold Town as the planner's worked
 * example. Which client depends on how the server was started: recordings under `npm run dev:api`,
 * the live gateway only under `npm run pipeline:live -- serve`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runJob, type JobSink, type JobSource } from "@paperplay/pipeline/controller";
import type { Fetch } from "@paperplay/pipeline/ingest";
import { budgetedClient, newTrace, type ModelClient } from "@paperplay/pipeline/models";
import type { ModelConfig } from "./models/config.ts";
import type { JobRunner } from "./jobs.ts";

interface ExampleLevel {
  readonly title: string;
  readonly goal: string;
  readonly manipulable: { readonly label: string; readonly targetVariable: string };
  readonly counterfactual: { readonly prompt: string; readonly altParams: Record<string, number>; readonly expectedQualitativeEffect: string; readonly difference: { readonly label: string; readonly time: number; readonly claim: { readonly relation: string; readonly by: number } } };
}

/** Threshold Town's levels, in brief, as the planner's worked example. */
export function workedExample(): string {
  const spec = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "..", "fixtures", "worldspecs", "kermack-mckendrick-1927.json"), "utf8")) as { title: string; levels: ExampleLevel[] };
  return [
    `${spec.title}, from Kermack and McKendrick 1927, a model of x still well, y ill and z removed:`,
    ...spec.levels.map(
      (level, index) =>
        `Level ${index + 1}, ${level.title}: ${level.goal} Control: ${level.manipulable.label} (${level.manipulable.targetVariable}). What if: ${level.counterfactual.prompt} (${JSON.stringify(level.counterfactual.altParams)}). Measured: ${level.counterfactual.difference.label}, over ${level.counterfactual.difference.time} days; the other world ${level.counterfactual.difference.claim.relation} by more than ${level.counterfactual.difference.claim.by}. It states: ${level.counterfactual.expectedQualitativeEffect}`,
    ),
  ].join("\n");
}

export function pipelineRunner(client: ModelClient, config: ModelConfig, fetch: Fetch): JobRunner {
  const example = workedExample();
  return async (source: JobSource, sink: JobSink, signal: AbortSignal) => {
    const trace = newTrace(config.jobTokenBudget);
    try {
      return await runJob({ source, client: budgetedClient(client, trace), config: { stages: config.stages, structuredOutput: config.structuredOutput }, fetch, example, signal }, sink);
    } finally {
      sink.artifact("trace", trace);
    }
  };
}
