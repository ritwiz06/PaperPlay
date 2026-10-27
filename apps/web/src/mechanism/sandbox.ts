/**
 * A generated mechanism's sandbox in the browser (ADR-0058): a worker inside a frame of its own,
 * /sandbox.html, framed with sandbox="allow-scripts" alone, so its origin is opaque, under a policy
 * that allows no network and no code from strings. The page sends the frame the worker's whole
 * script once, then each request as JSON, and reads every answer as data, never as code. Its shape
 * is the Node sandbox's (packages/pipeline/src/mechanism/sandbox.ts), so one session can drive
 * either; the host still parses every answer against the contracts before it uses it.
 *
 * Its limits are weaker than Node's in one way: a browser gives a worker no heap limit of its own,
 * so the frame caps the size of each answer instead, and a module that fills its heap inside one
 * call fails as the browser decides. Node's sandbox holds the real memory limit, and a module runs
 * there, through the checks, before any browser runs it.
 */
import { MECHANISM_LIMITS } from "@paperplay/contracts";
import { driverScript, MODULE_FILE, moduleLine } from "@paperplay/primitives/mechanism";

/** What a sandbox answers: the module's answer, or its failure in words, with its line where it has one. The Node sandbox's shape. */
export type SandboxAnswer = ({ readonly ok: true } & Record<string, unknown>) | { readonly ok: false; readonly error: string; readonly line: number | null; readonly limit?: "time" | "memory" };

export interface BrowserSandboxLimits {
  /** One call's time in the worker; the frame's watchdog ends the sandbox past it. */
  readonly callMs: number;
  /** The longest answer the frame passes on, in characters of JSON: the browser's stand-in for a memory limit. */
  readonly answerChars: number;
}

export const BROWSER_SANDBOX_LIMITS: BrowserSandboxLimits = Object.freeze({ callMs: MECHANISM_LIMITS.callMs, answerChars: 2_000_000 });

export interface BrowserSandbox {
  request(body: Record<string, unknown>): Promise<SandboxAnswer>;
  close(): Promise<void>;
}

/** The frame's page, a static file with its own policy (apps/web/public/sandbox.html). */
export const SANDBOX_PAGE = "/sandbox.html";

/** How long the page waits on a frame that has gone quiet, beyond the frame's own watchdog, before it gives the sandbox up. */
const QUIET_MS = 5_000;

const CLOSED: SandboxAnswer = Object.freeze({ ok: false, error: "the sandbox has closed", line: null });

/** The worker's script: the driver around the module, named so a stack gives the module's file and line. */
export const workerScript = (source: string): string => `${driverScript(source, "worker")}\n//# sourceURL=${MODULE_FILE}\n`;

/** A value the driver could not send as a number, such as NaN, comes back marked; it returns to a number here. */
const revive = (_key: string, value: unknown): unknown =>
  value !== null && typeof value === "object" && "nonFinite" in value && Object.keys(value).length === 1 ? Number((value as { nonFinite: string }).nonFinite) : value;

/**
 * One answer from the frame, as data: parsed, its marked numbers revived, and its line moved from
 * the worker's script to the module's own. A line outside the module's is the driver's: the error
 * stands, its line does not.
 */
export function readAnswer(json: string, lines: number): SandboxAnswer {
  let answer: SandboxAnswer;
  try {
    answer = JSON.parse(json, revive) as SandboxAnswer;
  } catch {
    return { ok: false, error: "the sandbox's answer was not JSON", line: null };
  }
  if (answer === null || typeof answer !== "object" || typeof answer.ok !== "boolean") return { ok: false, error: "the sandbox's answer was not an answer", line: null };
  if (answer.ok) return answer;
  const line = typeof answer.line === "number" ? answer.line - moduleLine("worker") + 1 : null;
  return { ...answer, line: line !== null && line >= 1 && line <= lines ? line : null };
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object";

/**
 * Opens a sandbox on a module's source: a hidden frame, which starts the worker once it says it is
 * ready. Requests made before then wait for it. A module that does not load still opens: its every
 * answer is the load's failure.
 */
export function openBrowserSandbox(source: string, limits: BrowserSandboxLimits = BROWSER_SANDBOX_LIMITS): BrowserSandbox {
  const lines = source.split("\n").length;
  const frame = document.createElement("iframe");
  // allow-scripts alone: without allow-same-origin the frame's origin is opaque, so it shares no
  // storage, cookies or DOM with the page, and the page's policy cannot be loosened from inside it.
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("aria-hidden", "true");
  frame.title = "Mechanism sandbox";
  frame.tabIndex = -1;
  frame.hidden = true;
  frame.src = SANDBOX_PAGE;
  document.body.append(frame);

  let next = 0;
  let ready = false;
  let ended: SandboxAnswer | null = null;
  let quiet: ReturnType<typeof setTimeout> | null = null;
  const outbox: { id: number; json: string }[] = [];
  const waiting = new Map<number, (answer: SandboxAnswer) => void>();

  const post = (message: unknown) => frame.contentWindow?.postMessage(message, "*");
  // The page's own watchdog, for a frame that stops answering altogether; the frame's ends a call.
  const watch = (restart: boolean) => {
    if (quiet !== null && !restart) return;
    if (quiet !== null) clearTimeout(quiet);
    quiet = waiting.size > 0 ? setTimeout(() => end({ ok: false, error: "the sandbox stopped answering", line: null, limit: "time" }), limits.callMs + QUIET_MS) : null;
  };
  const end = (answer: SandboxAnswer) => {
    if (ended) return;
    ended = CLOSED;
    window.removeEventListener("message", listen);
    if (quiet !== null) clearTimeout(quiet);
    frame.remove();
    for (const resolve of waiting.values()) resolve(answer);
    waiting.clear();
  };
  const listen = (event: MessageEvent) => {
    // Only the frame speaks to this sandbox, and from an opaque origin.
    if (event.source !== frame.contentWindow || event.origin !== "null" || !isRecord(event.data)) return;
    const data = event.data;
    if (data["ready"] === true && !ready) {
      ready = true;
      post({ load: workerScript(source), callMs: limits.callMs, answerChars: limits.answerChars });
      for (const request of outbox.splice(0)) post(request);
      return;
    }
    if (typeof data["id"] !== "number" || typeof data["json"] !== "string") return;
    const resolve = waiting.get(data["id"]);
    if (!resolve) return;
    waiting.delete(data["id"]);
    resolve(readAnswer(data["json"], lines));
    watch(true);
  };
  window.addEventListener("message", listen);

  return {
    request(body) {
      if (ended) return Promise.resolve(ended);
      const id = (next += 1);
      const request = { id, json: JSON.stringify(body) };
      return new Promise<SandboxAnswer>((resolve) => {
        waiting.set(id, resolve);
        watch(false);
        if (ready) post(request);
        else outbox.push(request);
      });
    },
    close() {
      end(CLOSED);
      return Promise.resolve();
    },
  };
}
