/**
 * The model bake-off (owner, 2026-10-14): every candidate on every stage, scored against the gold
 * answers. A pure function of the model client, so the live run (`npm run pipeline:live -- bakeoff`)
 * records every call, and a test replays the recordings to the same scores. A call that fails is a
 * result too, with its reason; it is never retried until it passes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SourceText } from "@paperplay/contracts";
import type { ModelClient } from "@paperplay/pipeline/models";
import { read, route, transcribe, type RouteDecision } from "@paperplay/pipeline/stages";
import { compareValueSets, Gold, matchModels, modelForComparison, pickValueSet, scoreReading, scoreTranscription, TranscriptionWithSets, withValueSet, type ReadingScore, type TranscriptionScore } from "@paperplay/pipeline/transcribe";

const root = join(import.meta.dirname, "..", "..");

export interface Candidate {
  readonly model: string;
  readonly vendor: string;
}

/** Ten candidates, ten vendors; the probe found every one gives valid JSON (eval/models-probe.md). */
export const CANDIDATES: readonly Candidate[] = Object.freeze([
  // The first bake-off's candidates the portal does not mark "Testing in progress" (the owner, 2026-10-16)…
  { model: "glm-5-3", vendor: "Z.ai" },
  { model: "gpt-oss-120b", vendor: "OpenAI" },
  { model: "llama4-maverick-17b", vendor: "Meta" },
  { model: "kimi-k2-7-code", vendor: "Moonshot AI" },
  { model: "gemma4-31b-it", vendor: "Google" },
  { model: "granite41-30b", vendor: "IBM" },
  // …and the five the owner added, which the first never tried. The gateway names no maker for
  // Muse-Glimmer; it counts as its own vendor.
  { model: "inkling-small", vendor: "Thinking Machines" },
  { model: "qwen38-27b", vendor: "Qwen" },
  { model: "qwen3-235b-a22b-thinking-2507", vendor: "Qwen" },
  { model: "qwen36-27b", vendor: "Qwen" },
  { model: "muse-glimmer-30b", vendor: "Muse" },
]);

export const GOLD_PAPERS: readonly string[] = Object.freeze(["arxiv-2506.19869v1", "arxiv-2203.01434v2", "pmc-PMC12334037"]);

export interface GoldPaper {
  readonly id: string;
  readonly title: string;
  readonly gold: Gold;
  readonly source: SourceText;
}

export interface RoutingPaper {
  readonly id: string;
  readonly title: string;
  readonly abstract: string;
  readonly equations: readonly string[];
  readonly expected: { readonly family: string; readonly tier: "A" | "B" | "C"; readonly why: string };
}

export function loadGoldPapers(): GoldPaper[] {
  return GOLD_PAPERS.map((id) => {
    const source = SourceText.parse(JSON.parse(readFileSync(join(root, "fixtures", "sources", `${id}.json`), "utf8")));
    const front = source.sections.find((section) => section.id === "front");
    return { id, title: front ? source.text.slice(front.start, front.end).trim() : id, gold: Gold.parse(JSON.parse(readFileSync(join(root, "eval", "gold", `${id}.json`), "utf8"))), source };
  });
}

export function loadRoutingPapers(): RoutingPaper[] {
  return (JSON.parse(readFileSync(join(root, "eval", "routing", "papers.json"), "utf8")) as { papers: RoutingPaper[] }).papers;
}

type Outcome<T> = { readonly ok: true; readonly value: T; readonly attempts: number } | { readonly ok: false; readonly error: string };

export interface BakeoffResults {
  readonly schemaVersion: "bakeoff/1";
  readonly candidates: readonly Candidate[];
  readonly transcriptions: readonly { readonly model: string; readonly paper: string; readonly outcome: Outcome<unknown>; readonly score: TranscriptionScore }[];
  readonly readings: readonly { readonly model: string; readonly paper: string; readonly outcome: Outcome<unknown>; readonly score: ReadingScore | null }[];
  readonly routes: readonly { readonly model: string; readonly paper: string; readonly outcome: Outcome<RouteDecision>; readonly familyRight: boolean; readonly tierRight: boolean }[];
}

async function attempt<T>(call: () => Promise<{ readonly value: T; readonly attempts: number }>): Promise<Outcome<T>> {
  try {
    const { value, attempts } = await call();
    return { ok: true, value, attempts };
  } catch (error) {
    return { ok: false, error: (error instanceof Error ? error.message : String(error)).split("\n")[0]?.slice(0, 240) ?? "" };
  }
}

