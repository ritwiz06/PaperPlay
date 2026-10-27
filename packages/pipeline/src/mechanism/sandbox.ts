/**
 * The host's side of a generated mechanism's sandbox in Node (ADR-0058): it starts the worker with
 * its heap limit, sends each request as JSON, and keeps a watchdog on every call, so a module that
 * hangs past the context's own timeout, or fills its heap, ends the sandbox rather than the job.
 */
import { MECHANISM_LIMITS } from "@paperplay/contracts";
import { driverScript, MODULE_FILE, moduleLine } from "@paperplay/primitives/mechanism";
import { Worker } from "node:worker_threads";

/** What a sandbox answers: the module's answer, or its failure in words, with its line where it has one. */
export type SandboxAnswer = ({ readonly ok: true } & Record<string, unknown>) | { readonly ok: false; readonly error: string; readonly line: number | null; readonly limit?: "time" | "memory" };

export interface SandboxLimits {
  readonly callMs: number;
  readonly heapMb: number;
}

export interface MechanismSandbox {
  request(body: Record<string, unknown>): Promise<SandboxAnswer>;
  close(): Promise<void>;
}

/** A value the driver could not send as a number, such as NaN, comes back marked; it returns to a number here. */
const revive = (_key: string, value: unknown): unknown =>
  value !== null && typeof value === "object" && "nonFinite" in value && Object.keys(value).length === 1 ? Number((value as { nonFinite: string }).nonFinite) : value;

/** Opens a sandbox on a module's source. A module that does not load still opens: its every answer is the load's failure. */
export function openSandbox(source: string, limits: SandboxLimits = MECHANISM_LIMITS): MechanismSandbox {
  const lines = source.split("\n").length;
  const worker = new Worker(new URL("./sandbox-worker.ts", import.meta.url), {
    workerData: { script: driverScript(source, "node"), file: MODULE_FILE, lineOffset: 1 - moduleLine("node"), callMs: limits.callMs },
    resourceLimits: { maxOldGenerationSizeMb: limits.heapMb, maxYoungGenerationSizeMb: Math.max(4, Math.round(limits.heapMb / 4)), codeRangeSizeMb: 16, stackSizeMb: 4 },
    env: {},
    stdout: true,
    stderr: true,
  });
  let next = 0;
  let ended: SandboxAnswer | null = null;
  const waiting = new Map<number, (answer: SandboxAnswer) => void>();
  const end = (answer: SandboxAnswer) => {
    ended ??= answer;
    for (const resolve of waiting.values()) resolve(ended);
    waiting.clear();
  };
  worker.on("message", ({ id, json }: { id: number; json: string }) => {
    const resolve = waiting.get(id);
    if (!resolve) return;
    waiting.delete(id);
    let answer: SandboxAnswer;
    try {
      answer = JSON.parse(json, revive) as SandboxAnswer;
    } catch {
      answer = { ok: false, error: "the sandbox's answer was not JSON", line: null };
    }
    // A line outside the module's own is the driver's: the error stands, its line does not.
    if (!answer.ok && answer.line !== null && (answer.line < 1 || answer.line > lines)) answer = { ...answer, line: null };
    resolve(answer);
  });
  worker.on("error", (cause: Error & { code?: string }) => {
    end(cause.code === "ERR_WORKER_OUT_OF_MEMORY" ? { ok: false, error: `the module ran out of its ${limits.heapMb} MB of memory`, line: null, limit: "memory" } : { ok: false, error: `the sandbox failed: ${cause.message}`, line: null });
  });
  worker.on("exit", () => end({ ok: false, error: "the sandbox has closed", line: null }));
  return {
    request(body) {
      if (ended) return Promise.resolve(ended);
      const id = (next += 1);
      return new Promise<SandboxAnswer>((resolve) => {
        // The context stops a call at its limit; the watchdog ends the whole sandbox if that fails.
        const watchdog = setTimeout(() => {
          end({ ok: false, error: `the call ran past its ${limits.callMs} ms`, line: null, limit: "time" });
          void worker.terminate();
        }, limits.callMs + 1_000);
        waiting.set(id, (answer) => {
          clearTimeout(watchdog);
          resolve(answer);
        });
        worker.postMessage({ id, json: JSON.stringify(body) });
      });
    },
    async close() {
      end({ ok: false, error: "the sandbox has closed", line: null });
      await worker.terminate();
    },
  };
}
