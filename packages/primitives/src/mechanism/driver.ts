/**
 * The driver of a generated mechanism (ADR-0058): the plain JavaScript that runs inside a sandbox
 * beside the module a writer agent wrote. It is a string here, never run by this package: the
 * pipeline runs it in an empty Node context and the web app in a worker inside a separate-origin
 * frame. It takes away what a module must not reach, loads the module, and answers requests as
 * JSON; the host parses every answer against the contracts before it uses it.
 *
 * Requests, each a JSON string:
 * - `{op: "describe"}`: the module's manifest, as it gave it.
 * - `{op: "run", seed, params, steps, every, frameAt}`: one run from init, measured at step 0 and
 *   every `every` steps, framed at the steps in `frameAt`.
 * - `{op: "start", run, seed, params}` and `{op: "advance", run, steps, params}`: a run kept in
 *   the sandbox and stepped as a world plays, each answer its step, measurement and frame.
 * - `{op: "stop", run}`.
 * Each answer is `{ok: true, ...}` or `{ok: false, error, line}`, the line the module's own.
 */

/** The file name a module's errors are reported under. */
export const MODULE_FILE = "mechanism.js";

/** What the driver neuters before a module runs: the network, storage, timers, the clock and any other way out. */
export const BLOCKED_GLOBALS: readonly string[] = Object.freeze([
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "WebTransport",
  "EventSource",
  "RTCPeerConnection",
  "BroadcastChannel",
  "MessageChannel",
  "Worker",
  "SharedWorker",
  "importScripts",
  "indexedDB",
  "caches",
  "localStorage",
  "sessionStorage",
  "cookieStore",
  "navigator",
  "location",
  "setTimeout",
  "setInterval",
  "queueMicrotask",
  "requestAnimationFrame",
  "performance",
  "crypto",
  "WebAssembly",
  "SharedArrayBuffer",
  "Atomics",
  "FileReader",
  "OffscreenCanvas",
  "Request",
  "Response",
  "Headers",
  // Clocks and chance a module could read without Date or Math.random: the time a date format or an
  // event carries, a timeout's, and the random names of object URLs.
  "Temporal",
  "Intl",
  "Event",
  "EventTarget",
  "CustomEvent",
  "AbortController",
  "AbortSignal",
  "URL",
  "Blob",
  "File",
  "MessagePort",
  "ReadableStream",
  "WritableStream",
  "TransformStream",
]);

const LOCKDOWN = `
const __stringify = JSON.stringify;
const __parse = JSON.parse;
const __isFinite = Number.isFinite;
const __keys = Object.keys;
const __freeze = Object.freeze;
for (const name of ${JSON.stringify(BLOCKED_GLOBALS)}) {
  // A browser keeps much of this on the global's prototypes, a worker's fetch and timers included.
  for (let scope = globalThis; scope; scope = Object.getPrototypeOf(scope)) {
    if (Object.prototype.hasOwnProperty.call(scope, name)) { try { delete scope[name]; } catch (_) {} }
  }
  try { Object.defineProperty(globalThis, name, { value: undefined, writable: false, configurable: false }); } catch (_) {}
}
Math.random = function () { throw new Error("Math.random is not allowed: draw from a generator seeded by init's seed"); };
const __Date = function () { throw new Error("the clock is not allowed: a mechanism's state comes from its seed and its steps"); };
try { Object.defineProperty(globalThis, "Date", { value: __Date, writable: false, configurable: false }); } catch (_) {}
`;

/** The module's error, with the line in its own source, from a stack that names its file. */
const ERROR = `
const __error = (cause) => {
  const message = cause && typeof cause === "object" && "message" in cause ? String(cause.message) : String(cause);
  const stack = cause && typeof cause === "object" && "stack" in cause ? String(cause.stack) : "";
  const at = /${MODULE_FILE.replace(".", "\\.")}:(\\d+)/.exec(stack);
  return { ok: false, error: message.slice(0, 500), line: at ? Number(at[1]) : null };
};
`;

