import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { moduleLine } from "@paperplay/primitives/mechanism";
import { describe, expect, it } from "vitest";
import { readAnswer, workerScript } from "../src/mechanism/sandbox.ts";

// The browser's mechanism sandbox (ADR-0058), its pure parts: the frame's policy names the frame's
// one script by its hash, in the page and in the deploy's header alike, and the page reads each
// answer as data. tests/e2e/sandbox.spec.ts proves the isolation itself, in a browser.

const root = join(import.meta.dirname, "..", "..", "..");
const html = readFileSync(join(root, "apps", "web", "public", "sandbox.html"), "utf8");
const deploy = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")) as { headers: { source: string; headers: { key: string; value: string }[] }[] };

const directives = (policy: string): Map<string, string> => new Map(policy.split(";").map((part) => part.trim().split(/\s+/)).map(([name = "", ...values]) => [name, values.join(" ")]));

describe("[R08] the browser sandbox's frame", () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1] ?? "");
  const hash = `'sha256-${createHash("sha256").update(scripts[0] ?? "", "utf8").digest("base64")}'`;
  const meta = directives(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? "");
  const header = directives(deploy.headers.find((rule) => rule.source === "/sandbox.html")?.headers.find((entry) => entry.key === "Content-Security-Policy")?.value ?? "");

  it("has one inline script and no other, which both of its policies name by its hash", () => {
    expect(scripts).toHaveLength(1);
    expect(html).not.toMatch(/<script[^>]*\ssrc=/);
    expect(meta.get("script-src")).toBe(hash);
    expect(header.get("script-src")).toBe(hash);
  });

  it("allows no network, no other source and a worker from a blob alone, in the page and in the deploy's header", () => {
    for (const policy of [meta, header]) {
      expect(policy.get("default-src")).toBe("'none'");
      expect(policy.get("connect-src")).toBe("'none'");
      expect(policy.get("worker-src")).toBe("blob:");
      expect([...policy.values()].join(" ")).not.toMatch(/unsafe-eval|unsafe-inline|\*/);
    }
    // What a meta tag cannot carry, the header does: who may frame it, and its sandbox even unframed.
    expect(header.get("frame-ancestors")).toBe("'self'");
    expect(header.get("sandbox")).toBe("allow-scripts");
  });

  it("is left out of the app's own headers, whose frame-ancestors 'none' would refuse it", () => {
    const covering = deploy.headers.filter((rule) => new RegExp(`^${rule.source}$`).test("/sandbox.html"));
    expect(covering.map((rule) => rule.source)).toEqual(["/sandbox.html"]);
    expect(covering[0]?.headers.find((entry) => entry.key === "X-Frame-Options")?.value).toBe("SAMEORIGIN");
  });
});

describe("[R08] the browser sandbox's answers", () => {
  const offset = moduleLine("worker") - 1;

  it("gives the worker the driver around the module, named for the module's file", () => {
    const script = workerScript("const mechanism = {};");
    expect(script.split("\n")[moduleLine("worker") - 1]).toBe("const mechanism = {};");
    expect(script.trimEnd().endsWith("//# sourceURL=mechanism.js")).toBe(true);
  });

  it("revives the numbers the driver marked, and keeps an answer's other values as they are", () => {
    const answer = readAnswer(JSON.stringify({ ok: true, measure: [{ nonFinite: "NaN" }, { nonFinite: "Infinity" }, 0.5], frame: { nonFinite: "x", other: 1 } }), 10);
    expect(answer).toEqual({ ok: true, measure: [NaN, Infinity, 0.5], frame: { nonFinite: "x", other: 1 } });
  });

  it("moves a failure's line to the module's own, and drops a line that falls in the driver", () => {
    expect(readAnswer(JSON.stringify({ ok: false, error: "x is not defined", line: offset + 4 }), 10)).toEqual({ ok: false, error: "x is not defined", line: 4 });
    expect(readAnswer(JSON.stringify({ ok: false, error: "in the driver", line: offset }), 10)).toMatchObject({ line: null });
    expect(readAnswer(JSON.stringify({ ok: false, error: "in the driver", line: offset + 11 }), 10)).toMatchObject({ line: null });
    expect(readAnswer(JSON.stringify({ ok: false, error: "too long", line: null, limit: "time" }), 10)).toEqual({ ok: false, error: "too long", line: null, limit: "time" });
  });

  it("reads an answer that is not JSON, or not an answer, as a failure", () => {
    expect(readAnswer("{", 10)).toEqual({ ok: false, error: "the sandbox's answer was not JSON", line: null });
    expect(readAnswer("[1]", 10)).toEqual({ ok: false, error: "the sandbox's answer was not an answer", line: null });
    expect(readAnswer("null", 10)).toEqual({ ok: false, error: "the sandbox's answer was not an answer", line: null });
  });
});
