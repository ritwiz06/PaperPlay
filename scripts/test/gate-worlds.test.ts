import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { worldSpec } from "../../packages/contracts/test/examples.ts";
import { reviewProblems } from "../gate/worlds.ts";

const root = join(import.meta.dirname, "..", "..");
const path = "fixtures/worldspecs/flocking-reference.json";
const reference = JSON.parse(readFileSync(join(root, path), "utf8")) as Record<string, unknown>;
const gates = JSON.parse(readFileSync(join(root, "gates.json"), "utf8")) as { gates: Record<string, { reviewedWorlds?: string[] }> };

describe("[R03] a gate's reviewed worlds", () => {
  it("G2 requires the flocking world reviewed", () => {
    expect(gates.gates.G2?.reviewedWorlds).toEqual([path]);
    expect(gates.gates.G1?.reviewedWorlds).toBeUndefined();
  });

  it("refuses the flocking world while it is a draft, naming its placeholders and pending source", () => {
    const problems = reviewProblems(path, reference);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/is a draft: it holds \d+ placeholder anchors, and its source is pending/);
  });

  it("passes a reviewed spec, whose anchors are all real", () => {
    expect(reviewProblems("example.json", worldSpec())).toEqual([]);
  });

  it("refuses a spec that does not parse, and a draft even with every anchor real", () => {
    expect(reviewProblems(path, { ...reference, schemaVersion: "worldspec/1" })[0]).toMatch(/is not a valid WorldSpec/);
    expect(reviewProblems(path, { ...reference, status: "reviewed" })[0]).toMatch(/is not a valid WorldSpec/);
  });
});
