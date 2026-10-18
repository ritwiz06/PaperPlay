/**
 * The model configuration (ADR-0030), apps/api/models.json: the gateway, each stage's model,
 * which models honour structured output, the limits on every call, and a job's token budget.
 * Model ids live here, never in code; the bake-off (eval/models.md) chooses them.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { STAGES, type Stage } from "@paperplay/pipeline/models";
import { z } from "zod";

const ModelId = z.string().min(1).max(200);

/** The stages that review a world, and the stages whose work they review: its plans and its words. */
export const REVIEWERS = ["reviewer", "second-reviewer"] as const satisfies readonly Stage[];
export const AUTHORS = ["planner", "second-planner", "explainer"] as const satisfies readonly Stage[];

/** Models the Voyager portal marks "Testing in progress", which its API does not show: as the owner last saw them. */
export const Excluded = z.strictObject({
  asOf: z.iso.date(),
  source: z.string().min(1),
  models: z.array(ModelId),
});

export const ModelConfig = z
  .strictObject({
    baseUrl: z.url(),
    /** Each call's ceiling: a reasoning model streaming a long plan can take many minutes. */
    timeoutMs: z.int().positive().max(1_800_000),
    retries: z.int().min(0).max(6),
    backoffMs: z.int().positive().max(60_000),
    minIntervalMs: z.int().nonnegative().max(60_000),
    /** A job's token budget: once spent, its next call is refused. */
    jobTokenBudget: z.int().positive(),
    /** Each stage's model, or null until the bake-off chooses one. */
    stages: z.strictObject(Object.fromEntries(STAGES.map((stage) => [stage, ModelId.nullable()])) as Record<Stage, z.ZodNullable<typeof ModelId>>),
    /** The probe's findings: whether each model holds its reply to a JSON Schema on this gateway. */
    structuredOutput: z.record(ModelId, z.boolean()),
    excluded: Excluded,
  })
  // No stage may use a model the portal marks as still in testing (the owner, 2026-10-16).
  .refine((config) => Object.values(config.stages).every((model) => model === null || !config.excluded.models.includes(model)), {
    message: 'a stage uses a model the Voyager portal marks "Testing in progress"; see excluded',
    path: ["stages"],
  })
  // A reviewer is never the model that planned or wrote what it reviews (the owner, 2026-10-18).
  .superRefine((config, ctx) => {
    for (const reviewer of REVIEWERS) {
      const model = config.stages[reviewer];
      const wrote = AUTHORS.filter((author) => model !== null && config.stages[author] === model);
      if (wrote.length > 0) ctx.addIssue({ code: "custom", message: `the ${reviewer}, ${model ?? ""}, is also the ${wrote.join(" and the ")}: a reviewer may never be the model that planned or wrote what it reviews`, path: ["stages", reviewer] });
    }
  });
export type ModelConfig = z.infer<typeof ModelConfig>;

export const CONFIG_FILE = join(import.meta.dirname, "..", "..", "models.json");

export function loadModelConfig(file: string = CONFIG_FILE): ModelConfig {
  if (!existsSync(file))
    throw new Error(`there is no model configuration at ${file}`);
  return ModelConfig.parse(JSON.parse(readFileSync(file, "utf8")));
}
