import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openSandbox, type SandboxAnswer } from "../src/mechanism/sandbox.ts";

// The Node sandbox of a generated mechanism (ADR-0058): a module reaches nothing but JavaScript's
// own objects. Each probe below tries one way out and reports what happened through its title,
// read by describe; a sandbox that let any probe through would fail here.

const root = join(import.meta.dirname, "..", "..", "..");
const reference = readFileSync(join(root, "fixtures", "mechanisms", "row-attention.js"), "utf8");

/** A module that runs `probes` at load and reports their results as its title. */
const probe = (probes: string): string => `
const results = {};
const attempt = (name, run) => { try { results[name] = String(run()); } catch (cause) { results[name] = "refused: " + (cause && cause.message); } };
${probes}
const mechanism = {
  get title() { return JSON.stringify(results); },
  kit: "charts", params: [], measurements: [], steps: 1, stepLabel: "step",
  init() { return {}; }, step(state) { return state; }, measure() { return {}; }, frame() { return { bars: [] }; },
};`;

/** An answer that must have succeeded, narrowed so its fields can be read. */
const okay = (answer: SandboxAnswer): Extract<SandboxAnswer, { ok: true }> => {
  if (!answer.ok) throw new Error(answer.error);
  return answer;
};

const titleOf = async (source: string): Promise<Record<string, string>> => {
  const sandbox = openSandbox(source);
  try {
    const answer = await sandbox.request({ op: "describe" });
    if (!answer.ok) throw new Error(answer.error);
    return JSON.parse((answer["manifest"] as { title: string }).title) as Record<string, string>;
  } finally {
    await sandbox.close();
  }
};

describe("[R08] the Node sandbox of a generated mechanism (ADR-0058)", () => {
  it("runs the reference module: its manifest, a run from a seed, and a run kept and stepped", async () => {
    const sandbox = openSandbox(reference);
    try {
      const described = await sandbox.request({ op: "describe" });
      expect(described.ok && (described["manifest"] as { kit: string }).kit).toBe("towers");
      const run = okay(await sandbox.request({ op: "run", seed: 3, params: { scaled: 1, width: 32 }, steps: 8, every: 1, frameAt: [0, 8] }));
      expect((run["measures"] as number[][]).length).toBe(9);
      expect(Object.keys(run["frames"] as object)).toEqual(["0", "8"]);
      okay(await sandbox.request({ op: "start", run: "a", seed: 3, params: { scaled: 1, width: 32 } }));
      const advanced = okay(await sandbox.request({ op: "advance", run: "a", steps: 8, params: { scaled: 1, width: 32 } }));
      expect(advanced["step"]).toBe(8);
      expect(advanced["measure"]).toEqual((run["measures"] as number[][])[8]);
    } finally {
      await sandbox.close();
    }
  });

  it("holds no host object: no process, require, module, fetch, Buffer, timers or console output", async () => {
    const results = await titleOf(
      probe(`for (const name of ["process", "require", "module", "exports", "fetch", "Buffer", "setTimeout", "setImmediate", "queueMicrotask", "structuredClone", "WebAssembly", "SharedArrayBuffer"]) attempt(name, () => typeof globalThis[name]);`),
    );
    for (const name of ["process", "require", "module", "exports", "fetch", "Buffer", "setTimeout", "setImmediate", "queueMicrotask", "structuredClone", "WebAssembly", "SharedArrayBuffer"]) expect(results[name], name).toBe("undefined");
  });

  it("refuses code made from strings, so no constructor chain reaches the host", async () => {
    const results = await titleOf(
      probe(`
attempt("constructor", () => this === undefined ? "strict" : this.constructor.constructor("return process")());
attempt("function", () => (function () {}).constructor("return process")());
attempt("Function", () => new Function("return 1")());
attempt("eval", () => eval("1 + 1"));
attempt("indirect", () => (0, eval)("1 + 1"));`),
    );
    expect(results["function"]).toMatch(/^refused: Code generation from strings disallowed/);
    expect(results["Function"]).toMatch(/^refused: Code generation from strings disallowed/);
    expect(results["eval"]).toMatch(/^refused/);
    expect(results["indirect"]).toMatch(/^refused/);
  });

  it("refuses to import anything, the file system and the network included", async () => {
    const results = await titleOf(
      probe(`
results.fs = "pending"; results.http = "pending";
import("node:fs").then(() => { results.fs = "imported"; }, (cause) => { results.fs = "refused: " + cause.message; });
import("https://example.com/x.js").then(() => { results.http = "imported"; }, (cause) => { results.http = "refused: " + cause.message; });`),
    );
    expect(results["fs"]).toMatch(/^refused/);
    expect(results["http"]).toMatch(/^refused/);
  });

  it("takes chance and the clock away: Math.random and Date refuse, so a module's runs come from its seed", async () => {
    const results = await titleOf(probe(`attempt("random", () => Math.random()); attempt("date", () => new Date()); attempt("now", () => Date.now());`));
    expect(results["random"]).toMatch(/^refused: Math.random is not allowed/);
    expect(results["date"]).toMatch(/^refused: the clock is not allowed/);
    expect(results["now"]).toMatch(/^refused/);
  });

  it("keeps a module's changes to built-ins inside its own context", async () => {
    await titleOf(probe(`Object.prototype.polluted = "yes"; Array.prototype.map = function () { return []; }; attempt("done", () => "done");`));
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    expect([1, 2].map((x) => x * 2)).toEqual([2, 4]);
  });

  it("stops a call at its time limit, and a module that fills its heap at its memory limit", async () => {
    const hang = openSandbox(reference.replace("step(state, params) {", "step(state, params) { while (true) {}"), { callMs: 300, heapMb: 64 });
    const hung = await hang.request({ op: "run", seed: 1, params: { scaled: 1, width: 32 }, steps: 2, every: 1, frameAt: [] });
    expect(hung).toMatchObject({ ok: false, limit: "time" });
    await hang.close();
    const hog = openSandbox(`const kept = []; while (true) kept.push(new Array(100000).fill(Math.PI)); const mechanism = {};`, { callMs: 10_000, heapMb: 32 });
    const full = await hog.request({ op: "describe" });
    expect(full).toMatchObject({ ok: false, limit: "memory" });
    await hog.close();
  }, 30_000);

  it("reports a module's error on its own line, and a syntax error too", async () => {
    const broken = openSandbox(reference.replace("return { entropy, peak: Math.max(...weights) };", "return { entropy, peak: undefinedName };"));
    const answer = await broken.request({ op: "run", seed: 1, params: { scaled: 1, width: 32 }, steps: 1, every: 1, frameAt: [] });
    await broken.close();
    const line = reference.split("\n").findIndex((text) => text.includes("return { entropy, peak:")) + 1;
    expect(answer).toMatchObject({ ok: false, error: "undefinedName is not defined", line });
    const unparsed = openSandbox("const mechanism = {\n  init(seed {\n};");
    const syntax = await unparsed.request({ op: "describe" });
    await unparsed.close();
    expect(syntax).toMatchObject({ ok: false, line: 2 });
  });
});
