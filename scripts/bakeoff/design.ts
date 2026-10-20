/**
 * The bake-off's second half (owner, 2026-10-14): planning and reviewing. A planner is given each
 * gold paper's verified model, as the controller would be, and scored by what its plan becomes:
 * levels that build, and levels that meet the level rule over 20 starts. A reviewer is given worlds
 * with faults in them, planted or kept from live runs, and scored on blocking them without blocking
 * the levels that have none (`eval/bakeoff/review-cases.json`).
 * Pure functions of the model client, so a test replays the recordings to the same scores.
 */
import { registry } from "@paperplay/primitives";
import { buildWorld, checkFindings, describeDirectEffect, directEffectOf, sweepLevels, termHolds, visibilityOf } from "@paperplay/pipeline";
import { assembleWorld, chooseStep, describeBehaviour, describeResponse, horizonOf } from "@paperplay/pipeline/assemble";
import type { ModelClient } from "@paperplay/pipeline/models";
import { equationsOf, plan, promptSource, review, type Plan, type Reading, type Review } from "@paperplay/pipeline/stages";
import { runOwnNumbers } from "@paperplay/pipeline/reproduce";
import { toModelSpec, TranscriptionWithSets, withValueSet } from "@paperplay/pipeline/transcribe";
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
  readonly reviews: readonly ReviewScore[];
}

export interface ReviewScore {
  readonly model: string;
  readonly ok: boolean;
  readonly error: string | null;
  /** Faults blocked, of those planted or kept from live runs. */
  readonly found: number;
  readonly planted: number;
  /** Definitional faults blocked as definitional with a valid term. */
  readonly definitional: number;
  readonly definitionalPlanted: number;
  /** Clean levels blocked, of the clean levels. */
  readonly falseBlocks: number;
  readonly clean: number;
  /** Definitional blocks naming no term of the measured compartment's equation holding the control: the controller ignores them. */
  readonly invalidTerms: number;
  readonly calledFailedAcceptable: boolean;
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
  // On the set the paper's rule picks, as a job plans on it (ADR-0036): the tuberculosis paper's Ethiopian fit, not its synthetic example.
  const transcription = TranscriptionWithSets.parse(paper.gold.transcription);
  const picked = transcription.valueSets?.find((set) => set.id === paper.gold.picked);
  const model = toModelSpec(picked ? withValueSet(transcription, picked).transcription : transcription, paper.source).model;
  if (!model) throw new Error(`${paper.id}'s gold does not convert`);
  const horizon = horizonOf(model);
  const dt = chooseStep(model, horizon * 2) ?? model.solver.dt;
  return { model: { ...model, solver: { ...model.solver, dt } }, horizon };
};

/** A level the reviewers are scored on: its words, what it measures, and what a reviewer should do with it. */
export interface ReviewCaseLevel {
  readonly title: string;
  readonly words: string;
  readonly control: string;
  readonly compartment: string;
  readonly summary: string;
  readonly at: number | null;
  readonly time: number;
  /** A fault a reviewer should block; a clean level, a block on which is wrong; or unscored. */
  readonly expect: "fault" | "clean" | "unscored";
  readonly kind: "definitional" | "unsupported" | "overstated" | null;
  /** Where the case came from: planted, or a live run's mistake, kept (ADR-0044). */
  readonly origin: string;
}

export interface ReviewCases {
  readonly schemaVersion: "review-cases/1";
  readonly note: string;
  readonly worlds: readonly {
    readonly id: string;
    readonly paper: string;
    readonly checks: string;
    readonly failedCheck: number | null;
    readonly levels: readonly ReviewCaseLevel[];
    /**
     * Set when a world was added or changed since the reviewers last read it: the date it was. Such a
     * world has no recorded reviews to replay, so replays and rescoring leave it out until the next
     * live run, which reads it and clears this (ADR-0044's second amendment).
     */
    readonly awaitsRun?: string;
  }[];
}

/**
 * The worlds the reviewers are scored on, `eval/bakeoff/review-cases.json`: planted faults, and every
 * reviewer mistake a live run revealed; those awaiting a live run only when it is one.
 */
export const loadReviewCases = (options: { readonly awaiting?: boolean } = {}): ReviewCases => {
  const cases = JSON.parse(readFileSync(join(root, "eval", "bakeoff", "review-cases.json"), "utf8")) as ReviewCases;
  return options.awaiting ? cases : { ...cases, worlds: cases.worlds.filter((world) => world.awaitsRun === undefined) };
};

/**
 * One reviewer's score over every case world. A fault counts as found when the reviewer blocks it,
 * and a definitional fault only when the block is of that kind and names a term of the measured
 * compartment's equation holding the control, as the controller requires (ADR-0044); a block on a
 * clean level is wrong, whatever its kind.
 */
