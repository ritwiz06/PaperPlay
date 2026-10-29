/**
 * npm run pipeline:live -- <command>
 *
 * The only command that calls the model gateway (ADR-0030). Never run by the gate or CI, which
 * replay recordings. Every call it makes is recorded in fixtures/recordings/, as the model, the
 * prompt's hash and the response, never the prompt.
 *
 *   models   lists the gateway's models, with whatever it says about each
 *   probe    asks every chat model for structured output and for plain JSON; writes
 *            eval/models-probe.md and each model's finding into apps/api/models.json;
 *            `probe <model…>` asks only those named
 *   bakeoff  runs every candidate on every stage against the gold answers; writes
 *            eval/bakeoff/results.json and eval/models.md
 *   design   runs every candidate on planning and reviewing, after bakeoff; writes
 *            eval/bakeoff/design.json and eval/models.md again
 *   rescore  replays the recorded bake-off under today's scoring, calling nothing
 *   report   rewrites eval/models.md from the saved results, calling nothing
 *   serve    the API on 127.0.0.1 with live model calls, recorded (or replayed when recorded
 *            already), for /create on this machine
 *   job      `job <source> [--fresh]`: one job, with no server, as /create would start it (an arXiv id
 *            with its version or a PMCID), its events and artifacts kept in apps/api/data/jobs/; a
 *            paper made before under today's rules is served from the cache unless --fresh, which
 *            also asks every call anew, recorded in apps/api/data/recordings/ (R13, ADR-0053)
 *   prebuild `prebuild <source>... | --corpus [--fresh]`: makes each paper's world in turn, so a
 *            request for it is served at once; agent-experiment worlds are made only so (ADR-0053)
 *   planner-bakeoff  the timed planner bake-off (ADR-0055): first one call to each named planner
 *            asked not to think, to learn whether it honours that; then each candidate model asked
 *            the compact planner's prompt three times, each call timed and its picks validated;
 *            writes eval/bakeoff/planner.json and prints the table. Never recorded: each call is asked
 *   writer-bakeoff  the timed writer comparison (ADR-0058): `writer-bakeoff [<arXiv id with version>…]`,
 *            by default Attention Is All You Need; each paper read once by the reader, then each
 *            candidate coding model writing its mechanism through the whole fix loop, every call
 *            asked live and timed; writes eval/bakeoff/writer.json and each module beside it.
 *            Never recorded: each call is asked
 *   corpus-route  ingests every paper of fixtures/papers/corpus.json as a job would and runs the
 *            router on it, recorded; writes eval/routing/corpus-routes.json, the router's family,
 *            tier and reason for each, and what ingest read, never the paper's text (ADR-0052)
 *
 * Every run is recorded as one of PaperPlay's, so `npm run stop` stops it (ADR-0059); `serve` listens
 * on 127.0.0.1 and PAPERPLAY_API_PORT, as the API does.
 *
 * With --background, any command runs detached from the terminal (ADR-0051): its output goes to
 * apps/api/data/live/<time>-<command>.log, and <time>-<command>.json says what ran, when it began,
 * when it ended and how. A build session never starts one unless the owner asked for it in that
 * session's prompt; the next session reviews what it wrote: its recordings, jobs and results.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TERMINAL_STATES } from "@paperplay/contracts";
import { fetchArxiv, registerAndText } from "@paperplay/pipeline/ingest";
import { cappedClient, directoryStore, recordingClient, replayClient, resumingClient, thinkingClient } from "@paperplay/pipeline/models";
import { PLANNER_PAPERS, plannerCall, plannerCase, plannerTable, pickPlanners, type PlannerBakeoff } from "./bakeoff/planner.ts";
import { mechanismWriterInput, read, route } from "@paperplay/pipeline/stages";
import { WRITER_CANDIDATES, writerAttempt, writerTable } from "./bakeoff/writer.ts";
import { outboundFetch } from "../apps/api/src/contact.ts";
import { CONFIG_FILE, loadModelConfig } from "../apps/api/src/models/config.ts";
import { liveClient } from "../apps/api/src/models/live.ts";
import { pipelineRunner } from "../apps/api/src/runner.ts";
import { worldCache } from "../apps/api/src/cache.ts";
import { JobStore, parseSource } from "../apps/api/src/jobs.ts";
import { listen } from "../apps/api/src/listen.ts";
import { buildServer } from "../apps/api/src/server.ts";
import { runDesignBakeoff, type DesignResults } from "./bakeoff/design.ts";
import { rankReaders, toModelsMarkdown, transcriberPair } from "./bakeoff/report.ts";
import { agreement, CANDIDATES, runBakeoff, type BakeoffResults } from "./bakeoff/run.ts";
import { probeModel, type ProbeResult } from "./live/probe.ts";
import { heldLocks, holdLock, lockDir, whyNoLive } from "./machine/locks.ts";
import { registerServer } from "./machine/servers.ts";

const RECORDINGS = join(import.meta.dirname, "..", "fixtures", "recordings");
const [command] = process.argv.slice(2);

async function models(): Promise<void> {
  const client = liveClient();
  const listed = await client.listModels();
  for (const model of listed.sort((a, b) => a.id.localeCompare(b.id))) {
    console.log(`${model.id}${model.ownedBy ? `  (${model.ownedBy})` : ""}${Object.keys(model.details).length > 0 ? `  ${JSON.stringify(model.details)}` : ""}`);
  }
  console.log(`${listed.length} models`);
}

async function probe(): Promise<void> {
  const client = liveClient();
  const named = process.argv.slice(3);
  if (named.length > 0) return probeNamed(client, named);
  const chat = (await client.listModels()).filter((model) => model.details.mode === "chat").sort((a, b) => a.id.localeCompare(b.id));
  const recorded = recordingClient(client, directoryStore(RECORDINGS));
  console.log(`probing ${chat.length} chat models`);
  const results: ProbeResult[] = await Promise.all(
    chat.map(async (model) => {
      const result = await probeModel(recorded, model.id, model.details.supports_response_schema === true);
      console.log(`${result.model.padEnd(30)} schema ${result.structured.padEnd(13)} plain JSON ${result.plainJson.padEnd(13)} ${result.correct ? "correct" : "WRONG"} ${result.notes}`);
      return result;
    }),
  );
  const lines = [
    "# The capability probe",
    "",
    "Generated by `npm run pipeline:live -- probe` (scripts/live/probe.ts), which calls the Voyager gateway; the gate and",
    "CI never run it. Each chat model is asked the same small extraction twice: once with a JSON Schema the gateway should",
    "hold the reply to, and once for plain JSON, validated by Zod and retried once with the error (ADR-0030). The right",
    "answer is three compartments, S, I and R, and a recovery rate of 0.2 a day.",
    "",
    `Run on ${new Date().toISOString().slice(0, 10)}. The gateway's models marked "Testing in progress" in the Voyager portal are not visible`,
    "to its API, so none are left out here; the owner names them before any is chosen.",
    "",
    "| Model | The gateway says it supports schemas | With a schema | Plain JSON | Correct | Notes |",
    "|---|---|---|---|---|---|",
    ...results.map((result) => `| ${result.model} | ${result.claimsSchema ? "yes" : "no"} | ${result.structured} | ${result.plainJson} | ${result.correct ? "yes" : "no"} | ${result.notes.replaceAll("|", "/")} |`),
    "",
  ];
  writeFileSync(join(import.meta.dirname, "..", "eval", "models-probe.md"), lines.join("\n"));
  const config = loadModelConfig();
  const structuredOutput = Object.fromEntries(results.map((result) => [result.model, result.structured === "honoured"]));
  const raw = JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as Record<string, unknown>;
  writeFileSync(CONFIG_FILE, `${JSON.stringify({ ...raw, structuredOutput: { ...config.structuredOutput, ...structuredOutput } }, null, 2)}\n`);
  console.log(`wrote eval/models-probe.md and ${results.length} findings to apps/api/models.json`);
}

/**
 * `probe <model…>`: only the models named, such as a family member the gateway does not list on
 * its own; each finding goes into apps/api/models.json and a row under the probe's later section.
 */
