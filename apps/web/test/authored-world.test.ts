import { describe, expect, it } from "vitest";
import { FLOCKING, sessionOptionsFor } from "../src/world/authored-world.ts";
import { HOOK_SEED } from "../src/world/local-world.ts";

describe("the flocking world as authored", () => {
  it("opens every level on its own opening seed, the one ADR-0003's rule chose", () => {
    expect(FLOCKING.openingSeed).toBe(HOOK_SEED);
    for (const level of FLOCKING.levels) expect(sessionOptionsFor(level, false).seed).toBe(FLOCKING.openingSeed);
  });
});
