import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MechanismManifest } from "@paperplay/contracts";
import { describe, expect, it } from "vitest";
import { checkMechanism } from "../src/mechanism/checks.ts";
import { judgeMechanismCandidates, sweepMechanism, whatIfsOf } from "../src/mechanism/candidates.ts";

// A generated mechanism's candidate levels (ADR-0058's amendment): each What-if changes a parameter
// as the paper means it. Taking the √dk scaling away is dividing by 1, so a scaling module's What-if
// sets its divisor to 1, never past it to 0.5, and its brief says so; a hook is offered from those.

const root = join(import.meta.dirname, "..", "..", "..");
const reference = readFileSync(join(root, "fixtures", "mechanisms", "row-attention.js"), "utf8");

const manifest = MechanismManifest.parse({
  title: "Attention's scaling",
  kit: "towers",
  params: [
    { id: "divisor", label: "What the dot products are divided by", unit: "", min: 0.5, max: 16, default: 8, paper: { normal: 8, without: 1, meaning: "dividing by 1 instead of by the square root of d_k" } },
    { id: "heads", label: "Heads", unit: "", min: 1, max: 8, default: 8, integer: true, paper: { normal: 8, without: null, meaning: "the paper's heads cannot be taken away" } },
    { id: "noise", label: "Noise", unit: "", min: 0, max: 1, default: 0.5 },
  ],
  measurements: [{ id: "peak", label: "Peak weight", unit: "", meaning: "The largest share of attention." }],
  steps: 10,
  stepLabel: "step",
});

describe("[R08] a generated mechanism's What-ifs (ADR-0058's amendment)", () => {
  it("take a parameter away as the paper means it, never past that point, and keep every end of a range otherwise", () => {
    expect(whatIfsOf(manifest).map((whatIf) => [whatIf.key, whatIf.away])).toEqual([
      ["divisor=1", true],
      ["divisor=16", false],
      ["heads=1", false],
      ["noise=0", false],
      ["noise=1", false],
    ]);
  });

  it("say in a candidate's brief when its What-if takes a parameter away as the paper means, and offer those as a hook first", async () => {
    const report = await checkMechanism(reference);
    const module = report.manifest!;
    const judged = judgeMechanismCandidates(module, await sweepMechanism(reference, module));
    const away = judged.passing.filter((candidate) => judged.away.includes(candidate.id));
    expect(away.length).toBeGreaterThan(0);
    expect(away.every((candidate) => candidate.brief.includes("taken away, as the paper means it (the dot products divided by 1 instead of by the square root of the width)"))).toBe(true);
    expect(judged.passing.filter((candidate) => !judged.away.includes(candidate.id)).every((candidate) => !candidate.brief.includes("taken away"))).toBe(true);
  });
});
