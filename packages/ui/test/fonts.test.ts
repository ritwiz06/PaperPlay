import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(import.meta.dirname, "..", "src", "fonts");
const css = readFileSync(join(dir, "fonts.css"), "utf8");
const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body = ""]) => ({
  family: /font-family:\s*"([^"]+)"/.exec(body)?.[1],
  weight: /font-weight:\s*(\d+)/.exec(body)?.[1],
  style: /font-style:\s*(\w+)/.exec(body)?.[1],
  urls: [...body.matchAll(/url\(([^)]*)\)/g)].map(([, url = ""]) => url.replace(/^["']|["']$/g, "")),
}));
const fileNames = (url: string) => url.replace(/^\.\//, "");

describe("self-hosted fonts (ADR-0002)", () => {
  it("declares exactly the faces in use: Fredoka 400 and 600, Literata 400, upright", () => {
    const declared = [...new Set(faces.map((face) => `${face.family} ${face.weight} ${face.style}`))].sort();
    expect(declared).toEqual(["Fredoka 400 normal", "Fredoka 600 normal", "Literata 400 normal"]);
  });

  it("points every face at a woff2 file beside it, never at another origin", () => {
    for (const face of faces) {
      expect(face.urls.length, `${face.family} ${face.weight}`).toBeGreaterThan(0);
      for (const url of face.urls) {
        expect(url).toMatch(/^\.\/[\w-]+\.woff2$/);
        expect(readFileSync(join(dir, fileNames(url))).subarray(0, 4).toString("latin1"), url).toBe("wOF2");
      }
    }
  });

  it("holds no font file that no face uses", () => {
    const used = [...new Set(faces.flatMap((face) => face.urls.map(fileNames)))].sort();
    const files = readdirSync(dir).filter((name) => /\.(woff2?|ttf|otf)$/i.test(name)).sort();
    expect(files).toEqual(used);
  });

  it("carries the licence of every family it ships", () => {
    for (const family of new Set(faces.map((face) => face.family?.toLowerCase()))) {
      expect(readFileSync(join(dir, `OFL-${family}.txt`), "utf8")).toContain("SIL Open Font License, Version 1.1");
    }
  });

  it("records the provenance checksum of every file, and the bytes match it", () => {
    const readme = readFileSync(join(dir, "README.md"), "utf8");
    const recorded = new Map([...readme.matchAll(/^\| `([\w-]+\.woff2)` \|.*\| `([0-9a-f]{64})` \|$/gm)].map(([, name = "", sha = ""]) => [name, sha]));
    const files = readdirSync(dir).filter((name) => name.endsWith(".woff2"));
    expect([...recorded.keys()].sort()).toEqual(files.sort());
    for (const name of files) {
      expect(createHash("sha256").update(readFileSync(join(dir, name))).digest("hex"), name).toBe(recorded.get(name));
    }
  });
});
