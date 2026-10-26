import { readFileSync } from "node:fs";
import { join } from "node:path";
import { attentionToy, readWeights, WeightsManifest } from "@paperplay/primitives/attention";
import { describe, expect, it } from "vitest";
import { ATTENTION_HOLDS, attentionCandidates } from "../src/candidates/index.ts";

// The attention family's candidate levels come from code (ADR-0054, ADR-0055): each of the paper's
// switches, judged by the primitive over 20 seeds, kept only where its claim holds on 16.

describe("the attention family's candidate levels", () => {
  const candidates = attentionCandidates({ ...attentionToy.defaults, dModel: 16, heads: 4 }, undefined);
  const find = (setting: string, measure: string) => candidates.find((candidate) => candidate.level.whatIf.setting === setting && candidate.level.measure === measure);

  it("finds the paper's own claims, each holding on at least 16 of 20 seeds", () => {
    expect(candidates.length).toBeGreaterThan(3);
    for (const candidate of candidates) expect(candidate.holds ?? 0).toBeGreaterThanOrEqual(ATTENTION_HOLDS);
    // §3.2.1: without the scaling, the logits spread wider.
    expect(find("scaled", "logitSpread")?.level).toMatchObject({ relation: "higher", section: "§3.2.1" });
    // §3.5: without positional encoding, the reversed input's output is the output reversed.
    expect(find("positional", "shuffleGap")?.level).toMatchObject({ relation: "lower", section: "§3.5" });
    // §3.2.3: with the mask, no attention reaches a later word.
    expect(find("causal", "futureWeight")?.level).toMatchObject({ relation: "lower", section: "§3.2.3" });
    // Table 1: a recurrent layer's path between two words is longer.
    expect(find("recurrent", "meanPathLength")?.level).toMatchObject({ relation: "higher", section: "§4, Table 1" });
  });

  it("writes each candidate's line for the planner with its numbers and its section", () => {
    expect(find("causal", "futureWeight")?.brief).toMatch(/^a\d+ \(§3\.2\.3\): What-if: the decoder's mask on, so no word attends to a later one; measures the share of attention on later tokens \(futureWeight\): [\d.e-]+ now, 0 in the What-if, lower by more than [\d.e-]+; holds on 20 of 20 seeds$/);
  });
});

describe("the attention family's candidate levels on the trained miniature (ADR-0057)", () => {
  const root = join(import.meta.dirname, "..", "..", "..");
  const load = (name: string) => {
    const folder = join(root, "fixtures", "weights", name);
    const manifest = WeightsManifest.parse(JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8")));
    return { weights: readWeights(new Uint8Array(readFileSync(join(folder, "weights.bin"))), manifest), inputs: (JSON.parse(readFileSync(join(folder, "check.json"), "utf8")) as { inputs: number[][] }).inputs };
  };
  const two = load("miniature-2-heads");
  const one = load("miniature-1-head");
  const candidates = attentionCandidates({ tokens: two.inputs[0] ?? [], vocab: 10, dModel: 16, heads: 2, scaled: 1, positional: 1, causal: 0, recurrent: 0, weights: two.weights, task: "previous-plus-mirror" }, { inputs: two.inputs, oneHead: one.weights });
  const find = (setting: string, measure: string) => candidates.find((candidate) => candidate.level.whatIf.setting === setting && candidate.level.measure === measure);

  it("judges each claim over 20 held-out inputs, the weights fixed, and finds the task's accuracy falling without positions, scaling or with the mask", () => {
    for (const candidate of candidates) expect(candidate.brief).toMatch(/holds on (1[6-9]|20) of 20 inputs$/);
    expect(find("positional", "accuracy")?.level.relation).toBe("lower");
    expect(find("scaled", "accuracy")?.level.relation).toBe("lower");
    expect(find("causal", "accuracy")?.level.relation).toBe("lower");
  });

  it("finds one head against two on how the heads attend, but not on accuracy: one head answers this task as well as two", () => {
    expect(candidates.some((candidate) => candidate.level.whatIf.setting === "heads")).toBe(true);
    expect(find("heads", "accuracy")).toBeUndefined();
  });
});
