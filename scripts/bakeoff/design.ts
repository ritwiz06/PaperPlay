/**
 * The bake-off's second half (owner, 2026-10-14): planning and reviewing. A planner is given each
 * gold paper's verified model, as the controller would be, and scored by what its plan becomes:
 * levels that build, and levels that meet the level rule over 20 starts. A reviewer is given a world
 * with faults planted in it and scored on finding them, without blocking the level that has none.
 * Pure functions of the model client, so a test replays the recordings to the same scores.
 */
import { registry } from "@paperplay/primitives";
import { buildWorld, checkFindings, sweepLevels, visibilityOf } from "@paperplay/pipeline";
import { assembleWorld, chooseStep, describeBehaviour, horizonOf } from "@paperplay/pipeline/assemble";
import type { ModelClient } from "@paperplay/pipeline/models";
import { plan, promptSource, review, type Plan, type Reading } from "@paperplay/pipeline/stages";
import { toModelSpec } from "@paperplay/pipeline/transcribe";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SourceRegister, type ModelSpec } from "@paperplay/contracts";
import { loadGoldPapers, type Candidate } from "./run.ts";

const root = join(import.meta.dirname, "..", "..");

export interface PlanScore {
  readonly levels: number;
  readonly built: number;
  /** Levels that meet the level rule and the visibility rule both (ADR-0037). */
  readonly meetRule: number;
  /** Whether the plan as a whole passes the findings check: the hook on the headline, three levels on anchored findings. */
  readonly onFindings: boolean;
  readonly note: string;
}

export interface DesignResults {
  readonly schemaVersion: "bakeoff-design/1";
  readonly plans: readonly { readonly model: string; readonly paper: string; readonly ok: boolean; readonly error: string | null; readonly score: PlanScore }[];
  readonly reviews: readonly { readonly model: string; readonly ok: boolean; readonly error: string | null; readonly found: number; readonly planted: number; readonly falseBlocks: number; readonly calledFailedAcceptable: boolean; readonly definitional: boolean }[];
}

/** Placeholder words for each level, so a plan can be assembled and built without the explainer. */
const words = (count: number) => ({
  levels: Array.from({ length: count }, () => ({
    beginner: { text: "Watch the model.", analogy: "Like a tide." },
    intermediate: { text: "Watch the model." },
    advanced: { text: "The model's equations.", equation: "dx/dt", quote: null },
    guide: { idle: "Watch.", raised: "You raised it{to}.", lowered: "You lowered it{to}.", readings: [{ atLeast: 0, words: "as measured" }], rising: "rising", falling: "falling" },
    afterwards: { text: "As measured.", quote: null, question: "Why?" },
  })),
});

/** A plan as a world: how many levels it has, how many build, and how many of those meet the rule. */
export function scorePlan(planned: Plan, context: { readonly paper: ReturnType<typeof loadGoldPapers>[number]; readonly reading: Reading; readonly model: ModelSpec }): PlanScore {
  const register = SourceRegister.parse(JSON.parse(readFileSync(join(root, "fixtures", "sources", "register.json"), "utf8"))).sources.find((entry) => entry.sourceId === context.paper.id);
  if (!register) return { levels: planned.levels.length, built: 0, meetRule: 0, onFindings: false, note: "no register entry" };
  const findings = checkFindings(planned, context.reading, context.paper.source);
  const onFindings = findings.world.length === 0 && findings.levels.every((problems) => problems.length === 0);
  let built = 0;
  let meetRule = 0;
  let note = "";
  // Each level alone, beside two copies of the first, so one level's problem does not hide the others'.
  for (let index = 0; index < planned.levels.length; index++) {
    const level = planned.levels[index];
    if (!level) continue;
    const trial: Plan = { ...planned, levels: [level, level, level].map((entry, at) => (at === 0 ? entry : { ...entry, kind: "idea" })) };
    const { spec } = assembleWorld({ source: context.paper.source, register, reading: context.reading, model: context.model, plan: trial, explanation: words(3), routingReason: "the bake-off" });
    const result = buildWorld(spec, registry);
    if (!result.ok) {
      if (!note) note = `level ${index + 1}: ${result.problems[0]?.message ?? "does not build"}`.slice(0, 160);
      continue;
    }
    built++;
    const swept = sweepLevels(result.world);
    const seen = visibilityOf(result.world);
    if (swept[0]?.meets && seen[0]?.visible) meetRule++;
    else if (!note) note = swept[0]?.meets ? `level ${index + 1}: too small to see` : `level ${index + 1}: holds on ${swept[0]?.holds ?? 0} of 20`;
  }
  return { levels: planned.levels.length, built, meetRule, onFindings, note: note || (onFindings ? "" : (findings.world[0] ?? findings.levels.flat()[0] ?? "")) };
}

