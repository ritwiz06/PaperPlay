/**
 * /check/sandbox, on a development server only (ADR-0058): the mechanism sandbox in this browser,
 * for the tests that prove what a module cannot reach (tests/e2e/sandbox.spec.ts). It runs the
 * reference module once, to show the sandbox working, and lends a test `window.paperplaySandbox`
 * to open sandboxes of its own. The production build holds none of it.
 */
import { useEffect, useState } from "react";
import reference from "../../../../fixtures/mechanisms/row-attention.js?raw";
import { openBrowserSandbox, type BrowserSandbox, type BrowserSandboxLimits } from "../mechanism/sandbox.ts";

declare global {
  interface Window {
    paperplaySandbox?: { open(source: string, limits?: BrowserSandboxLimits): BrowserSandbox };
  }
}

export function SandboxCheck() {
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    window.paperplaySandbox = { open: openBrowserSandbox };
    const sandbox = openBrowserSandbox(reference);
    void sandbox.request({ op: "describe" }).then((answer) => {
      if (live) setShown(answer.ok ? String((answer["manifest"] as { title?: unknown }).title) : `failed: ${answer.error}`);
    });
    return () => {
      live = false;
      void sandbox.close();
      delete window.paperplaySandbox;
    };
  }, []);
  return (
    <main className="page">
      <h1>The mechanism sandbox in this browser</h1>
      <p>
        The reference module, described from inside its sandbox: <output data-ready={shown === null ? "" : "yes"}>{shown ?? "starting"}</output>
      </p>
    </main>
  );
}
