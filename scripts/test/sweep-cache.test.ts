import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { CODE, inputHash, sweep } from "../cache/sweeps.ts";

// The sweeps' cache (ADR-0051): a hit is checked, not skipped. The cache vouches for a sweep only
// when the inputs hashed afresh and the committed output hashed afresh are both the ones it
// recorded; PAPERPLAY_SWEEP_CACHE=off, as the nightly run sets, runs every sweep.
const root = join(import.meta.dirname, "..", "..");
const record = readFileSync(join(root, "eval", "sweeps", "levels-kermack-mckendrick-1927.md"), "utf8");
const INPUTS = [...CODE, "scripts/levels.ts", "scripts/sweep", "fixtures/worldspecs"];

describe("the sweeps' cache", () => {
  // A cache file of the test's own, so the test holds the rules whatever the committed cache holds.
  const folder = mkdtempSync(join(tmpdir(), "paperplay-sweeps-"));
  process.env["PAPERPLAY_SWEEP_CACHE_FILE"] = join(folder, "cache.json");
  afterEach(() => {
    delete process.env["PAPERPLAY_SWEEP_CACHE"];
  });
  afterAll(() => {
    delete process.env["PAPERPLAY_SWEEP_CACHE_FILE"];
    rmSync(folder, { recursive: true, force: true });
  });

  it("hashes every file under its inputs, by path and bytes, whatever order they are named in", () => {
    expect(inputHash(["scripts/levels.ts", "scripts/sweep"])).toBe(inputHash(["scripts/sweep", "scripts/levels.ts"]));
    expect(inputHash(["scripts/levels.ts"])).not.toBe(inputHash(["scripts/sweep"]));
    // What a hash is told to skip changes nothing it covers, as the atlas leaves out pages that are not worlds.
    expect(inputHash(["scripts/sweep"], /group-measure/)).not.toBe(inputHash(["scripts/sweep"]));
    expect(inputHash(["scripts/sweep"], /no-such-file/)).toBe(inputHash(["scripts/sweep"]));
  });

  it("trusts the committed output only when its hash and the inputs' are the ones recorded", async () => {
    let runs = 0;
    const run = () => {
      runs++;
      return record;
    };
    // Recorded, as npm run sweeps:cache records it, then vouched for without a run.
    process.env["PAPERPLAY_SWEEP_CACHE"] = "write";
    await sweep("levels-kermack-mckendrick-1927", INPUTS, record, run);
    delete process.env["PAPERPLAY_SWEEP_CACHE"];
    runs = 0;
    expect(await sweep("levels-kermack-mckendrick-1927", INPUTS, record, run)).toEqual({ output: record, cached: true });
    expect(runs).toBe(0);
    // A committed output that is not the one recorded is never vouched for.
    expect((await sweep("levels-kermack-mckendrick-1927", INPUTS, `${record}\n`, run)).cached).toBe(false);
    // Nor are inputs other than those hashed, nor a sweep the cache has never seen.
    expect((await sweep("levels-kermack-mckendrick-1927", ["scripts/levels.ts"], record, run)).cached).toBe(false);
    expect((await sweep("a-sweep-never-cached", INPUTS, record, run)).cached).toBe(false);
    expect(runs).toBe(3);
  });

  it("runs every sweep from scratch when the cache is off, as the nightly run sets it", async () => {
    process.env["PAPERPLAY_SWEEP_CACHE"] = "off";
    expect(await sweep("levels-kermack-mckendrick-1927", INPUTS, record, () => "a fresh run")).toEqual({ output: "a fresh run", cached: false });
  });
});