/** A gold paper's model as the controller would plan from it: its step chosen, and the horizon it is described over. */
const modelOf = (paper: ReturnType<typeof loadGoldPapers>[number]): { readonly model: ModelSpec; readonly horizon: number } => {
  const model = toModelSpec(paper.gold.transcription, paper.source).model;
  if (!model) throw new Error(`${paper.id}'s gold does not convert`);
  const horizon = horizonOf(model);
  const dt = chooseStep(model, horizon * 2) ?? model.solver.dt;
  return { model: { ...model, solver: { ...model.solver, dt } }, horizon };
};

/** The world the reviewers read: a tuberculosis world in words, with three faults planted in it. */
export const REVIEW_WORLD = [
  "Level 1, Vaccination slows the spread: Change the vaccination rate and watch the infectious. What if: what if no one were vaccinated? It states: with no vaccination, more than 5 more people are infectious at year 20 than in this world.",
  "Level 2, Treatment and the threshold: Change the treatment rate and watch the infectious. It states, as the paper's: \"The paper shows that vaccinating every newborn would eliminate tuberculosis within ten years.\"",
  "Level 3, Faster progression: Change the progression rate and watch the exposed. What if: what if the exposed became infectious twice as fast? It states: the epidemic doubles in size and the disease can never be controlled.",
  "Level 4, Recovery after treatment: Change the recovery rate of the treated and watch the recovered. What if: what if recovery were twice as fast? It states: more people are recovered at year 30.",
  "Level 5, No treatment: Change the treatment rate and watch the treated. What if: what if no one were treated? It states: with no treatment, no one is ever in the treated compartment.",
].join("\n");
export const REVIEW_CHECKS = [
  "The builder: passed, the family's checks included.",
  "The level rule: level 1 holds on 20 of 20; level 2 holds on 20 of 20; level 3 holds on 18 of 20, its measured difference is 6 more exposed people at year 10; level 4 holds on 9 of 20 and FAILS the rule; level 5 holds on 20 of 20.",
  "Provenance: level 2's quote is not in the source.",
].join("\n");
/** The levels with a planted fault a reviewer should block: an unsupported claim, an overstatement, and level 5, which follows from a definition (ADR-0037). */
export const PLANTED = [2, 3, 5] as const;
/** The planted level whose effect follows from the model's definitions alone. */
export const DEFINITIONAL = 5;

/** An error in one line: its message's lines joined, so a Zod issue list is not cut to its "[". */
const oneLine = (error: unknown): string => (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").trim().slice(0, 400);

export async function runDesignBakeoff(client: ModelClient, structuredOutput: Readonly<Record<string, boolean>>, candidates: readonly Candidate[], readings: Readonly<Record<string, Reading>>): Promise<DesignResults> {
  const papers = loadGoldPapers();
  const example = "Threshold Town: Level 1, An epidemic that ends by itself: control the infection rate, watch those still well; what if the ill stayed infectious twice as long; measured: people still well at day 200, the other world lower by more than 100.";
  const perModel = await Promise.all(
    candidates.map(async ({ model: name }) => {
      const structured = structuredOutput[name] ?? false;
      const plans = [];
      for (const paper of papers) {
        const reading = readings[paper.id];
        const { model, horizon } = modelOf(paper);
        if (!reading) continue;
        try {
          const { value } = await plan(client, name, { title: paper.title, reading, model, example, behaviour: describeBehaviour(model, horizon) });
          plans.push({ model: name, paper: paper.id, ok: true, error: null, score: scorePlan(value, { paper, reading, model }) });
        } catch (error) {
          plans.push({ model: name, paper: paper.id, ok: false, error: oneLine(error), score: { levels: 0, built: 0, meetRule: 0, onFindings: false, note: "" } });
        }
      }
      let reviewed;
      try {
        const tuberculosis = papers.find((paper) => paper.id === "arxiv-2506.19869v1");
        if (!tuberculosis) throw new Error("the tuberculosis paper is missing");
        const { value } = await review(client, name, { title: tuberculosis.title, world: REVIEW_WORLD, checks: REVIEW_CHECKS, passages: promptSource(tuberculosis.source, { maxCharacters: 60_000 }).block }, { structuredOutput: structured });
        const blocked = new Set(value.findings.filter((finding) => finding.severity === "blocking").map((finding) => finding.level));
        reviewed = {
          model: name,
          ok: true,
          error: null,
          found: PLANTED.filter((level) => blocked.has(level)).length,
          planted: PLANTED.length,
          falseBlocks: blocked.has(1) ? 1 : 0,
          calledFailedAcceptable: value.findings.some((finding) => finding.level === 4 && /\b(acceptable|fine|ok|passes)\b/i.test(finding.finding) && !/\bnot\b/i.test(finding.finding)),
          definitional: value.findings.some((finding) => finding.level === DEFINITIONAL && finding.severity === "blocking" && finding.kind === "definitional"),
        };
      } catch (error) {
        reviewed = { model: name, ok: false, error: oneLine(error), found: 0, planted: PLANTED.length, falseBlocks: 0, calledFailedAcceptable: false, definitional: false };
      }
      return { plans, reviewed };
    }),
  );
  return { schemaVersion: "bakeoff-design/1", plans: perModel.flatMap((entry) => entry.plans), reviews: perModel.map((entry) => entry.reviewed) };
}