const HANDLE = `
const __runs = new Map();
const __measure = (state) => {
  const measured = __mechanism.measure(state);
  if (!measured || typeof measured !== "object") throw new Error("measure(state) must return an object of numbers, one for each measurement id");
  return __ids.measurements.map((id) => measured[id]);
};
const __frame = (state) => __mechanism.frame(state);
const __params = (given) => __freeze(Object.assign({}, given));
const __answer = (request) => {
  if (!__mechanism || typeof __mechanism !== "object") throw new Error("the module must define a constant named mechanism, an object");
  for (const name of ["init", "step", "measure", "frame"]) if (typeof __mechanism[name] !== "function") throw new Error("mechanism." + name + " must be a function");
  if (request.op === "describe") {
    const { title, kit, params, measurements, steps, stepLabel } = __mechanism;
    return { ok: true, manifest: __parse(__stringify({ title, kit, params, measurements, steps, stepLabel })) };
  }
  if (request.op === "run") {
    const params = __params(request.params);
    let state = __mechanism.init(request.seed, params);
    const measures = [__measure(state)];
    const frames = {};
    if (request.frameAt.includes(0)) frames[0] = __frame(state);
    for (let at = 1; at <= request.steps; at += 1) {
      state = __mechanism.step(state, params);
      if (at % request.every === 0) measures.push(__measure(state));
      if (request.frameAt.includes(at)) frames[at] = __frame(state);
    }
    return { ok: true, measures, frames };
  }
  if (request.op === "start") {
    const params = __params(request.params);
    const state = __mechanism.init(request.seed, params);
    __runs.set(request.run, { state, step: 0 });
    return { ok: true, step: 0, measure: __measure(state), frame: __frame(state) };
  }
  if (request.op === "advance") {
    const run = __runs.get(request.run);
    if (!run) throw new Error("no run " + request.run);
    const params = __params(request.params);
    for (let n = 0; n < request.steps; n += 1) run.state = __mechanism.step(run.state, params);
    run.step += request.steps;
    return { ok: true, step: run.step, measure: __measure(run.state), frame: __frame(run.state) };
  }
  if (request.op === "stop") {
    __runs.delete(request.run);
    return { ok: true };
  }
  throw new Error("no request " + request.op);
};
const __handle = (json) => {
  let answer;
  try { answer = __answer(__parse(json)); } catch (cause) { answer = __error(cause); }
  try { return __stringify(answer, (key, value) => (typeof value === "number" && !__isFinite(value) ? { nonFinite: String(value) } : value)); }
  catch (cause) { return __stringify(__error(new Error("the answer could not be sent: " + (cause && cause.message)))); }
};
`;

/**
 * The script a sandbox runs: the lockdown, then the module inside a function in strict mode, then
 * the handler. Node calls `__handle(json)` in the same context; a worker gets the `worker` tail,
 * which answers its messages through a port the module never sees.
 */
export function driverScript(source: string, transport: "node" | "worker"): string {
  return `${prefixOf(transport)}${source}${SUFFIX}${HANDLE}${transport === "node" ? NODE_TAIL : ""}`;
}

/** The script's line on which the module's first line falls, so a host can report a module's errors on its own lines. */
export const moduleLine = (transport: "node" | "worker"): number => prefixOf(transport).split("\n").length;

const prefixOf = (transport: "node" | "worker"): string =>
  `"use strict";\n${transport === "worker" ? WORKER_HEAD : ""}${LOCKDOWN}${ERROR}const __loaded = (() => { try { return { mechanism: (function () {\n`;
const SUFFIX = `\n;return typeof mechanism === "undefined" ? undefined : mechanism; })() }; } catch (cause) { return { failure: __error(cause) }; } })();
const __mechanism = __loaded.mechanism;
const __ids = { measurements: __mechanism && Array.isArray(__mechanism.measurements) ? __mechanism.measurements.map((measurement) => measurement && measurement.id) : [] };
`;
const NODE_TAIL = `globalThis.__paperplay = (json) => (__loaded.failure ? __stringify(__loaded.failure) : __handle(json));\n`;

/** What a worker's driver takes for itself and then hides, so a module can neither send nor read messages. */
export const WORKER_PORT: readonly string[] = Object.freeze(["postMessage", "addEventListener", "removeEventListener", "dispatchEvent", "onmessage", "onmessageerror", "onerror", "close", "self"]);

// In a worker, the driver keeps the message port to itself: it takes postMessage and the message
// event before the module runs, then hides both, on the global and up its prototypes. Messages are
// dispatched only once the script has run, so the handler's names exist by then.
const WORKER_HEAD = `
{
  // In a block, so the port's name is the listener's alone and no module can reach it.
  const post = globalThis.postMessage.bind(globalThis);
  globalThis.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || typeof data.id !== "number" || typeof data.json !== "string") return;
    post({ id: data.id, json: __loaded.failure ? __stringify(__loaded.failure) : __handle(data.json) });
  });
}
for (let scope = globalThis; scope; scope = Object.getPrototypeOf(scope)) {
  for (const name of ${JSON.stringify(WORKER_PORT)}) {
    if (!Object.prototype.hasOwnProperty.call(scope, name)) continue;
    try { delete scope[name]; } catch (_) {}
  }
}
for (const name of ${JSON.stringify(WORKER_PORT)}) {
  try { Object.defineProperty(globalThis, name, { value: undefined, writable: false, configurable: false }); } catch (_) {}
}
`;