async function probeNamed(client: ReturnType<typeof liveClient>, names: readonly string[]): Promise<void> {
  const recorded = recordingClient(client, directoryStore(RECORDINGS));
  const listed = new Map((await client.listModels()).map((model) => [model.id, model]));
  const results = await Promise.all(names.map((name) => probeModel(recorded, name, listed.get(name)?.details.supports_response_schema === true)));
  for (const result of results) console.log(`${result.model.padEnd(30)} schema ${result.structured.padEnd(13)} plain JSON ${result.plainJson.padEnd(13)} ${result.correct ? "correct" : "WRONG"} ${result.notes}`);
  const file = join(import.meta.dirname, "..", "eval", "models-probe.md");
  const heading = "## Probed later, by name";
  let text = readFileSync(file, "utf8");
  if (!text.includes(heading)) text = `${text.trimEnd()}\n\n${heading}\n\nModels probed on their own with \`npm run pipeline:live -- probe <model…>\`, such as a family's member that the gateway's list does not show.\n\n| Date | Model | Listed by the gateway | With a schema | Plain JSON | Correct | Notes |\n|---|---|---|---|---|---|---|\n`;
  const date = new Date().toISOString().slice(0, 10);
  text = `${text.trimEnd()}\n${results.map((result) => `| ${date} | ${result.model} | ${listed.has(result.model) ? "yes" : "no"} | ${result.structured} | ${result.plainJson} | ${result.correct ? "yes" : "no"} | ${result.notes.replaceAll("|", "/")} |`).join("\n")}\n`;
  writeFileSync(file, text);
  const config = loadModelConfig();
  const raw = JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as Record<string, unknown>;
  writeFileSync(CONFIG_FILE, `${JSON.stringify({ ...raw, structuredOutput: { ...config.structuredOutput, ...Object.fromEntries(results.map((result) => [result.model, result.structured === "honoured"])) } }, null, 2)}\n`);
  console.log(`wrote ${results.length} findings to eval/models-probe.md and apps/api/models.json`);
}