export async function runBakeoff(client: ModelClient, structuredOutput: Readonly<Record<string, boolean>>, candidates: readonly Candidate[] = CANDIDATES): Promise<BakeoffResults> {
  const papers = loadGoldPapers();
  const routing = loadRoutingPapers();
  const perModel = await Promise.all(
    candidates.map(async ({ model }) => {
      const structured = structuredOutput[model] ?? false;
      const transcriptions = [];
      const readings = [];
      const routes = [];
      for (const paper of papers) {
        const transcribed = await attempt(() => transcribe(client, model, paper.source, paper.title, { structuredOutput: structured }));
        // A failed call scores nothing, out of everything the gold holds.
        const nothing: TranscriptionScore = { converted: false, structural: false, valuesRight: 0, valuesTotal: paper.gold.transcription.parameters.length + paper.gold.transcription.compartments.length, quotesFound: 0, quotesTotal: 0, setsFound: 0, setsTotal: (paper.gold.transcription.valueSets ?? []).length, pickRight: paper.gold.picked ? false : null, problems: [] };
        transcriptions.push({ model, paper: paper.id, outcome: transcribed, score: transcribed.ok ? scoreTranscription(transcribed.value, paper.gold, paper.source) : nothing });
        const reading = await attempt(() => read(client, model, paper.source, paper.title, { structuredOutput: structured }));
        readings.push({ model, paper: paper.id, outcome: reading, score: reading.ok ? scoreReading(reading.value, paper.gold, paper.source) : null });
      }
      for (const paper of routing) {
        const decision = await attempt(() => route(client, model, paper, { structuredOutput: structured }));
        routes.push({
          model,
          paper: paper.id,
          outcome: decision,
          familyRight: decision.ok && decision.value.family === paper.expected.family,
          tierRight: decision.ok && decision.value.tier === paper.expected.tier,
        });
      }
      return { transcriptions, readings, routes };
    }),
  );
  return {
    schemaVersion: "bakeoff/1",
    candidates,
    transcriptions: perModel.flatMap((entry) => entry.transcriptions),
    readings: perModel.flatMap((entry) => entry.readings),
    routes: perModel.flatMap((entry) => entry.routes),
  };
}

/** Two models' transcriptions of each gold paper, compared with each other up to renaming. */
export function agreement(results: BakeoffResults, first: string, second: string) {
  const papers = loadGoldPapers();
  return papers.map((paper) => {
    const find = (model: string) => results.transcriptions.find((entry) => entry.model === model && entry.paper === paper.id)?.outcome;
    const a = find(first);
    const b = find(second);
    if (!a?.ok || !b?.ok) return { paper: paper.id, structural: false, values: false, samePick: null, problems: ["a transcription failed"] };
    // As the controller judges them: each on the set its rule picks, the two sets' lists compared.
    const resolve = (value: unknown) => {
      const transcription = TranscriptionWithSets.parse(value);
      const sets = transcription.valueSets ?? [];
      const pick = sets.length > 0 ? pickValueSet(sets, paper.source) : null;
      return { sets, pick: pick?.set ?? null, ambiguous: pick && !pick.set ? pick.ambiguous : null, applied: pick?.set ? withValueSet(transcription, pick.set).transcription : transcription };
    };
    const ra = resolve(a.value);
    const rb = resolve(b.value);
    const sets = ra.sets.length + rb.sets.length > 0 ? compareValueSets(ra.sets, rb.sets) : null;
    const samePick = sets ? (ra.pick && rb.pick ? sets.pairs[ra.pick.id] === rb.pick.id : false) : null;
    const setProblems = [...(ra.ambiguous ? [`the first's rule cannot pick: ${ra.ambiguous}`] : []), ...(rb.ambiguous ? [`the second's rule cannot pick: ${rb.ambiguous}`] : []), ...(sets?.problems ?? []), ...(samePick === false && ra.pick && rb.pick ? [`the rule picks "${ra.pick.label}" from the first and "${rb.pick.label}" from the second`] : [])];
    const ma = modelForComparison(ra.applied, paper.source);
    const mb = modelForComparison(rb.applied, paper.source);
    if (!ma || !mb) return { paper: paper.id, structural: false, values: false, samePick, problems: ["a transcription did not convert", ...setProblems] };
    const match = matchModels(ma, mb);
    return { paper: paper.id, structural: match.structural, values: match.values, samePick, problems: [...setProblems, ...match.problems].slice(0, 4) };
  });
}
