import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { expect, test, type Frame, type JSHandle, type Page } from "@playwright/test";
import { BROWSER_SANDBOX_LIMITS, workerScript, type BrowserSandbox, type BrowserSandboxLimits, type SandboxAnswer } from "../../apps/web/src/mechanism/sandbox.ts";
import { openSandbox as openNodeSandbox } from "../../packages/pipeline/src/mechanism/sandbox.ts";

// The browser's sandbox of a generated mechanism (ADR-0058): a worker inside a frame of its own
// origin, an opaque one, under a policy with no network. Each probe module below tries ways out
// and reports what happened through its title, read by describe; a beacon server, started here,
// counts every request that reaches it, and the browser's own requests are watched too. The
// development server's /check/sandbox lends the tests its sandbox; the last tests run the frame
// under the deploy's headers, served from the production build.

const BUILT = "http://127.0.0.1:4318";
const reference = readFileSync(fileURLToPath(new URL("../../fixtures/mechanisms/row-attention.js", import.meta.url)), "utf8");
const deploy = JSON.parse(readFileSync(fileURLToPath(new URL("../../vercel.json", import.meta.url)), "utf8")) as { headers: { source: string; headers: { key: string; value: string }[] }[] };

/**
 * A module that runs `probes` at load and reports their results as its title; `later` records a
 * promise once it settles, and `inherited` finds a name on the global's prototypes, where a
 * browser's worker keeps some of what the driver hides on the global itself.
 */
const probe = (probes: string): string => `
const results = {};
const attempt = (name, run) => { try { results[name] = String(run()); } catch (cause) { results[name] = "refused: " + (cause && cause.message); } };
const later = (name, run) => {
  results[name] = "pending";
  try { Promise.resolve(run()).then((value) => { results[name] = "reached: " + String(value); }, (cause) => { results[name] = "refused: " + (cause && cause.message); }); }
  catch (cause) { results[name] = "refused: " + (cause && cause.message); }
};
const inherited = (name) => {
  for (let scope = Object.getPrototypeOf(globalThis); scope; scope = Object.getPrototypeOf(scope)) {
    const found = Object.getOwnPropertyDescriptor(scope, name);
    if (found) return found.get ? found.get.call(globalThis) : found.value;
  }
  return undefined;
};
${probes}
const mechanism = {
  get title() { return JSON.stringify(results); },
  kit: "charts", params: [], measurements: [], steps: 1, stepLabel: "step",
  init() { return {}; }, step(state) { return state; }, measure() { return {}; }, frame() { return { bars: [] }; },
};`;

type Sandbox = JSHandle<BrowserSandbox>;
type Hook = { paperplaySandbox: { open(source: string, limits?: BrowserSandboxLimits): BrowserSandbox } };

async function checkPage(page: Page): Promise<void> {
  await page.goto("/check/sandbox");
  await expect(page.locator("output[data-ready='yes']")).toHaveText("One query attending over a row of words", { timeout: 20_000 });
}

const open = (page: Page, source: string, limits: BrowserSandboxLimits = BROWSER_SANDBOX_LIMITS): Promise<Sandbox> =>
  page.evaluateHandle(([source, limits]) => (window as unknown as Hook).paperplaySandbox.open(source, limits), [source, limits] as const);

const ask = (sandbox: Sandbox, body: Record<string, unknown>): Promise<SandboxAnswer> => sandbox.evaluate((box, body) => box.request(body), body);

const resultsOf = async (sandbox: Sandbox): Promise<Record<string, string>> => {
  const answer = await ask(sandbox, { op: "describe" });
  if (!answer.ok) throw new Error(answer.error);
  return JSON.parse((answer["manifest"] as { title: string }).title) as Record<string, string>;
};

/** The probes' results once none is pending: a promise settles between two calls. */
async function settled(sandbox: Sandbox): Promise<Record<string, string>> {
  let results: Record<string, string> = {};
  await expect
    .poll(async () => {
      results = await resultsOf(sandbox);
      return Object.entries(results).filter(([, value]) => value === "pending");
    })
    .toEqual([]);
  return results;
}