async function bakeoff(): Promise<void> {
  const config = loadModelConfig();
  // The slow reasoning models can take minutes on a long paper; one retry only, so a timeout is not paid for twice over.
  // Calls already recorded are replayed, so a run cut short resumes where it stopped.
  const client = cappedClient(resumingClient(liveClient({ ...config, timeoutMs: 1_800_000, retries: 1 }), directoryStore(RECORDINGS)), config.maxTokens);
  const results = await runBakeoff(client, config.structuredOutput);
  const folder = join(import.meta.dirname, "..", "eval", "bakeoff");
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
  const pair = transcriberPair(results, config.excluded);
  const agreed = pair.first && pair.second ? agreement(results, pair.first.model, pair.second.model) : [];
  writeFileSync(join(import.meta.dirname, "..", "eval", "models.md"), toModelsMarkdown(results, agreed, { date: new Date().toISOString().slice(0, 10) }, undefined, config.excluded));
  console.log("wrote eval/bakeoff/results.json and eval/models.md");
}

/** The bake-off's second half, planning and reviewing, on the first half's results; then the report again, whole. */
async function design(): Promise<void> {
  const config = loadModelConfig();
  // Calls already recorded are replayed, so a run cut short resumes where it stopped.
  const client = cappedClient(resumingClient(liveClient({ ...config, timeoutMs: 1_800_000, retries: 1 }), directoryStore(RECORDINGS)), config.maxTokens);
  const folder = join(import.meta.dirname, "..", "eval", "bakeoff");
  const results = JSON.parse(readFileSync(join(folder, "results.json"), "utf8")) as BakeoffResults;
  // Each paper's reading from the best reader, as the controller would have it.
  const best = rankReaders(results).find((row) => !config.excluded.models.includes(row.model))?.model;
  const readings = Object.fromEntries(results.readings.filter((entry) => entry.model === best && entry.outcome.ok).map((entry) => [entry.paper, (entry.outcome as { value: unknown }).value])) as Record<string, never>;
  // A live run reads the case worlds awaiting one too, and then they await it no longer.
  const designed: DesignResults = await runDesignBakeoff(client, config.structuredOutput, CANDIDATES, readings, { awaiting: true });
  const casesFile = join(import.meta.dirname, "..", "eval", "bakeoff", "review-cases.json");
  const cases = JSON.parse(readFileSync(casesFile, "utf8")) as { worlds: Record<string, unknown>[] };
  writeFileSync(casesFile, `${JSON.stringify({ ...cases, worlds: cases.worlds.map(({ awaitsRun: _, ...world }) => world) }, null, 2)}\n`);
  writeFileSync(join(folder, "design.json"), `${JSON.stringify(designed, null, 2)}\n`);
  const pair = transcriberPair(results, config.excluded);
  const agreed = pair.first && pair.second ? agreement(results, pair.first.model, pair.second.model) : [];
  writeFileSync(join(import.meta.dirname, "..", "eval", "models.md"), toModelsMarkdown(results, agreed, { date: new Date().toISOString().slice(0, 10) }, designed, config.excluded, plannerResults()));
  console.log("wrote eval/bakeoff/design.json and eval/models.md");
}

