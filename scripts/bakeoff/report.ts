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
      // Papers with several value sets: the gold's sets each lists, and whether the rule picks the gold's.
      const withSets = scores.filter((score) => (score?.setsTotal ?? 0) > 0);
      const setsFound = sum(withSets.map((score) => score?.setsFound ?? 0));
      const setsTotal = sum(withSets.map((score) => score?.setsTotal ?? 0));
      const picksRight = withSets.filter((score) => score?.pickRight === true).length;
      return {
        model: candidate.model,
        vendor: candidate.vendor,
        key: [structural, picksRight, valuesTotal ? valuesRight / valuesTotal : 0, quotesTotal ? quotesFound / quotesTotal : 0, -failuresOf(results, candidate.model), -order],
        cells: [fraction(structural, rows.length), fraction(picksRight, withSets.length), fraction(setsFound, setsTotal), fraction(valuesRight, valuesTotal), fraction(quotesFound, quotesTotal), String(failed)],
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
      const claimsFound = sum(rows.map((row) => row.score?.findingQuotesFound ?? 0));
      const claimsTotal = sum(rows.map((row) => row.score?.findingQuotesTotal ?? 0));
      const enough = rows.filter((row) => row.score?.enoughFindings).length;
      return {
        model: candidate.model,
        vendor: candidate.vendor,
        // What the pipeline uses of a reading: its headline result and findings, anchored, which its
        // levels test (ADR-0037). Its list of the model's equations is advice the transcribers do not need.
        key: [results_, enough, claimsTotal ? claimsFound / claimsTotal : 0, equations, -failuresOf(results, candidate.model), -order],
        cells: [fraction(results_, rows.length), fraction(enough, rows.length), fraction(claimsFound, claimsTotal), equations.toFixed(2), String(rows.filter((row) => !row.outcome.ok).length)],
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
/** The best of another vendor than `first`'s, for a stage asked twice (ADR-0043, ADR-0044). */
const pickOther = (ranked: readonly Ranked[], excluded: Exclusion, first: Ranked | undefined): Ranked | undefined => (first ? ranked.find((row) => !excluded.models.includes(row.model) && row.vendor !== first.vendor) : undefined);

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
      const onFindings = rows.filter((row) => row.score.onFindings).length;
      return {
        model: candidate.model,
        vendor: candidate.vendor,
        // How many levels meet the rule, before the fraction: a paper whose call failed then counts
        // as none, where a fraction alone would leave it out and reward the failure.
        // A tie is broken by the stage's own failed calls first: a planner whose call failed on a
        // paper did less than one that planned all three.
        key: [meet, onFindings, levels ? meet / levels : 0, built, -rows.filter((row) => !row.ok).length, -failuresOf(results, candidate.model), -order],
        cells: [fraction(meet, levels), fraction(onFindings, rows.length), fraction(built, levels), String(rows.filter((row) => !row.ok).length), rows.map((row) => row.score.note).filter(Boolean)[0]?.replaceAll("|", "/") ?? ""],
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
      const definitional = row?.definitional ?? false;
      return {
        model: candidate.model,
        vendor: candidate.vendor,
        key: [overturned ? 0 : 1, found - falseBlocks, definitional ? 1 : 0, row?.ok === false ? -1 : 0, -failuresOf(results, candidate.model), -order],
        cells: [fraction(found, planted), definitional ? "yes" : "no", String(falseBlocks), overturned ? "**yes**" : "no", row?.ok === false ? "1" : "0"],
      };
    })
    .sort((a, b) => better(a.key, b.key));
}

