/**
 * A generated mechanism's sandbox in Node (ADR-0058): one worker thread, its heap capped by the
 * host, holding one empty V8 context. The context has no globals but JavaScript's own, no host
 * object is ever put in it, and it cannot make code from strings; requests go in and answers come
 * out as JSON strings only, each call stopped at its time limit.
 */
import vm from "node:vm";
import { parentPort, workerData } from "node:worker_threads";

const { script, file, lineOffset, callMs } = workerData as { script: string; file: string; lineOffset: number; callMs: number };

const context = vm.createContext(vm.constants.DONT_CONTEXTIFY, { codeGeneration: { strings: false, wasm: false }, microtaskMode: "afterEvaluate" });

/**
 * A failure the host reports as it is: the module's own error, or a limit it ran into. Errors are
 * read by their shape, since one made in the context is not an instance of this realm's Error.
 */
const failure = (cause: unknown): string => {
  const field = (name: string): string => (cause !== null && typeof cause === "object" && name in cause ? String((cause as Record<string, unknown>)[name]) : "");
  const message = field("message") || String(cause);
  if (field("code") === "ERR_SCRIPT_EXECUTION_TIMEOUT") return JSON.stringify({ ok: false, error: `the call ran past its ${callMs} ms`, line: null, limit: "time" });
  const stack = field("stack");
  const at = new RegExp(`${file.replace(".", "\\.")}:(\\d+)`).exec(stack);
  return JSON.stringify({ ok: false, error: message.slice(0, 500), line: at ? Number(at[1]) : null });
};

let loaded: string | null = null;
try {
  new vm.Script(script, { filename: file, lineOffset }).runInContext(context, { timeout: callMs });
} catch (cause) {
  loaded = failure(cause);
}

parentPort?.on("message", ({ id, json }: { id: number; json: string }) => {
  if (loaded) return parentPort?.postMessage({ id, json: loaded });
  try {
    // The request goes in as a string literal; the answer comes out as a string, made inside the context.
    const answer: unknown = vm.runInContext(`__paperplay(${JSON.stringify(json)})`, context, { timeout: callMs });
    parentPort?.postMessage({ id, json: typeof answer === "string" ? answer : JSON.stringify({ ok: false, error: "the sandbox's answer was not text", line: null }) });
  } catch (cause) {
    parentPort?.postMessage({ id, json: failure(cause) });
  }
});