/**
 * The recorded bake-off scored again by today's rules, replaying its recordings, calling nothing:
 * for a change to scoring or the gold answers, never to a stage's prompt, which needs a new run.
 */
async function rescore(): Promise<void> {
  const config = loadModelConfig();
  const store = directoryStore(RECORDINGS);
  const folder = join(import.meta.dirname, "..", "eval", "bakeoff");
  const recorded = JSON.parse(readFileSync(join(folder, "results.json"), "utf8")) as BakeoffResults;
  const results = await runBakeoff(replayClient(store), config.structuredOutput, recorded.candidates);
  writeFileSync(join(folder, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
  const best = rankReaders(results).find((row) => !config.excluded.models.includes(row.model))?.model;
  const readings = Object.fromEntries(results.readings.filter((entry) => entry.model === best && entry.outcome.ok).map((entry) => [entry.paper, (entry.outcome as { value: unknown }).value])) as Record<string, never>;
  const designed = await runDesignBakeoff(replayClient(store), config.structuredOutput, recorded.candidates, readings);
  writeFileSync(join(folder, "design.json"), `${JSON.stringify(designed, null, 2)}\n`);
  console.log("wrote eval/bakeoff/results.json and design.json, replayed; now npm run pipeline:live -- report");
}

/** eval/models.md again from eval/bakeoff/, with no call to the gateway. */
async function report(): Promise<void> {
  const config = loadModelConfig();
  const folder = join(import.meta.dirname, "..", "eval", "bakeoff");
  const results = JSON.parse(readFileSync(join(folder, "results.json"), "utf8")) as BakeoffResults;
  const designed = existsSync(join(folder, "design.json")) ? (JSON.parse(readFileSync(join(folder, "design.json"), "utf8")) as DesignResults) : undefined;
  const written = readFileSync(join(import.meta.dirname, "..", "eval", "models.md"), "utf8");
  const date = /Run on (\d{4}-\d{2}-\d{2})/.exec(written)?.[1] ?? new Date().toISOString().slice(0, 10);
  const pair = transcriberPair(results, config.excluded);
  const agreed = pair.first && pair.second ? agreement(results, pair.first.model, pair.second.model) : [];
  writeFileSync(join(import.meta.dirname, "..", "eval", "models.md"), toModelsMarkdown(results, agreed, { date }, designed, config.excluded, plannerResults()));
  await Promise.resolve();
  console.log("wrote eval/models.md");
}

/** The API with live calls, recorded as they are made, so a job run here can be replayed by dev:api and the tests; a call already recorded is replayed. */
async function serve(): Promise<void> {
  const config = loadModelConfig();
  const missing = Object.entries(config.stages).filter(([, model]) => model === null).map(([stage]) => stage);
  if (missing.length > 0) throw new Error(`apps/api/models.json names no model for ${missing.join(", ")}; the bake-off chooses them (eval/models.md)`);
  // A call already recorded is replayed, so a job run again is the same job, at once.
  const client = resumingClient(liveClient(config), directoryStore(RECORDINGS));
  const app = buildServer({ runner: pipelineRunner(client, config, outboundFetch()) });
  await listen(app, "api live", "live model calls, recorded");
}

/** Recordings a fresh job makes, kept apart, so the committed ones the bake-offs replay are never overwritten. */
const FRESH_RECORDINGS = join(import.meta.dirname, "..", "apps", "api", "data", "recordings");

/** One paper's job to its end: served from the cache when made before under today's rules, unless fresh. */
async function oneJob(raw: string, fresh: boolean): Promise<void> {
  const source = parseSource(raw);
  if (!source) throw new Error(`a job takes an arXiv id with its version or a PMCID, such as pmc:PMC12334037, not "${raw}"`);
  const cache = worldCache();
  const kept = fresh ? null : cache.get(raw);
  if (kept) {
    console.log(`${raw}: served from the cache, made by job ${kept.jobId} at ${kept.madeAt} under the rules of ${kept.rules}`);
    return;
  }
  const config = loadModelConfig();
  // Fresh: every call asked of the gateway, as for a paper never seen, and recorded apart.
  const client = fresh ? recordingClient(liveClient(config), directoryStore(FRESH_RECORDINGS)) : resumingClient(liveClient(config), directoryStore(RECORDINGS));
  const store = new JobStore(pipelineRunner(client, config, outboundFetch()), undefined, undefined, cache);
  const started = store.start(raw, source);
  console.log(`job ${started.id}: ${raw}, its events in apps/api/data/jobs/${started.id}/events.jsonl`);
  await new Promise<void>((resolve) => {
    const check = (): void => {
      const now = store.get(started.id);
      if (now && TERMINAL_STATES.includes(now.state)) resolve();
      else setTimeout(check, 1000);
    };
    check();
  });
  const ended = store.get(started.id);
  console.log(`job ${started.id} ended ${ended?.state ?? "?"}: ${ended?.events.at(-1)?.message ?? ""}`);
}

async function job(): Promise<void> {
  await oneJob(process.argv.slice(3).find((value) => !value.startsWith("--")) ?? "", process.argv.includes("--fresh"));
}

/**
 * Pre-builds a list of papers, one job at a time so the gateway is never asked for more at once
 * than one job asks: the papers named, or with --corpus every paper of fixtures/papers/corpus.json.
 * A paper that fails is said and the next begins.
 */
async function prebuild(): Promise<void> {
  const named = process.argv.slice(3).filter((value) => !value.startsWith("--"));
  const corpus = process.argv.includes("--corpus") ? (JSON.parse(readFileSync(join(import.meta.dirname, "..", "fixtures", "papers", "corpus.json"), "utf8")) as { papers: { version: string }[] }).papers.map((paper) => `arxiv:${paper.version}`) : [];
  const sources = [...named, ...corpus];
  if (sources.length === 0) throw new Error("prebuild takes the papers to make, as arxiv:<id>v<n> or pmc:PMC<n>, or --corpus");
  for (const raw of sources) {
    try {
      await oneJob(raw, process.argv.includes("--fresh"));
    } catch (error) {
      console.log(`${raw}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    }
  }
}

/**
 * The router on every paper of the corpus, as a job would read it: ingested from arXiv, then routed
 * on its title, its abstract and its first display equations, recorded. Each result is written as it
 * comes, so a run stopped part way keeps what it routed; a paper ingest refuses is kept with why.
 */
async function corpusRoute(): Promise<void> {
  const config = loadModelConfig();
  const router = config.stages.router;
  if (!router) throw new Error("apps/api/models.json names no router");
  const client = cappedClient(resumingClient(liveClient(config), directoryStore(RECORDINGS)), config.maxTokens);
  const fetch = outboundFetch();
  const corpus = JSON.parse(readFileSync(join(import.meta.dirname, "..", "fixtures", "papers", "corpus.json"), "utf8")) as { papers: { id: string; version: string; group: string }[] };
  const out = join(import.meta.dirname, "..", "eval", "routing", "corpus-routes.json");
  const routes: unknown[] = [];
  for (const paper of corpus.papers) {
    try {
      const fetched = await fetchArxiv(fetch, paper.version);
      const { text } = registerAndText(fetched, new Date().toISOString());
      const front = text.sections.find((section) => section.title === "Abstract");
      const abstract = front ? text.text.slice(front.start, front.end) : text.text.slice(0, 2000);
      const decision = await route(client, router, { title: fetched.title, abstract, equations: text.equations.slice(0, 6).map((equation) => equation.latex.slice(0, 300)) }, { structuredOutput: config.structuredOutput[router] ?? false, capabilities: true });
      routes.push({ id: paper.id, version: paper.version, group: paper.group, ingest: { route: fetched.route, sections: text.sections.length, equations: text.equations.length }, router, decision: decision.value });
      console.log(`${paper.id}: ${decision.value.family}, tier ${decision.value.tier}`);
    } catch (error) {
      routes.push({ id: paper.id, version: paper.version, group: paper.group, error: error instanceof Error ? error.message.split("\n")[0] : String(error) });
      console.log(`${paper.id}: refused, ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    }
    writeFileSync(out, `${JSON.stringify({ schemaVersion: "corpus-routes/1", routedOn: new Date().toISOString().slice(0, 10), routes }, null, 2)}\n`);
    await new Promise((resolve) => setTimeout(resolve, 3000)); // arXiv asks for a pause between requests.
  }
}

/** The planner bake-off's results, once it has run (ADR-0055). */
const plannerResults = (): PlannerBakeoff | undefined => {
  const file = join(import.meta.dirname, "..", "eval", "bakeoff", "planner.json");
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as PlannerBakeoff) : undefined;
};

/** The planner bake-off's models (the owner, 2026-10-25), and the two probed for the thinking switch first. */
const PLANNER_CANDIDATES = ["kimi-k2-7-code", "glm-5-3", "glm-5-3-flash", "qwen36-35b-a3b", "muse-glimmer-30b", "qwen36-27b"] as const;
const THINKING_PROBED = ["kimi-k2-7-code", "glm-5-3"] as const;

async function plannerBakeoff(): Promise<void> {
  const config = loadModelConfig();
  const reviewers = [config.stages.reviewer, config.stages["second-reviewer"]];
  const models = PLANNER_CANDIDATES.filter((model) => !reviewers.includes(model));
  // Asked live every time, never replayed: three calls of one prompt must each be timed.
  const live = thinkingClient(liveClient(config), { probe: false, planner: false });
  const probes = await Promise.all(
    THINKING_PROBED.map(async (model) => {
      const started = performance.now();
      try {
        const answer = await live.complete({ stage: "probe", model, messages: [{ role: "user", content: 'Reply with the JSON {"ok": true} and nothing else.' }], temperature: 0, maxTokens: 4000 });
        return { model, milliseconds: performance.now() - started, completionTokens: answer.usage.completionTokens, answerCharacters: answer.text.length, honours: answer.usage.completionTokens - answer.text.length / 4 <= 20, error: null };
      } catch (error) {
        return { model, milliseconds: performance.now() - started, completionTokens: null, answerCharacters: null, honours: false, error: error instanceof Error ? error.message.split("\n")[0] : String(error) };
      }
    }),
  );
  for (const probe of probes) console.log(`probe ${probe.model}: ${probe.error ?? `${probe.completionTokens} reply tokens for ${probe.answerCharacters} characters, ${Math.round(probe.milliseconds)} ms: ${probe.honours ? "honours" : "does not honour"} the switch`}`);
  const cases = await Promise.all(PLANNER_PAPERS.map((entry) => plannerCase(entry.paper, entry.job)));
  const order = [cases[0], cases[1], cases[0]].filter((entry): entry is (typeof cases)[number] => entry !== undefined);
  for (const entry of cases) console.log(`${entry.paper}: ${entry.candidates.length} candidates shown`);
  const calls = (
    await Promise.all(
      models.map(async (model) => {
        const mine = [];
        for (const entry of order) {
          const call = await plannerCall(live, model, entry, config.structuredOutput[model] ?? false);
          console.log(`${model} on ${entry.paper}: ${call.ok ? `${call.passing} of ${call.levels} levels pass${call.problems.length > 0 ? ` (${call.problems.slice(0, 2).join("; ")})` : ""}` : `failed: ${call.error ?? ""}`}, ${Math.round(call.milliseconds / 100) / 10} s, ${call.completionTokens ?? "?"} reply tokens`);
          mine.push(call);
        }
        return mine;
      }),
    )
  ).flat();
  const rows = plannerTable(calls);
  const [first, second] = pickPlanners(rows);
  writeFileSync(join(import.meta.dirname, "..", "eval", "bakeoff", "planner.json"), `${JSON.stringify({ schemaVersion: "planner-bakeoff/1", ranOn: new Date().toISOString().slice(0, 10), probes, papers: cases.map((entry) => ({ paper: entry.paper, candidates: entry.candidates.length })), calls, rows, picked: { planner: first, secondPlanner: second } }, null, 2)}\n`);
  console.log(rows.map((row) => `${row.model}: ${row.valid} of ${row.calls} valid, ${row.passingMean.toFixed(1)} levels passing, p50 ${(row.p50 / 1000).toFixed(1)} s, p90 ${(row.p90 / 1000).toFixed(1)} s, ${row.completionMean === null ? "?" : Math.round(row.completionMean)} reply tokens`).join("\n"));
  console.log(`picked: ${first ?? "none"} and ${second ?? "none"}`);
}

/** The writer comparison's papers by default: the one the tier is first run on end to end (the owner, 2026-10-26). */
const WRITER_PAPERS = ["1706.03762v7"] as const;

async function writerBakeoff(): Promise<void> {
  const config = loadModelConfig();
  const reader = config.stages.reader;
  if (!reader) throw new Error("apps/api/models.json names no reader");
  const reviewers = [config.stages.reviewer, config.stages["second-reviewer"]];
  const models = WRITER_CANDIDATES.filter((model) => !reviewers.includes(model));
  // Asked live every time, never replayed or recorded: each call must be timed, and the job run
  // after this must read the paper afresh.
  const live = thinkingClient(liveClient(config), { reader: config.thinking.reader, writer: false });
  const example = readFileSync(join(import.meta.dirname, "..", "fixtures", "mechanisms", "heat-diffusion.js"), "utf8");
  const papers = process.argv.slice(3).filter((value) => !value.startsWith("--"));
  const out = join(import.meta.dirname, "..", "eval", "bakeoff", "writer");
  mkdirSync(out, { recursive: true });
  const attempts = [];
  for (const paper of papers.length > 0 ? papers : WRITER_PAPERS) {
    const fetched = await fetchArxiv(outboundFetch(), paper);
    const { text } = registerAndText(fetched, new Date().toISOString());
    const began = performance.now();
    const reading = await read(live, reader, text, fetched.title, { structuredOutput: config.structuredOutput[reader] ?? false, sections: true });
    console.log(`${paper}: read by ${reader} in ${Math.round((performance.now() - began) / 100) / 10} s; mechanism: ${reading.value.mechanism}`);
    const input = mechanismWriterInput(text, fetched.title, reading.value, example);
    const results = await Promise.all(models.map((model) => writerAttempt(live, model, paper, input, config.maxTokens.writer)));
    for (const { attempt, source } of results) {
      if (source) writeFileSync(join(out, `${paper}-${attempt.model}.js`), `${source}\n`);
      console.log(`${attempt.model} on ${paper}: ${attempt.outcome}${attempt.reason ? ` (${attempt.reason})` : ""}, ${attempt.seconds} s over ${attempt.rounds.length} round(s): ${attempt.rounds.map((round) => `${round.writeSeconds} s write, ${round.checkSeconds} s check, ${round.failed.length > 0 ? `failed ${round.failed.join(", ")}` : "passed"}`).join("; ")}`);
      attempts.push(attempt);
    }
  }
  const rows = writerTable(attempts);
  writeFileSync(join(import.meta.dirname, "..", "eval", "bakeoff", "writer.json"), `${JSON.stringify({ schemaVersion: "writer-bakeoff/1", ranOn: new Date().toISOString().slice(0, 10), reader, attempts, rows, picked: rows[0]?.passed ? rows[0].model : null }, null, 2)}\n`);
  console.log(rows.map((row) => `${row.model}: ${row.passed} of ${row.attempts} passed, ${Number.isFinite(row.meanSeconds) ? `${row.meanSeconds.toFixed(1)} s on average when it passed` : "never passed"}, ${row.meanRounds.toFixed(1)} rounds`).join("\n"));
  console.log(`picked: ${rows[0]?.passed ? rows[0].model : "none"}`);
}

const commands: Readonly<Record<string, () => Promise<void>>> = { models, probe, bakeoff, design, rescore, report, serve, job, prebuild, "planner-bakeoff": plannerBakeoff, "writer-bakeoff": writerBakeoff, "corpus-route": corpusRoute };
const run = command === undefined ? undefined : commands[command];
if (!run) {
  console.error(`usage: npm run pipeline:live -- <${Object.keys(commands).join("|")}>`);
  process.exit(2);
}
// --background: run this same command detached, its output in a log, and say where (ADR-0051).
const LIVE = join(import.meta.dirname, "..", "apps", "api", "data", "live");
if (process.argv.includes("--background")) {
  mkdirSync(LIVE, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `${stamp}-${command ?? "command"}`;
  const log = join(LIVE, `${name}.log`);
  const output = openSync(log, "a");
  const child = spawn(process.execPath, [process.argv[1] ?? "", ...process.argv.slice(2).filter((value) => value !== "--background")], {
    detached: true,
    stdio: ["ignore", output, output],
    env: { ...process.env, PAPERPLAY_LIVE_RECORD: join(LIVE, `${name}.json`) },
  });
  writeFileSync(join(LIVE, `${name}.json`), `${JSON.stringify({ command: process.argv.slice(2).filter((value) => value !== "--background"), pid: child.pid, startedAt: new Date().toISOString(), log }, null, 2)}\n`);
  child.unref();
  console.log(`pipeline:live ${command ?? ""} runs in the background, pid ${String(child.pid)}; its output goes to ${log}`);
  process.exit(0);
}
// A command run in the background records how it ended beside its log.
const liveRecord = process.env["PAPERPLAY_LIVE_RECORD"];
if (liveRecord && existsSync(liveRecord)) {
  process.on("exit", (code) => {
    const begun = JSON.parse(readFileSync(liveRecord, "utf8")) as Record<string, unknown>;
    writeFileSync(liveRecord, `${JSON.stringify({ ...begun, endedAt: new Date().toISOString(), exitCode: code }, null, 2)}\n`);
  });
}
// Live jobs and gates never share the machine (ADR-0039): a command that calls the gateway holds
// a live lock while it runs, and does not start while a gate runs. rescore and report call nothing.
if (!["rescore", "report"].includes(command ?? "")) {
  const locks = lockDir(join(import.meta.dirname, ".."));
  const refusal = whyNoLive(heldLocks(locks, "gate"));
  if (refusal !== null) {
    console.error(`pipeline:live refused: ${refusal}.`);
    process.exit(1);
  }
  holdLock(locks, "live", `pipeline:live ${command ?? ""}`);
}
// A run is one of PaperPlay's, so `npm run stop` can stop it (ADR-0059); serve records itself as the API.
if (command !== "serve") registerServer(`live ${command ?? ""}`, null);
await run();
