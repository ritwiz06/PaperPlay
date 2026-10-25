/**
 * Candidates judged by the rules that judge a world (ADR-0055): built in worlds of up to nine levels
 * (a world holds three to nine), each swept over the level rule's 20 starts and held to the
 * visibility rule. A candidate passes only where its claim holds on 16 of 20 and its difference shows.
 */
import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import type { ModelSpec, SourceRegisterEntry, SourceText } from "@paperplay/contracts";
import { registry } from "@paperplay/primitives";
import { assembleWorld, type AssembleInput } from "../assemble/world.ts";
import { buildWorld } from "../builder/build.ts";
import { sweepLevels } from "../rule/sweep.ts";
import { visibilityOf } from "../rule/visibility.ts";
import type { Reading } from "../stages/reader.ts";
import type { LevelCandidate } from "./types.ts";

export interface JudgeInput {
  readonly source: SourceText;
  readonly register: SourceRegisterEntry;
  readonly reading: Reading;
  readonly model: ModelSpec;
  readonly routingReason: string;
  readonly ownNumbers?: AssembleInput["ownNumbers"];
  readonly horizon: number;
}

const WORLD_MOST = 9;
const WORLD_LEAST = 3;

/** Batches of at most nine, none under three; fewer than three in all are padded with repeats, whose results are ignored. */
function batchesOf<T>(items: readonly T[]): { readonly items: readonly T[]; readonly real: number }[] {
  if (items.length === 0) return [];
  if (items.length < WORLD_LEAST) return [{ items: Array.from({ length: WORLD_LEAST }, (_, index) => items[index % items.length] as T), real: items.length }];
  const batches: T[][] = [];
  for (let at = 0; at < items.length; at += WORLD_MOST) batches.push(items.slice(at, at + WORLD_MOST));
  const last = batches.at(-1);
  const before = batches.at(-2);
  if (last && before && last.length < WORLD_LEAST) last.unshift(...before.splice(before.length - (WORLD_LEAST - last.length)));
  return batches.map((batch) => ({ items: batch, real: batch.length }));
}

/** The candidates that pass, each with how many starts its claim holds on, and why each other one does not. */
export function judgeCandidates(input: JudgeInput, candidates: readonly LevelCandidate[]): { readonly passing: LevelCandidate[]; readonly refused: { readonly id: string; readonly why: string }[] } {
  const passing: LevelCandidate[] = [];
  const refused: { id: string; why: string }[] = [];
  const judge = (batch: readonly LevelCandidate[], real: number, retry: boolean): void => {
    const plan = { title: "Candidates", perWatchSecond: Math.max(input.horizon / 40, 1e-6), levels: batch.map((candidate) => candidate.level), limits: ["To be written."] };
    const built = buildWorld(assembleWorld({ source: input.source, register: input.register, reading: input.reading, model: input.model, plan, explanation: { levels: [] }, routingReason: input.routingReason || "Candidate levels, judged before any planner.", ...(input.ownNumbers ? { ownNumbers: input.ownNumbers } : {}) }).spec, registry);
    if (!built.ok) {
      const broken = new Set(built.problems.flatMap((problem) => /^levels\.(\d+)/.exec(problem.path)?.[1] ?? []).map(Number).filter((index) => index < real));
      for (const index of broken) refused.push({ id: batch[index]?.id ?? "", why: "it does not build" });
      const rest = batch.slice(0, real).filter((_, index) => !broken.has(index));
      if (!retry || broken.size === 0 || rest.length === 0) {
        for (const candidate of rest) refused.push({ id: candidate.id, why: "its world does not build" });
        return;
      }
      for (const again of batchesOf(rest)) judge(again.items, again.real, false);
      return;
    }
    const swept = sweepLevels(built.world);
    const seen = visibilityOf(built.world);
    batch.slice(0, real).forEach((candidate, index) => {
      const level = swept[index];
      const visible = seen[index];
      if (!level?.meets) refused.push({ id: candidate.id, why: `its claim holds on ${level?.holds ?? 0} of 20 starts` });
      else if (!visible?.visible) refused.push({ id: candidate.id, why: `its difference is too small to see${visible?.why ? `: ${visible.why}` : ""}` });
      else passing.push({ ...candidate, holds: level.holds });
    });
  };
  for (const batch of batchesOf(candidates)) judge(batch.items, batch.real, true);
  return { passing, refused };
}

/**
 * The same judgement in parallel (ADR-0055): the candidates shared among worker threads, each
 * judging its share as judgeCandidates does, so the main thread, which may serve a job's events,
 * stays free. Where workers cannot start, or the candidates fill a single world, it judges here.
 */
export async function judgeInParallel(input: JudgeInput, candidates: readonly LevelCandidate[], workers = Math.max(1, Math.min(4, availableParallelism() - 1))): Promise<ReturnType<typeof judgeCandidates>> {
  const shares = Math.min(workers, Math.floor(candidates.length / WORLD_MOST));
  if (shares < 2) return judgeCandidates(input, candidates);
  const size = Math.ceil(candidates.length / shares);
  try {
    const parts = await Promise.all(
      Array.from({ length: shares }, (_, index) => candidates.slice(index * size, (index + 1) * size)).map(
        (share) =>
          new Promise<ReturnType<typeof judgeCandidates>>((resolve, reject) => {
            const worker = new Worker(new URL("./judge-worker.ts", import.meta.url), { workerData: { input, candidates: share } });
            worker.once("message", (result: ReturnType<typeof judgeCandidates>) => {
              resolve(result);
              void worker.terminate();
            });
            worker.once("error", reject);
          }),
      ),
    );
    // In the generator's order, as the planner reads them.
    const order = new Map(candidates.map((candidate, index) => [candidate.id, index]));
    const byOrder = (a: { readonly id: string }, b: { readonly id: string }) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
    return { passing: parts.flatMap((part) => part.passing).sort(byOrder), refused: parts.flatMap((part) => part.refused).sort(byOrder) };
  } catch {
    return judgeCandidates(input, candidates);
  }
}
