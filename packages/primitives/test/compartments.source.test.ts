// The deploy's Content-Security-Policy has no unsafe-eval, and generated models are data: the
// compartment solver must interpret them with closures, never by turning text into code.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SOURCE = new URL("../src/compartments/", import.meta.url);
const FORBIDDEN = [/\beval\s*\(/, /\bnew\s+Function\b/, /\bFunction\s*\(/];

describe("[R01] compartments.ode source", () => {
  it("holds the files it is meant to, so the scan below reads them all", () => {
    expect(readdirSync(SOURCE).sort()).toEqual(["MODEL.md", "checks.ts", "expr.ts", "index.ts", "polynomial.ts", "primitive.ts", "rk4.ts", "units.ts"]);
  });

  it("would catch eval and the Function constructor if they were there", () => {
    for (const text of ["eval(code)", "globalThis.eval (code)", "new Function('x', body)", "Function('return 1')()"]) {
      expect(FORBIDDEN.some((pattern) => pattern.test(text)), text).toBe(true);
    }
  });

  it("contains no eval and no Function constructor in any file", () => {
    const found = readdirSync(SOURCE).flatMap((file) => {
      const text = readFileSync(new URL(file, SOURCE), "utf8");
      return FORBIDDEN.filter((pattern) => pattern.test(text)).map((pattern) => `${file}: ${String(pattern)}`);
    });
    expect(found).toEqual([]);
  });
});
