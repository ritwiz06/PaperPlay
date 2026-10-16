/**
 * The bake-off's record, eval/models.md, written from its results alone (eval/bakeoff/results.json),
 * so the table and the choices never drift from what was measured. Ties go to the model with fewer
 * failed calls across the whole bake-off, as the more dependable, then to the earlier candidate.
 */
import type { DesignResults } from "./design.ts";
import type { BakeoffResults, Candidate } from "./run.ts";

export interface Ranked {
  readonly model: string;
  readonly vendor: string;
  readonly key: readonly number[];
  readonly cells: readonly string[];
}

const fraction = (right: number, total: number): string => `${right}/${total}`;
const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);
const better = (a: readonly number[], b: readonly number[]): number => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (b[i] ?? 0) - (a[i] ?? 0);
  return 0;
};

/** A model's failed calls in every stage of the bake-off's first half. */
const failuresOf = (results: BakeoffResults, model: string): number => [...results.transcriptions, ...results.readings, ...results.routes].filter((entry) => entry.model === model && !entry.outcome.ok).length;

export function rankTranscribers(results: BakeoffResults): Ranked[] {
  return results.candidates
    .map((candidate, order) => {
      const rows = results.transcriptions.filter((entry) => entry.model === candidate.model);
      const scores = rows.map((row) => row.score);
      const structural = scores.filter((score) => score?.structural).length;
      const valuesRight = sum(scores.map((score) => score?.valuesRight ?? 0));
      const valuesTotal = sum(scores.map((score) => score?.valuesTotal ?? 0)) || sum(rows.map(() => 0));
      const quotesFound = sum(scores.map((score) => score?.quotesFound ?? 0));
      const quotesTotal = sum(scores.map((score) => score?.quotesTotal ?? 0));
      const failed = rows.filter((row) => !row.outcome.ok).length;
      return {
        model: candidate.model,
        vendor: candidate.vendor,
        key: [structural, valuesTotal ? valuesRight / valuesTotal : 0, quotesTotal ? quotesFound / quotesTotal : 0, -failuresOf(results, candidate.model), -order],
        cells: [fraction(structural, rows.length), fraction(valuesRight, valuesTotal), fraction(quotesFound, quotesTotal), String(failed)],
      };
    })
    .sort((a, b) => better(a.key, b.key));
}

export function rankReaders(results: BakeoffResults): Ranked[] {
  return results.candidates
    .map((candidate, order) => {
      const rows = results.readings.filter((entry) => entry.model === candidate.model);
      const equations = rows.length ? sum(rows.map((row) => row.score?.equations ?? 0)) / rows.length : 0;
      const results_ = rows.filter((row) => row.score?.resultQuoteFound).length;
      const claimsFound = sum(rows.map((row) => row.score?.claimQuotesFound ?? 0));
      const claimsTotal = sum(rows.map((row) => row.score?.claimQuotesTotal ?? 0));
      return {
        model: candidate.model,
        vendor: candidate.vendor,
        // What the pipeline uses of a reading: its result's and its claims' quotes, which become the
        // world's anchors. Its list of the model's equations is advice the transcribers do not need.
        key: [results_, claimsTotal ? claimsFound / claimsTotal : 0, equations, -failuresOf(results, candidate.model), -order],
        cells: [fraction(results_, rows.length), fraction(claimsFound, claimsTotal), equations.toFixed(2), String(rows.filter((row) => !row.outcome.ok).length)],
      };
    })
    .sort((a, b) => better(a.key, b.key));
}

export function rankRouters(results: BakeoffResults): Ranked[] {
  return results.candidates
    .map((candidate, order) => {
      const rows = results.routes.filter((entry) => entry.model === candidate.model);
      const both = rows.filter((row) => row.familyRight && row.tierRight).length;
      const family = rows.filter((row) => row.familyRight).length;
      const tier = rows.filter((row) => row.tierRight).length;
      return {
        model: candidate.model,
        vendor: candidate.vendor,
        key: [both, family, tier, -failuresOf(results, candidate.model), -order],
        cells: [fraction(both, rows.length), fraction(family, rows.length), fraction(tier, rows.length), String(rows.filter((row) => !row.outcome.ok).length)],
      };
    })
    .sort((a, b) => better(a.key, b.key));
}

/** Models the portal marks "Testing in progress": shown in the tables, never picked (the owner, 2026-10-16). */
export interface Exclusion {
  readonly asOf: string;
  readonly models: readonly string[];
}
const NONE: Exclusion = { asOf: "", models: [] };
/** The best of a table that may be picked. */
const pick = (ranked: readonly Ranked[], excluded: Exclusion): Ranked | undefined => ranked.find((row) => !excluded.models.includes(row.model));

