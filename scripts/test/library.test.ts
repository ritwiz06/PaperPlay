import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The library's index is written from the fixtures by scripts/library.ts (ADR-0049), so the page
// never drifts from the worlds the build holds; each world's picture is committed beside it.
const root = join(import.meta.dirname, "..", "..");
const path = join(root, "apps", "web", "src", "library", "worlds.json");
const index = JSON.parse(readFileSync(path, "utf8")) as { worlds: { id: string; route: string | null; madeBy: string; status: string; thumbnail: string; definitional: number[]; retired: { reason: string } | null }[] };

describe("the library's index", () => {
  it("is exactly what its script writes from the fixtures, byte for byte", () => {
    const fresh = execFileSync(process.execPath, [join(root, "scripts", "library.ts"), "--print"], { cwd: root, encoding: "utf8" });
    expect(fresh).toBe(readFileSync(path, "utf8"));
  });

  it("lists the three hand-made worlds and every generated one, each with its picture in the public folder", () => {
    expect(index.worlds.filter((world) => world.madeBy === "hand").map((world) => world.route)).toEqual(["/world/hook", "/world/epidemic", "/world/momentum"]);
    // A generated world plays on its route; a retired one has none, and says why (ADR-0051).
    expect(index.worlds.filter((world) => world.madeBy === "pipeline").every((world) => (world.status === "generated" && world.route === `/world/generated/${world.id}`) || (world.status === "retired" && world.route === null && (world.retired?.reason.length ?? 0) > 0))).toBe(true);
    expect(index.worlds.filter((world) => world.status === "retired").map((world) => world.id)).toEqual(["pmc-PMC12334037-2026-10-18", "pmc-PMC12334037-2026-10-17", "pmc-PMC12334037"]);
    for (const world of index.worlds) {
      const picture = join(root, "apps", "web", "public", world.thumbnail);
      expect(existsSync(picture), `${world.id}: run npm run library:thumbnails`).toBe(true);
      expect(statSync(picture).size, world.id).toBeLessThan(120 * 1024);
    }
  });
});
