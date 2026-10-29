/**
 * The writer's fix loop (ADR-0058): the module is written, checked in the sandbox, and, while it
 * fails, sent back with every problem the checks found, at most three times and only while the job
 * has time for another round. The checks decide; the writer only ever reads their words.
 */
import { MECHANISM_LIMITS, type MechanismManifest } from "@paperplay/contracts";
import { ModelError, type ChatMessage } from "../models/index.ts";
import { mechanismFixMessages, mechanismWriterMessages, moduleOf, type MechanismWriterInput } from "../stages/mechanism-writer.ts";
import { checkMechanism, feedbackOf, type MechanismReport, type PaperNumber } from "./checks.ts";
import type { SandboxLimits } from "./sandbox.ts";

/** At most this many rounds of fixes after the first module. */
export const FIX_ROUNDS = 3;

export interface WriterRound {
  /** 0 for the first module, then each fix. */
  readonly round: number;
  /** The writer's call, then the checks, in milliseconds. */
  readonly writeMs: number;
  readonly checkMs: number;
  /** The checks' report, or null when the reply held no module. */
  readonly report: MechanismReport | null;
  /** What was wrong, in the words the writer was told; "" once every check passed. */
  readonly problems: string;
}

export type WriterOutcome =
  | { readonly kind: "passed"; readonly source: string; readonly manifest: MechanismManifest; readonly report: MechanismReport; readonly rounds: readonly WriterRound[] }
  | { readonly kind: "failed"; readonly source: string | null; readonly report: MechanismReport | null; readonly rounds: readonly WriterRound[]; readonly reason: string }
  | { readonly kind: "refused"; readonly reason: string; readonly rounds: readonly WriterRound[] };

export interface LoopOptions {
  /** The writer's call: messages in, the reply's text out. The controller times and records it. */
  readonly call: (messages: ChatMessage[], round: number) => Promise<string>;
  /** The job's time left, in milliseconds; a round starts only when it is likely to finish. */
  readonly timeLeft?: () => number;
  readonly fixes?: number;
  readonly limits?: SandboxLimits;
  /** The numbers the paper reports as results, which a module must never write in (ADR-0058's amendment). */
  readonly results?: readonly PaperNumber[];
  /** Each round as it ends, for the job's events. */
  readonly onRound?: (round: WriterRound) => void;
}

export async function writeCheckedMechanism(input: MechanismWriterInput, options: LoopOptions): Promise<WriterOutcome> {
  const rounds: WriterRound[] = [];
  const history: { source: string; problems: string }[] = [];
  const fixes = options.fixes ?? FIX_ROUNDS;
  let last: { source: string; report: MechanismReport | null } | null = null;
  for (let round = 0; round <= fixes; round += 1) {
    if (round > 0 && options.timeLeft) {
      // A round costs about what the last one did; one that would run past the deadline is not begun.
      const previous = rounds[rounds.length - 1];
      const needs = previous ? previous.writeMs + previous.checkMs : 0;
      if (options.timeLeft() < needs) return { kind: "failed", source: last?.source ?? null, report: last?.report ?? null, rounds, reason: `no time for fix ${round}: the last round took ${Math.round(needs / 1000)} s and ${Math.round(options.timeLeft() / 1000)} s are left` };
    }
    const began = Date.now();
    let text: string;
    try {
      text = await options.call(round === 0 ? mechanismWriterMessages(input) : mechanismFixMessages(input, history), round);
    } catch (error) {
      // A reply that never came within the call's time is a round lost, not the job: ask again, shorter.
      if (!(error instanceof ModelError) || error.kind !== "timeout") throw error;
      const entry: WriterRound = { round, writeMs: Date.now() - began, checkMs: 0, report: null, problems: `- your last answer did not arrive within its time (${error.message})` };
      rounds.push(entry);
      options.onRound?.(entry);
      history.push({ source: "", problems: entry.problems });
      continue;
    }
    const writeMs = Date.now() - began;
    const reply = moduleOf(text);
    if (reply.kind === "refused") {
      rounds.push({ round, writeMs, checkMs: 0, report: null, problems: `refused: ${reply.reason}` });
      options.onRound?.(rounds[rounds.length - 1] as WriterRound);
      return { kind: "refused", reason: reply.reason, rounds };
    }
    if (reply.kind === "unusable") {
      const entry: WriterRound = { round, writeMs, checkMs: 0, report: null, problems: `- ${reply.problem}` };
      rounds.push(entry);
      options.onRound?.(entry);
      history.push({ source: text.slice(0, MECHANISM_LIMITS.sourceChars), problems: entry.problems });
      continue;
    }
    const checking = Date.now();
    const report = await checkMechanism(reply.source, options.limits, { results: options.results ?? [] });
    const entry: WriterRound = { round, writeMs, checkMs: Date.now() - checking, report, problems: feedbackOf(report) };
    rounds.push(entry);
    options.onRound?.(entry);
    last = { source: reply.source, report };
    if (report.passed && report.manifest) return { kind: "passed", source: reply.source, manifest: report.manifest, report, rounds };
    history.push({ source: reply.source, problems: entry.problems });
  }
  return { kind: "failed", source: last?.source ?? null, report: last?.report ?? null, rounds, reason: `the module still failed its checks after ${fixes} rounds of fixes` };
}