/** The best transcriber, and the best of another vendor for the second transcription, neither excluded. */
export function transcriberPair(results: BakeoffResults, excluded: Exclusion = NONE): { readonly first: Candidate | null; readonly second: Candidate | null } {
  const ranked = rankTranscribers(results).filter((row) => !excluded.models.includes(row.model));
  const first = ranked[0] ?? null;
  const second = first ? (ranked.find((entry) => entry.vendor !== first.vendor) ?? null) : null;
  return { first: first && { model: first.model, vendor: first.vendor }, second: second && { model: second.model, vendor: second.vendor } };
}

const table = (header: readonly string[], rows: readonly Ranked[], excluded: Exclusion = NONE): string[] => [
  `| Rank | Model | Vendor | ${header.join(" | ")} |`,
  `|---|---|---|${header.map(() => "---|").join("")}`,
  ...rows.map((row, index) => `| ${index + 1} | ${row.model}${excluded.models.includes(row.model) ? " (testing in progress, not picked)" : ""} | ${row.vendor} | ${row.cells.join(" | ")} |`),
];

export function rankPlanners(results: BakeoffResults, design: DesignResults): Ranked[] {
  return results.candidates
    .map((candidate, order) => {
      const rows = design.plans.filter((entry) => entry.model === candidate.model);
      const levels = sum(rows.map((row) => row.score.levels));
      const built = sum(rows.map((row) => row.score.built));
      const meet = sum(rows.map((row) => row.score.meetRule));
      return {
        model: candidate.model,
        vendor: candidate.vendor,
        // How many levels meet the rule, before the fraction: a paper whose call failed then counts
        // as none, where a fraction alone would leave it out and reward the failure.
        key: [meet, levels ? meet / levels : 0, built, -failuresOf(results, candidate.model), -order],
        cells: [fraction(meet, levels), fraction(built, levels), String(rows.filter((row) => !row.ok).length), rows.map((row) => row.score.note).filter(Boolean)[0]?.replaceAll("|", "/") ?? ""],
      };
    })
    .sort((a, b) => better(a.key, b.key));
}

export function rankReviewers(results: BakeoffResults, design: DesignResults): Ranked[] {
  return results.candidates
    .map((candidate, order) => {
      const row = design.reviews.find((entry) => entry.model === candidate.model);
      const found = row?.found ?? 0;
      const planted = row?.planted ?? 0;
      const falseBlocks = row?.falseBlocks ?? 0;
      const overturned = row?.calledFailedAcceptable ?? false;
      return {
        model: candidate.model,
        vendor: candidate.vendor,
        key: [overturned ? 0 : 1, found - falseBlocks, -failuresOf(results, candidate.model), -order],
        cells: [fraction(found, planted), String(falseBlocks), overturned ? "**yes**" : "no", row?.ok === false ? "1" : "0"],
      };
    })
    .sort((a, b) => better(a.key, b.key));
}

