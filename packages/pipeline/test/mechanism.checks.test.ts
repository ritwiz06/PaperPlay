import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkMechanism, feedbackOf, type MechanismCheckName } from "../src/mechanism/checks.ts";

// The deterministic checks a generated mechanism must pass (ADR-0058), on the hand-written
// reference module and on copies of it broken one way each: every check catches its own fault
// and says so in words a writer can act on.

const root = join(import.meta.dirname, "..", "..", "..");
const reference = readFileSync(join(root, "fixtures", "mechanisms", "row-attention.js"), "utf8");

const broken = (from: string, to: string): string => {
  if (!reference.includes(from)) throw new Error(`the reference has no ${from}`);
  return reference.replace(from, to);
};
const failed = (report: Awaited<ReturnType<typeof checkMechanism>>): MechanismCheckName[] => report.checks.filter((check) => !check.passed).map((check) => check.name);

describe("[R08] the checks on a generated mechanism (ADR-0058)", () => {
  it("pass the reference module, every one", async () => {
    const report = await checkMechanism(reference);
    expect(failed(report)).toEqual([]);
    expect(report.checks.map((check) => check.name)).toEqual(["loads", "deterministic", "ranges", "finite", "responds", "frames", "speed"]);
    expect(report.manifest?.kit).toBe("towers");
    expect(report.stepMs).toBeLessThan(8);
    expect(feedbackOf(report)).toBe("");
  });

  it("refuse a module that does not load, a manifest that does not parse, and one too long", async () => {
    expect(failed(await checkMechanism("const mechanism = {"))).toEqual(["loads"]);
    const manifest = await checkMechanism(broken('kit: "towers"', 'kit: "spheres"'));
    expect(failed(manifest)).toEqual(["loads"]);
    expect(feedbackOf(manifest)).toContain("the manifest's kit");
    expect(failed(await checkMechanism(`${reference}\n${"// padding\n".repeat(3_000)}`))).toEqual(["loads"]);
  });

  it("catch a module whose runs differ on one seed", async () => {
    const report = await checkMechanism(broken("const mechanism = {", "let calls = 0;\nconst mechanism = {").replace("return { entropy, peak: Math.max(...weights) };", "calls += 1;\n    return { entropy: entropy + calls, peak: Math.max(...weights) };"));
    expect(failed(report)).toContain("deterministic");
  });

  it("catch a module that fails at one end of a range, and one that measures NaN", async () => {
    const ends = await checkMechanism(broken("const width = params.width;", 'const width = params.width;\n    if (width > 60) throw new Error("too wide");'));
    expect(failed(ends)).toContain("ranges");
    expect(feedbackOf(ends)).toContain("width at 64: line");
    const nan = await checkMechanism(broken("return { entropy, peak: Math.max(...weights) };", "return { entropy: 0 / 0, peak: Math.max(...weights) };"));
    expect(failed(nan)).toContain("finite");
    expect(feedbackOf(nan)).toContain("entropy is NaN at step 0");
  });

  it("catch a parameter that changes nothing measured", async () => {
    const report = await checkMechanism(broken("const width = params.width;", "const width = 32;"));
    expect(failed(report)).toEqual(["responds"]);
    expect(feedbackOf(report)).toContain("moving width from 4 to 64 changes no measurement");
  });

  it("catch a frame outside its kit, and a slow step", async () => {
    const frame = await checkMechanism(broken("height: weight,", "height: weight + 1,"));
    expect(failed(frame)).toEqual(["frames"]);
    expect(feedbackOf(frame)).toMatch(/towers\.\d+\.height/);
    const slow = await checkMechanism(broken("frame(state) {", "frame(state) {\n    for (let i = 0; i < 4e7; i += 1) state.at += 0;"));
    expect(failed(slow)).toContain("speed");
  }, 30_000);
});
