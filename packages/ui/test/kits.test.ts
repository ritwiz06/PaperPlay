import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { valleyStage } from "../src/stage-core/kits/valley/index.ts";
import { THREE_KITS } from "../src/three-adapter/kits/index.ts";

// Scene kits (ADR-0026): each kit's halves agree on its id, and its Three.js half, like the base
// adapter, can draw only what a frame description tells it.

const STAGE_KITS = [valleyStage];

/** Every TypeScript file under a folder, its subfolders included. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith(".ts") ? [path] : [];
  });
}

describe("scene kits", () => {
  it("register a Three.js half under each pure half's id, and no Three.js half without one", () => {
    expect(Object.keys(THREE_KITS).sort()).toEqual(STAGE_KITS.map((kit) => kit.id).sort());
    for (const kit of STAGE_KITS) expect(THREE_KITS[kit.id]?.id).toBe(kit.id);
  });

  it("import no simulation code in any kit's Three.js half", () => {
    const files = sources(join(import.meta.dirname, "..", "src", "three-adapter", "kits"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(readFileSync(file, "utf8"), file).not.toMatch(/@paperplay\/(primitives|contracts)/);
  });

  it("say, for each kit, why its world cannot be drawn without WebGL and what carries on when the drawing is lost", () => {
    for (const three of Object.values(THREE_KITS)) {
      expect(three.words.fallback.length).toBeGreaterThan(0);
      expect(three.words.lost).toMatch(/carry on|carries on/);
    }
  });
});
