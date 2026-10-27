/**
 * The timed writer comparison (ADR-0058): each candidate coding model writes the same paper's
 * mechanism through the whole fix loop, every call asked live and timed, every module checked in
 * the sandbox. The model that passes on the most papers, then in the least time, writes for jobs.
 */
import type { ModelClient } from "@paperplay/pipeline/models";
import { writeCheckedMechanism, type WriterOutcome } from "@paperplay/pipeline/mechanism";
import type { MechanismWriterInput } from "@paperplay/pipeline/stages";

/** The models compared (the owner, 2026-10-26). */
export const WRITER_CANDIDATES = ["glm-5-3", "kimi-k2-7-code", "qwen3-coder-next", "devstral2-123b"] as const;

export interface WriterAttempt {
  readonly paper: string;
  readonly model: string;
  readonly outcome: WriterOutcome["kind"] | "error";
  readonly reason: string | null;
  /** Each round: the writer's seconds, the checks' seconds, and the checks that failed. */
  readonly rounds: readonly { readonly round: number; readonly writeSeconds: number; readonly checkSeconds: number; readonly failed: readonly string[] }[];
  readonly seconds: number;
  readonly characters: number | null;
  readonly kit: string | null;
}

/** One model on one paper, the loop's last module kept for review. */
export async function writerAttempt(client: ModelClient, model: string, paper: string, input: MechanismWriterInput, maxTokens: number): Promise<{ readonly attempt: WriterAttempt; readonly source: string | null }> {
  const began = performance.now();
  const seconds = (ms: number) => Math.round(ms / 100) / 10;
  try {
    const outcome = await writeCheckedMechanism(input, {
      call: async (messages) => (await client.complete({ stage: "writer", model, messages, temperature: 0, maxTokens })).text,
    });
    const source = outcome.kind === "refused" ? null : outcome.source;
    const report = outcome.kind === "refused" ? null : outcome.report;
    return {
      attempt: {
        paper,
        model,
        outcome: outcome.kind,
        reason: outcome.kind === "passed" ? null : outcome.reason,
        rounds: outcome.rounds.map((round) => ({ round: round.round, writeSeconds: seconds(round.writeMs), checkSeconds: seconds(round.checkMs), failed: round.report ? round.report.checks.filter((check) => !check.passed).map((check) => check.name) : ["no module"] })),
        seconds: seconds(performance.now() - began),
        characters: source?.length ?? null,
        kit: report?.manifest?.kit ?? null,
      },
      source,
    };
  } catch (error) {
    return { attempt: { paper, model, outcome: "error", reason: error instanceof Error ? error.message.split("\n")[0] ?? "" : String(error), rounds: [], seconds: seconds(performance.now() - began), characters: null, kit: null }, source: null };
  }
}

export interface WriterRow {
  readonly model: string;
  readonly passed: number;
  readonly attempts: number;
  readonly meanSeconds: number;
  readonly meanRounds: number;
}

export function writerTable(attempts: readonly WriterAttempt[]): WriterRow[] {
  const models = [...new Set(attempts.map((attempt) => attempt.model))];
  return models
    .map((model) => {
      const mine = attempts.filter((attempt) => attempt.model === model);
      const passed = mine.filter((attempt) => attempt.outcome === "passed");
      return {
        model,
        passed: passed.length,
        attempts: mine.length,
        meanSeconds: passed.length > 0 ? passed.reduce((sum, attempt) => sum + attempt.seconds, 0) / passed.length : Number.POSITIVE_INFINITY,
        meanRounds: mine.reduce((sum, attempt) => sum + attempt.rounds.length, 0) / Math.max(1, mine.length),
      };
    })
    .sort((a, b) => b.passed - a.passed || a.meanSeconds - b.meanSeconds);
}
