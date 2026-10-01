import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tokens } from "../src/tokens.ts";

describe("palette tokens", () => {
  it("are the same in the components' CSS as in tokens.ts, so the page and the stage share one palette", () => {
    const css = readFileSync(join(import.meta.dirname, "..", "src", "react", "components.css"), "utf8");
    const root = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    const declared = Object.fromEntries([...root.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/g)].map(([, name = "", value = ""]) => [name, value]));
    expect(declared).toEqual(tokens);
  });
});