export function toModelsMarkdown(results: BakeoffResults, agreement: readonly { readonly paper: string; readonly structural: boolean; readonly values: boolean; readonly samePick?: boolean | null; readonly problems: readonly string[] }[], meta: { readonly date: string }, design?: DesignResults, excluded: Exclusion = NONE): string {
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
    "Each model transcribed each paper's model on its own. Ranked by equations that match the gold's up to renaming, then,",
    "on papers that state several value sets, whether the value-set rule picks the gold's set from the sets it lists, then",
    "values read right (a value the paper also states in another set counts), then quotes the source holds.",
    "",
    ...table(["Equations match", "Set picked right", "Value sets found", "Values right", "Quotes found", "Failed calls"], transcribers, excluded),
    "",
    `**First transcription:** ${pair.first ? `${pair.first.model} (${pair.first.vendor})` : "none"}. **Second, from another vendor:** ${pair.second ? `${pair.second.model} (${pair.second.vendor})` : "none"}.`,
    "",
    "### The two transcriptions' agreement",
    "",
    "The world is verified only where the two agree structurally, up to renaming (ADR-0024, item 2).",
    "",
    "| Paper | Equations agree | Same value set picked | Values agree | What differs |",
    "|---|---|---|---|---|",
    ...agreement.map((row) => `| ${row.paper} | ${row.structural ? "yes" : "**no**"} | ${row.samePick === null || row.samePick === undefined ? "one set" : row.samePick ? "yes" : "**no**"} | ${row.values ? "yes" : "**no**"} | ${row.problems.join("; ").replaceAll("|", "/") || "nothing"} |`),
    "",
    "## Reading",
    "",
    "Ranked by what the pipeline uses of a reading: the headline result's quote found in the source, then whether it gives",
    "enough anchored findings, the headline included, for three levels to test (ADR-0037), then its findings' quotes found,",
    "then the overlap of the equations it says define the model with the gold's, which the pipeline does not use.",
    "",
    ...table(["Headline quoted", "Enough findings", "Findings quoted", "Equations overlap", "Failed calls"], readers, excluded),
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
          "planned level was assembled and built alone, then swept by the level rule over 20 starts and held to the visibility",
          "rule; each plan was held to the findings check (ADR-0037). Ranked by the levels meeting both rules, then the worlds",
          "passing the findings check, then the share of levels planned that meet both, then the levels that build. A first plan",
          "only: in a job, the controller shows the planner each failing level's measurement and asks it to change that level.",
          "",
          ...table(["Levels meeting both rules", "Worlds on the findings", "Levels that build", "Failed calls", "First problem"], rankPlanners(results, design), excluded),
          "",
          "## Reviewing",
          "",
          "Each model reviewed a tuberculosis world in words with four faults planted: level 2 claims, as the paper's, what the",
          "paper does not say; level 3 states an effect far beyond its measurement; level 4 fails the level rule; level 5's effect",
          "follows from the model's definitions alone. Ranked by never calling the failed check acceptable, then the planted",
          "faults it blocks (levels 2, 3 and 5), less any block on levels 1, 6 and 7, which have no fault (6 and 7 test what the",
          "paper found), then whether it names level 5 definitional.",
          "",
          ...table(["Faults blocked", "Definitional named", "Wrong blocks", "Called a failed check acceptable", "Failed calls"], rankReviewers(results, design), excluded),
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
          `| planner | ${pick(rankPlanners(results, design), excluded)?.model ?? "none"} | the most levels meeting both rules, then worlds on the paper's findings |`,
          `| second-planner | ${pickOther(rankPlanners(results, design), excluded, pick(rankPlanners(results, design), excluded))?.model ?? "none"} | the best planner from another vendor |`,
          `| explainer | ${pick(rankPlanners(results, design), excluded)?.model ?? "none"} | the planner's model, which knows the plan; its words are held by the schema and their quotes by provenance, not ranked |`,
          `| reviewer | ${pick(rankReviewers(results, design), excluded)?.model ?? "none"} | the most planted faults found, none blocked wrongly, no failed check called acceptable |`,
          `| second-reviewer | ${pickOther(rankReviewers(results, design), excluded, pick(rankReviewers(results, design), excluded))?.model ?? "none"} | the best reviewer from another vendor |`,
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