export function toModelsMarkdown(results: BakeoffResults, agreement: readonly { readonly paper: string; readonly structural: boolean; readonly values: boolean; readonly problems: readonly string[] }[], meta: { readonly date: string }, design?: DesignResults, excluded: Exclusion = NONE): string {
  const transcribers = rankTranscribers(results);
  const readers = rankReaders(results);
  const routers = rankRouters(results);
  const pair = transcriberPair(results, excluded);
  const failures = [...results.transcriptions, ...results.readings, ...results.routes].filter((entry) => !entry.outcome.ok);
  return [
    "# The model bake-off",
    "",
    "Generated by `npm run pipeline:live -- bakeoff` from its results, `eval/bakeoff/results.json`; every call it made is",
    "recorded in `fixtures/recordings/`, and a test replays them to the same scores. Do not edit by hand.",
    "",
    `Run on ${meta.date}, on ASU Research Computing's Voyager gateway (ADR-0030). ${results.candidates.length} candidates from ${new Set(results.candidates.map((candidate) => candidate.vendor)).size} vendors;`,
    "the gold answers are three CC BY papers' models transcribed by hand (`eval/gold/`).",
    "",
    ...(excluded.models.length > 0
      ? [`**Not picked:** the models the Voyager portal marks "Testing in progress", which its API does not show, as the owner saw them on ${excluded.asOf}: ${excluded.models.join(", ")}. They keep their rows, marked; each stage takes the best of the rest.`]
      : ["**Not yet a choice:** the Voyager portal marks some models \"Testing in progress\", which its API does not show. The", "owner names them, and each stage takes the best of the rest."]),
    "",
    "## Transcription",
    "",
    "Each model transcribed each paper's model on its own. Ranked by equations that match the gold's up to renaming, then",
    "values read right (a value the paper also states for another scenario counts), then quotes the source holds.",
    "",
    ...table(["Equations match", "Values right", "Quotes found", "Failed calls"], transcribers, excluded),
    "",
    `**First transcription:** ${pair.first ? `${pair.first.model} (${pair.first.vendor})` : "none"}. **Second, from another vendor:** ${pair.second ? `${pair.second.model} (${pair.second.vendor})` : "none"}.`,
    "",
    "### The two transcriptions' agreement",
    "",
    "The world is verified only where the two agree structurally, up to renaming (ADR-0024, item 2).",
    "",
    "| Paper | Equations agree | Values agree | What differs |",
    "|---|---|---|---|",
    ...agreement.map((row) => `| ${row.paper} | ${row.structural ? "yes" : "**no**"} | ${row.values ? "yes" : "**no**"} | ${row.problems.join("; ").replaceAll("|", "/") || "nothing"} |`),
    "",
    "## Reading",
    "",
    "Ranked by what the pipeline uses of a reading, its quotes, which become the world's anchors: the result's quote found",
    "in the source, then the claims' quotes found, then the overlap of the equations it says define the model with the",
    "gold's (intersection over union), which the pipeline does not use.",
    "",
    ...table(["Result quoted", "Claims quoted", "Equations overlap", "Failed calls"], readers, excluded),
    "",
    "## Routing",
    "",
    `Each model routed ${results.routes.filter((route) => route.model === results.candidates[0]?.model).length} papers: the three gold papers, and arXiv abstracts of a flock, an optimiser, a training technique,`,
    "an epidemic on a network and a reaction-diffusion grid (`eval/routing/papers.json`).",
    "",
    ...table(["Family and tier right", "Family right", "Tier right", "Failed calls"], routers, excluded),
    "",
    ...(design
      ? [
          "## Planning",
          "",
          "Each model planned a world from each gold paper's verified model and the best reader's reading, in plain JSON. Each",
          "planned level was assembled and built alone, then swept by the level rule over 20 starts. Ranked by the levels",
          "meeting the rule, then by their share of the levels planned, then by the levels that build. A first plan only: in a",
          "job, the controller shows the planner each failing level's measurement and asks it to change that level.",
          "",
          ...table(["Levels meeting the rule", "Levels that build", "Failed calls", "First problem"], rankPlanners(results, design), excluded),
          "",
          "## Reviewing",
          "",
          "Each model reviewed a tuberculosis world in words with three faults planted: level 2 claims, as the paper's, what the",
          "paper does not say; level 3 states an effect far beyond its measurement; level 4 fails the level rule. Ranked by never",
          "calling the failed check acceptable, then the planted faults it blocks (levels 2 and 3), less any block on level 1,",
          "which has no fault.",
          "",
          ...table(["Faults blocked", "Wrong blocks", "Called a failed check acceptable", "Failed calls"], rankReviewers(results, design), excluded),
          "",
        ]
      : []),
    "## Proposed per stage",
    "",
    "| Stage | Proposed | Why |",
    "|---|---|---|",
    `| reader | ${pick(readers, excluded)?.model ?? "none"} | the best reader |`,
    `| transcriber | ${pair.first?.model ?? "none"} | the best transcriber |`,
    `| second-transcriber | ${pair.second?.model ?? "none"} | the best transcriber from another vendor |`,
    `| router | ${pick(routers, excluded)?.model ?? "none"} | the best router |`,
    ...(design
      ? [
          `| planner | ${pick(rankPlanners(results, design), excluded)?.model ?? "none"} | the most levels meeting the level rule |`,
          `| explainer | ${pick(rankPlanners(results, design), excluded)?.model ?? "none"} | the planner's model, which knows the plan; its words are held by the schema and their quotes by provenance, not ranked |`,
          `| reviewer | ${pick(rankReviewers(results, design), excluded)?.model ?? "none"} | the most planted faults found, none blocked wrongly, no failed check called acceptable |`,
        ]
      : ["| planner, explainer, reviewer | not yet | their bake-off runs after this one |"]),
    "",
    "## Failed calls",
    "",
    failures.length === 0 ? "None." : failures.map((entry) => `- ${entry.model}, ${entry.paper}: ${entry.outcome.ok ? "" : entry.outcome.error}`).join("\n"),
    ...(design
      ? [
          "",
          "### Planning and reviewing",
          "",
          [...design.plans.filter((entry) => !entry.ok).map((entry) => `- ${entry.model}, planning ${entry.paper}: ${entry.error ?? ""}`), ...design.reviews.filter((entry) => !entry.ok).map((entry) => `- ${entry.model}, reviewing: ${entry.error ?? ""}`)].join("\n") || "None.",
        ]
      : []),
    "",
  ].join("\n");
}