/** A value with every number in it matched to 12 decimal places, and everything else exactly. */
const nearly = (value: unknown): unknown => {
  if (typeof value === "number") return expect.closeTo(value, 12);
  if (Array.isArray(value)) return value.map(nearly);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, nearly(entry)]));
  return value;
};

/** The newest sandbox frame on the page: the check page's own comes first. */
const lastFrame = (page: Page): Frame => {
  const frames = page.frames().filter((frame) => frame.url().endsWith("/sandbox.html"));
  const frame = frames.at(-1);
  if (!frame) throw new Error("no sandbox frame on the page");
  return frame;
};

let beacon = "";
let server: Server;
const reached: string[] = [];

test.beforeAll(async () => {
  // Every request or socket that reaches this server is a way out of the sandbox; it answers
  // anyone, so a request that got through would also succeed in the module.
  server = createServer((request, response) => {
    reached.push(request.url ?? "");
    response.writeHead(200, { "Access-Control-Allow-Origin": "*", "Content-Type": "text/javascript" });
    response.end("export default 1;");
  });
  server.on("upgrade", (request, socket) => {
    reached.push(`upgrade ${request.url ?? ""}`);
    socket.destroy();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  beacon = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test.describe("[R08] the browser sandbox of a generated mechanism (ADR-0058)", () => {
  test("[R08] runs the reference module as Node's sandbox does: its manifest, a run from a seed, and a run kept and stepped", async ({ page }) => {
    const node = openNodeSandbox(reference);
    const run = { op: "run", seed: 3, params: { scaled: 1, width: 32 }, steps: 48, every: 1, frameAt: [0, 8, 48] };
    const expected = { described: await node.request({ op: "describe" }), run: await node.request(run) };
    await node.close();
    expect(expected.run.ok).toBe(true);

    await checkPage(page);
    const sandbox = await open(page, reference);
    expect(await ask(sandbox, { op: "describe" })).toEqual(expected.described);
    // Node's V8 and this Chromium's differ in the last bit of Math.exp for some inputs
    // (Math.exp(1.7) is 5.473947391727199 in Node 24.21 and 5.4739473917272 here), so the browser
    // matches Node's run to 12 digits, and its own runs to the bit.
    const first = await ask(sandbox, run);
    expect(first).toEqual(nearly(expected.run));
    expect(await ask(sandbox, run)).toEqual(first);
    if (!first.ok) throw new Error(first.error);
    const measures = first["measures"] as number[][];
    const frames = first["frames"] as Record<string, unknown>;
    expect(await ask(sandbox, { op: "start", run: "a", seed: 3, params: { scaled: 1, width: 32 } })).toEqual({ ok: true, step: 0, measure: measures[0], frame: frames["0"] });
    expect(await ask(sandbox, { op: "advance", run: "a", steps: 8, params: { scaled: 1, width: 32 } })).toEqual({ ok: true, step: 8, measure: measures[8], frame: frames["8"] });
    expect(await ask(sandbox, { op: "advance", run: "a", steps: 40, params: { scaled: 1, width: 32 } })).toEqual({ ok: true, step: 48, measure: measures[48], frame: frames["48"] });
    expect(await ask(sandbox, { op: "stop", run: "a" })).toEqual({ ok: true });
    expect(await ask(sandbox, { op: "advance", run: "a", steps: 1, params: { scaled: 1, width: 32 } })).toMatchObject({ ok: false, error: "no run a" });
  });

  test("[R08] reports a module's error on its own line, and a syntax error too", async ({ page }) => {
    await checkPage(page);
    const broken = await open(page, reference.replace("return { entropy, peak: Math.max(...weights) };", "return { entropy, peak: undefinedName };"));
    const line = reference.split("\n").findIndex((text) => text.includes("return { entropy, peak:")) + 1;
    expect(await ask(broken, { op: "run", seed: 1, params: { scaled: 1, width: 32 }, steps: 1, every: 1, frameAt: [] })).toEqual({ ok: false, error: "undefinedName is not defined", line });
    const unparsed = await open(page, "const mechanism = {\n  init(seed {\n};");
    const syntax = await ask(unparsed, { op: "describe" });
    expect(syntax).toMatchObject({ ok: false, line: 2 });
    expect(await ask(unparsed, { op: "describe" })).toEqual(syntax);
  });

  test("[R08] a module reaches no network: every way out fails, and no request reaches any server", async ({ page, context }) => {
    await checkPage(page);
    const app = new URL(page.url()).origin;
    const requested: string[] = [];
    const outcomes = new Map<string, string>();
    const sockets: string[] = [];
    context.on("request", (request) => requested.push(request.url()));
    context.on("requestfinished", (request) => outcomes.set(request.url(), "sent"));
    context.on("requestfailed", (request) => outcomes.set(request.url(), request.failure()?.errorText ?? "failed"));
    page.on("websocket", (socket) => sockets.push(socket.url()));
    const sandbox = await open(
      page,
      probe(`
const beacon = ${JSON.stringify(beacon)};
const app = ${JSON.stringify(app)};
later("fetch", () => fetch(beacon + "/fetch"));
attempt("xhr", () => { const request = new XMLHttpRequest(); request.open("GET", beacon + "/xhr"); request.send(); return "sent"; });
attempt("websocket", () => new WebSocket(beacon.replace("http", "ws") + "/websocket"));
attempt("eventsource", () => new EventSource(beacon + "/eventsource"));
later("import", () => import(beacon + "/import.js"));
later("importApp", () => import(app + "/src/main.tsx"));
attempt("importScripts", () => importScripts(beacon + "/importScripts.js"));
attempt("sendBeacon", () => navigator.sendBeacon(beacon + "/sendBeacon", "x"));
attempt("worker", () => new Worker(beacon + "/worker.js"));
later("blobImport", () => import(URL.createObjectURL(new Blob(["export default 1;"], { type: "text/javascript" }))));
later("inheritedFetch", () => inherited("fetch").call(globalThis, beacon + "/inherited-fetch"));
attempt("inheritedImportScripts", () => inherited("importScripts").call(globalThis, beacon + "/inherited-importScripts.js"));`),
    );
    const results = await settled(sandbox);
    // The worker keeps fetch and importScripts on its prototypes too, past the driver's lockdown
    // today: the frame's policy, which the worker inherits, refuses them all the same.
    for (const name of ["fetch", "xhr", "websocket", "eventsource", "import", "importApp", "importScripts", "sendBeacon", "worker", "blobImport", "inheritedFetch", "inheritedImportScripts"]) expect(results[name], name).toMatch(/^refused: /);

    // The frame's own policy is a second wall: the frame itself can fetch, send or import nothing either.
    const fromFrame = await lastFrame(page).evaluate(async (beacon) => {
      const tried: Record<string, string> = {};
      const attempt = async (name: string, run: () => Promise<unknown>) => {
        try {
          await run();
          tried[name] = "reached";
        } catch (cause) {
          tried[name] = `refused: ${String(cause)}`;
        }
      };
      await attempt("fetch", () => fetch(`${beacon}/frame-fetch`));
      await attempt("import", () => import(`${beacon}/frame-import.js`));
      await attempt("xhr", () => {
        const request = new XMLHttpRequest();
        request.open("GET", `${beacon}/frame-xhr`);
        return new Promise((resolve, reject) => {
          request.onload = resolve;
          request.onerror = () => reject(new Error("the request failed"));
          request.send();
        });
      });
      return tried;
    }, beacon);
    for (const name of ["fetch", "import", "xhr"]) expect(fromFrame[name], name).toMatch(/^refused: /);

    await ask(sandbox, { op: "describe" });
    expect(reached).toEqual([]);
    // A module's import() and the frame's own import and XHR do begin as requests in Chromium; the
    // frame's policy stops each before it leaves the browser, and none is ever sent.
    const outside = () => requested.filter((url) => url !== `${app}/sandbox.html` && !url.startsWith("blob:")).map((url) => `${url} ${outcomes.get(url) ?? "pending"}`);
    await expect.poll(() => outside().filter((line) => !line.endsWith(" csp"))).toEqual([]);
    expect(sockets).toEqual([]);
  });

  test("[R08] a module reaches no DOM and no page, and cannot post to the page", async ({ page }) => {
    await checkPage(page);
    await page.evaluate(() => {
      const seen: string[] = [];
      (window as unknown as { seen: string[] }).seen = seen;
      window.addEventListener("message", (event) => seen.push(JSON.stringify(event.data)));
    });
    const sandbox = await open(
      page,
      probe(`
for (const name of ["document", "window", "parent", "top", "opener", "frames", "self", "postMessage", "addEventListener", "onmessage", "close", "MessageChannel", "BroadcastChannel", "location", "navigator"]) attempt(name, () => typeof globalThis[name]);
attempt("origin", () => globalThis.origin);
attempt("post", () => postMessage({ id: 1, json: "forged" }));
attempt("prototypePost", () => Object.getPrototypeOf(globalThis).postMessage({ id: 1, json: "forged" }));
attempt("classPost", () => DedicatedWorkerGlobalScope.prototype.postMessage.call(globalThis, { id: 1, json: "forged" }));
attempt("prototypes", () => { const found = []; for (let scope = Object.getPrototypeOf(globalThis); scope; scope = Object.getPrototypeOf(scope)) for (const name of ["postMessage", "addEventListener", "onmessage", "dispatchEvent"]) if (Object.getOwnPropertyDescriptor(scope, name)) found.push(name); return found.join(",") || "none"; });
// The driver's own port, a constant in the script the module is spliced into, is in the module's
// scope today; the frame drops whatever does not answer the call in flight, so nothing reaches the page.
attempt("driverPort", () => typeof __post === "function" ? (__post({ id: 999, json: "forged" }), "sent") : "absent");`),
    );
    const results = await settled(sandbox);
    for (const name of ["document", "window", "parent", "top", "opener", "frames", "self", "postMessage", "addEventListener", "onmessage", "close", "MessageChannel", "BroadcastChannel", "location", "navigator"]) expect(results[name], name).toBe("undefined");
    expect(results["origin"]).toBe("null");
    for (const name of ["post", "prototypePost", "classPost"]) expect(results[name], name).toMatch(/^refused: /);
    expect(results["prototypes"]).toBe("none");
    // Nothing the module sent reached the page: every message the page saw is the frame's own.
    const seen = await page.evaluate(() => (window as unknown as { seen: string[] }).seen);
    expect(seen.filter((message) => message.includes("forged"))).toEqual([]);

    // The frame itself is of an opaque origin: it cannot read the page, its DOM or its location.
    const fromFrame = await lastFrame(page).evaluate(() => {
      const tried: Record<string, string> = { origin: window.origin };
      const attempt = (name: string, run: () => unknown) => {
        try {
          tried[name] = `reached: ${String(run())}`;
        } catch (cause) {
          tried[name] = `refused: ${(cause as Error).name}`;
        }
      };
      attempt("parentDocument", () => window.parent.document.title);
      attempt("topLocation", () => window.top?.location.href);
      attempt("parentStorage", () => window.parent.localStorage.length);
      return tried;
    });
    expect(fromFrame).toEqual({ origin: "null", parentDocument: "refused: SecurityError", topLocation: "refused: SecurityError", parentStorage: "refused: SecurityError" });
    // And the page keeps the frame out of sight and out of the accessibility tree.
    const frame = page.locator("iframe[src='/sandbox.html']").last();
    await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    await expect(frame).toHaveAttribute("aria-hidden", "true");
    await expect(frame).toBeHidden();
  });

  test("[R08] a module reaches no storage, and the page's own is untouched", async ({ page }) => {
    await checkPage(page);
    await page.evaluate(() => localStorage.setItem("paperplay.sandbox-probe", "kept"));
    const before = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
    const sandbox = await open(
      page,
      probe(`
for (const name of ["localStorage", "sessionStorage", "indexedDB", "caches", "cookieStore"]) attempt(name, () => typeof globalThis[name]);
attempt("write", () => localStorage.setItem("paperplay.sandbox-probe", "changed"));
attempt("open", () => indexedDB.open("probe"));
attempt("inheritedOpen", () => inherited("indexedDB").open("probe"));`),
    );
    const results = await settled(sandbox);
    for (const name of ["localStorage", "sessionStorage", "indexedDB", "caches", "cookieStore"]) expect(results[name], name).toBe("undefined");
    // indexedDB is on the worker's prototypes too; an opaque origin has none to open.
    for (const name of ["write", "open", "inheritedOpen"]) expect(results[name], name).toMatch(/^refused: /);
    // An opaque origin has no storage at all: the frame's own attempts are refused too.
    const fromFrame = await lastFrame(page).evaluate(() => {
      const tried: Record<string, string> = {};
      const attempt = (name: string, run: () => unknown) => {
        try {
          tried[name] = `reached: ${String(run())}`;
        } catch (cause) {
          tried[name] = `refused: ${(cause as Error).name}`;
        }
      };
      attempt("localStorage", () => window.localStorage.length);
      attempt("sessionStorage", () => window.sessionStorage.length);
      attempt("indexedDB", () => indexedDB.open("probe"));
      attempt("cookie", () => document.cookie);
      return tried;
    });
    expect(fromFrame).toEqual({ localStorage: "refused: SecurityError", sessionStorage: "refused: SecurityError", indexedDB: "refused: SecurityError", cookie: "refused: SecurityError" });
    expect(await page.evaluate(() => JSON.stringify(Object.entries(localStorage)))).toBe(before);
  });

  test("[R08] a module has no chance and no clock, and cannot make code from strings", async ({ page }) => {
    await checkPage(page);
    const sandbox = await open(
      page,
      probe(`
attempt("random", () => Math.random());
attempt("now", () => Date.now());
attempt("date", () => new Date());
attempt("performance", () => performance.now());
attempt("crypto", () => crypto.getRandomValues(new Uint8Array(4)));
attempt("setTimeout", () => setTimeout(() => {}, 0));
attempt("eval", () => eval("1 + 1"));
attempt("indirect", () => (0, eval)("1 + 1"));
attempt("Function", () => new Function("return 1")());
attempt("constructor", () => (function () {}).constructor("return 1")());`),
    );
    const results = await settled(sandbox);
    expect(results["random"]).toMatch(/^refused: Math.random is not allowed/);
    expect(results["date"]).toMatch(/^refused: the clock is not allowed/);
    for (const name of ["now", "performance", "crypto", "setTimeout"]) expect(results[name], name).toMatch(/^refused: /);
    // The driver leaves eval alone: the frame's policy, which the worker inherits, refuses it.
    for (const name of ["eval", "indirect", "Function", "constructor"]) expect(results[name], name).toMatch(/^refused: .*unsafe-eval/);
  });

  // Chromium keeps performance, crypto and the timers on WorkerGlobalScope.prototype: the driver's
  // lockdown walks the prototypes, so a module cannot take them back from there.
  test("[R08] a module cannot take the clock, chance or a timer back from the worker's prototypes", async ({ page }) => {
    await checkPage(page);
    const sandbox = await open(
      page,
      probe(`
attempt("performance", () => inherited("performance").now());
attempt("crypto", () => inherited("crypto").getRandomValues(new Uint8Array(4)).join(","));
attempt("setTimeout", () => inherited("setTimeout").call(globalThis, () => {}, 0));`),
    );
    const results = await settled(sandbox);
    for (const name of ["performance", "crypto", "setTimeout"]) expect(results[name], name).toMatch(/^refused: /);
  });

  test("[R08] ends a call that runs past its time limit, and the sandbox with it", async ({ page }) => {
    await checkPage(page);
    const sandbox = await open(page, reference.replace("step(state, params) {", "step(state, params) { while (true) {}"));
    const timed = await sandbox.evaluate(async (box) => {
      const started = performance.now();
      const answer = await box.request({ op: "run", seed: 1, params: { scaled: 1, width: 32 }, steps: 2, every: 1, frameAt: [] });
      return { answer, ms: performance.now() - started };
    });
    expect(timed.answer).toEqual({ ok: false, error: `the call ran past its ${BROWSER_SANDBOX_LIMITS.callMs} ms`, line: null, limit: "time" });
    expect(timed.ms).toBeGreaterThanOrEqual(BROWSER_SANDBOX_LIMITS.callMs - 50);
    expect(timed.ms).toBeLessThan(BROWSER_SANDBOX_LIMITS.callMs + 1_500);
    expect(await ask(sandbox, { op: "describe" })).toEqual({ ok: false, error: "the sandbox has closed", line: null });
    // The page went on answering while the worker spun.
    expect(await page.evaluate(() => 1 + 1)).toBe(2);
  });

  test("[R08] refuses an answer past its size, the browser's stand-in for a memory limit, and closes", async ({ page }) => {
    await checkPage(page);
    const sandbox = await open(page, `const mechanism = { get title() { return "x".repeat(${BROWSER_SANDBOX_LIMITS.answerChars + 1}); }, init() {}, step() {}, measure() {}, frame() {} };`);
    expect(await ask(sandbox, { op: "describe" })).toEqual({ ok: false, error: `the answer ran past its ${BROWSER_SANDBOX_LIMITS.answerChars} characters`, line: null, limit: "memory" });
    expect(await ask(sandbox, { op: "describe" })).toEqual({ ok: false, error: "the sandbox has closed", line: null });
  });

  test("[R08] closes: every later answer says so, and the frame leaves the page", async ({ page }) => {
    await checkPage(page);
    const sandbox = await open(page, reference);
    expect(await ask(sandbox, { op: "describe" })).toMatchObject({ ok: true });
    const frames = await page.locator("iframe[src='/sandbox.html']").count();
    await sandbox.evaluate((box) => box.close());
    await expect(page.locator("iframe[src='/sandbox.html']")).toHaveCount(frames - 1);
    expect(await ask(sandbox, { op: "describe" })).toEqual({ ok: false, error: "the sandbox has closed", line: null });
  });
});

test.describe("[R08] the browser sandbox under the deploy's headers (ADR-0058)", () => {
  test.use({ baseURL: BUILT });
  const own = deploy.headers.find((rule) => rule.source === "/sandbox.html")?.headers ?? [];

  test("[R08] serves the frame its own policy, which only the app may frame", async ({ page }) => {
    expect(own.map((header) => header.key)).toContain("Content-Security-Policy");
    const response = await page.goto("/sandbox.html");
    const headers = response?.headers() ?? {};
    for (const { key, value } of own) expect(headers[key.toLowerCase()], key).toBe(value);
    expect(headers["content-security-policy"]).toContain("connect-src 'none'");
  });

  test("[R08] runs a module in the frame from a page of the built app, with no policy violation, and the frame fetches nothing", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto("/library");
    await page.evaluate(() => {
      const seen: string[] = [];
      (window as unknown as { violations: string[] }).violations = seen;
      document.addEventListener("securitypolicyviolation", (event) => seen.push(`${event.violatedDirective} blocked ${event.blockedURI}`));
    });
    const answer = await page.evaluate(
      async ({ script, limits }) => {
        const frame = document.createElement("iframe");
        frame.setAttribute("sandbox", "allow-scripts");
        frame.src = "/sandbox.html";
        const message = (test: (data: Record<string, unknown>) => boolean) =>
          new Promise<Record<string, unknown>>((resolve) => {
            const listen = (event: MessageEvent) => {
              const data = event.data as Record<string, unknown> | null;
              if (event.source !== frame.contentWindow || !data || !test(data)) return;
              window.removeEventListener("message", listen);
              resolve(data);
            };
            window.addEventListener("message", listen);
          });
        const ready = message((data) => data["ready"] === true);
        document.body.append(frame);
        await ready;
        frame.contentWindow?.postMessage({ load: script, ...limits }, "*");
        const answered = message((data) => data["id"] === 1);
        frame.contentWindow?.postMessage({ id: 1, json: JSON.stringify({ op: "describe" }) }, "*");
        return JSON.parse(String((await answered)["json"])) as { ok: boolean; manifest?: { title: string } };
      },
      { script: workerScript(reference), limits: BROWSER_SANDBOX_LIMITS },
    );
    expect(answer).toMatchObject({ ok: true, manifest: { title: "One query attending over a row of words" } });
    const fetched = await lastFrame(page).evaluate(async (beacon) => {
      try {
        await fetch(`${beacon}/built-frame-fetch`);
        return "reached";
      } catch (cause) {
        return `refused: ${String(cause)}`;
      }
    }, beacon);
    expect(fetched).toMatch(/^refused: /);
    expect(reached).toEqual([]);
    // The frame's refused fetch is its own violation, in its own document; the page has none, and no other error.
    expect(await page.evaluate(() => (window as unknown as { violations: string[] }).violations)).toEqual([]);
    expect(errors.filter((text) => !text.includes("built-frame-fetch"))).toEqual([]);
  });
});