export function scoreReview(cases: ReviewCases, reviews: Readonly<Record<string, Review>>, models: Readonly<Record<string, ModelSpec>>): Omit<ReviewScore, "model" | "ok" | "error"> {
  let found = 0;
  let definitional = 0;
  let falseBlocks = 0;
  let invalidTerms = 0;
  let calledFailedAcceptable = false;
  for (const world of cases.worlds) {
    const review = reviews[world.id];
    const model = models[world.paper];
    if (!review || !model) continue;
    world.levels.forEach((level, index) => {
      const blocks = review.findings.filter((finding) => finding.level === index + 1 && finding.severity === "blocking");
      const validTerm = (term: string | null) => termHolds(model, level.compartment, level.control, term).valid;
      invalidTerms += blocks.filter((finding) => finding.kind === "definitional" && !validTerm(finding.term)).length;
      if (level.expect === "fault" && level.kind === "definitional" && blocks.some((finding) => finding.kind === "definitional" && validTerm(finding.term))) {
        found++;
        definitional++;
      } else if (level.expect === "fault" && level.kind !== "definitional" && blocks.length > 0) found++;
      if (level.expect === "clean" && blocks.length > 0) falseBlocks++;
    });
    if (world.failedCheck !== null) calledFailedAcceptable ||= review.findings.some((finding) => finding.level === world.failedCheck && /\b(acceptable|fine|ok|passes)\b/i.test(finding.finding) && !/\bnot\b/i.test(finding.finding));
  }
  const all = cases.worlds.flatMap((world) => world.levels);
  return {
    found,
    planted: all.filter((level) => level.expect === "fault").length,
    definitional,
    definitionalPlanted: all.filter((level) => level.expect === "fault" && level.kind === "definitional").length,
    falseBlocks,
    clean: all.filter((level) => level.expect === "clean").length,
    invalidTerms,
    calledFailedAcceptable,
  };
}

/** A case world as a reviewer reads it, with the equations and each level's direct-effect tag, as in a job. */
export function reviewInputOf(world: ReviewCases["worlds"][number], paper: ReturnType<typeof loadGoldPapers>[number], model: ModelSpec) {
  return {
    title: paper.title,
    world: world.levels.map((level, index) => `Level ${index + 1}, ${level.title}: ${level.words}`).join("\n"),
    checks: world.checks,
    passages: promptSource(paper.source, { maxCharacters: 60_000 }).block,
    equations: equationsOf(model),
    evidence: world.levels.map((level, index) => `Level ${index + 1}: ${describeDirectEffect(directEffectOf(model, level.control, level.compartment, level))}.`).join("\n"),
  };
}

/** An error in one line: its message's lines joined, so a Zod issue list is not cut to its "[". */
const oneLine = (error: unknown): string => (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").trim().slice(0, 400);

export async function runDesignBakeoff(client: ModelClient, structuredOutput: Readonly<Record<string, boolean>>, candidates: readonly Candidate[], readings: Readonly<Record<string, Reading>>, options: { readonly awaiting?: boolean } = {}): Promise<DesignResults> {
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
          const own = runOwnNumbers({ source: paper.source, model, headline: reading.result });
          const { value } = await plan(client, name, { title: paper.title, reading, model, example, behaviour: describeBehaviour(model, horizon), response: describeResponse(model, horizon), ownNumbers: { verdict: own.verdict, summary: own.summary, observation: own.observation } });
          plans.push({ model: name, paper: paper.id, ok: true, error: null, score: scorePlan(value, { paper, reading, model }) });
        } catch (error) {
          plans.push({ model: name, paper: paper.id, ok: false, error: oneLine(error), score: { levels: 0, built: 0, meetRule: 0, onFindings: false, note: "" } });
        }
      }
      let reviewed: ReviewScore;
      try {
        const cases = loadReviewCases(options);
        const models = Object.fromEntries(papers.map((paper) => [paper.id, modelOf(paper).model]));
        const reviews = Object.fromEntries(
          await Promise.all(
            cases.worlds.map(async (world) => {
              const paper = papers.find((entry) => entry.id === world.paper);
              const model = models[world.paper];
              if (!paper || !model) throw new Error(`${world.id}'s paper, ${world.paper}, is not a gold paper`);
              const { value } = await review(client, name, reviewInputOf(world, paper, model), { structuredOutput: structured });
              return [world.id, value] as const;
            }),
          ),
        );
        reviewed = { model: name, ok: true, error: null, ...scoreReview(cases, reviews, models) };
      } catch (error) {
        reviewed = { model: name, ok: false, error: oneLine(error), ...scoreReview(loadReviewCases(options), {}, {}) };
      }
      return { plans, reviewed };
    }),
  );
  return { schemaVersion: "bakeoff-design/1", plans: perModel.flatMap((entry) => entry.plans), reviews: perModel.map((entry) => entry.reviewed) };
}
