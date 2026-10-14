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

export const ModelConfig = z.strictObject({
  baseUrl: z.url(),
  timeoutMs: z.int().positive().max(600_000),
  retries: z.int().min(0).max(6),
  backoffMs: z.int().positive().max(60_000),
  minIntervalMs: z.int().nonnegative().max(60_000),
  /** A job's token budget: once spent, its next call is refused. */
  jobTokenBudget: z.int().positive(),
  /** Each stage's model, or null until the bake-off chooses one. */
  stages: z.strictObject(Object.fromEntries(STAGES.map((stage) => [stage, ModelId.nullable()])) as Record<Stage, z.ZodNullable<typeof ModelId>>),
  /** The probe's findings: whether each model holds its reply to a JSON Schema on this gateway. */
  structuredOutput: z.record(ModelId, z.boolean()),
});
export type ModelConfig = z.infer<typeof ModelConfig>;

export const CONFIG_FILE = join(import.meta.dirname, "..", "..", "models.json");

export function loadModelConfig(file: string = CONFIG_FILE): ModelConfig {
  if (!existsSync(file)) throw new Error(`there is no model configuration at ${file}`);
  return ModelConfig.parse(JSON.parse(readFileSync(file, "utf8")));
}
