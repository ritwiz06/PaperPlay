/**
 * A generated world for the browser's tests (ADR-0058): the generated-mechanism tier's job on a
 * synthetic paper about heat on a plate, as packages/pipeline/test/controller.mechanism.test.ts runs
 * it, every model reply scripted and the hand-written heat module run for real in its sandbox. Run
 * `node scripts/fixtures/heat-plate.ts` to write fixtures/mechanisms/heat-plate.world.json, the
 * world and its module as the API's cache keeps them; tests/e2e/mechanism-world.spec.ts serves it.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SourceText, type SourceRegisterEntry } from "@paperplay/contracts";
import { runJob, type JobSink } from "@paperplay/pipeline/controller";
import type { ModelClient } from "@paperplay/pipeline/models";

const root = join(import.meta.dirname, "..", "..");
const heat = readFileSync(join(root, "fixtures", "mechanisms", "heat-diffusion.js"), "utf8");

const TEXT = [
  "Heat on a plate",
  "",
  "Abstract",
  "",
  "We study how heat spreads over a thin square plate whose edge loses heat to the air.",
  "",
  "Model",
  "",
  "Each point of the plate moves toward the average of its neighbours, at a rate set by the diffusion coefficient.",
  "The edge loses heat to the air at a cooling rate.",
  "Hot spots flatten out as heat spreads.",
  "With slower diffusion the hottest point stays hot for longer.",
  "Faster cooling at the edge lowers the plate's average temperature.",
].join("\n");
const at = (needle: string): number => TEXT.indexOf(needle);
const source = SourceText.parse({
  schemaVersion: "sourcetext/1",
  sourceId: "fixture-heat",
  sha256: createHash("sha256").update(TEXT).digest("hex"),
  text: TEXT,
  sections: [
    { id: "front", title: "Title", start: 0, end: at("Abstract") },
    { id: "s2-abstract", title: "Abstract", start: at("Abstract"), end: at("Model\n") },
    { id: "s3-model", title: "Model", start: at("Model\n"), end: TEXT.length },
  ],
  equations: [],
  macros: [],
});
const register: SourceRegisterEntry = {
  sourceId: "fixture-heat",
  title: "Heat on a plate",
  authors: ["A. Fixture"],
  year: 2026,
  venue: null,
  identifiers: {},
  route: "arxiv-source",
  licence: "cc-by",
  licenceUrl: "http://creativecommons.org/licenses/by/4.0/",
  licenceEvidence: "a synthetic paper for tests",
  sha256: "0".repeat(64),
  accessedAt: "2026-10-26T00:00:00.000Z",
  textKept: true,
  attribution: "A synthetic paper for tests.",
};
const reading = {
  question: "How does heat spread over a plate?",
  mechanism: "Heat diffuses toward the neighbours' average and the edge cools.",
  modelEquations: [],
  result: { text: "Hot spots flatten out.", quote: "Hot spots flatten out as heat spreads." },
  findings: [
    { kind: "result", text: "Slower diffusion keeps the hottest point hot for longer.", quote: "With slower diffusion the hottest point stays hot for longer." },
    { kind: "result", text: "Faster cooling lowers the average temperature.", quote: "Faster cooling at the edge lowers the plate's average temperature." },
  ],
};
const words = {
  beginner: { text: "Heat spreads out from the hot spots until the plate is even.", analogy: "Like a drop of milk spreading through coffee." },
  intermediate: { text: "The diffusion rate sets how fast each spot shares its heat with its neighbours." },
  advanced: { text: "Each cell moves toward its neighbours' average by the diffusion rate times the discrete Laplacian.", equation: "u ← u + D ∇²u", quote: null },
  guide: { idle: "Watch the hot spots spread.", raised: "You raised it{to}, so heat spreads faster.", lowered: "You lowered it{to}, so heat spreads slower.", readings: [{ atLeast: 0.5, words: "hot" }, { atLeast: 0.1, words: "warm" }, { atLeast: 0, words: "cool" }], rising: "and rising", falling: "and falling" },
  afterwards: { text: "The plate evens out as heat spreads from hot to cool.", quote: null, question: "Why does the hottest point cool?" },
};
const written = { ...words, title: "Spreading heat", goal: "Move the diffusion rate and watch the hot spots.", control: { label: "Diffusion rate", lowEnd: "Slow", highEnd: "Fast" }, whatIf: "What if heat spread at a different rate?", effect: "The other plate differs by more than the level states.", prediction: { prompt: "Will the other plate differ?", claimed: "Yes", other: "No" }, passageTitle: "How heat spreads", carryForward: "Spreading evens out heat." };

const client: ModelClient = {
  complete(request) {
    const content = request.messages.map((message) => message.content).join("\n");
    let text: string;
    if (request.stage === "router") text = JSON.stringify({ domain: "physics", mechanism: "Heat diffusing on a plate.", family: "none", tier: "C", reason: "No family plays a field's diffusion from papers yet." });
    else if (request.stage === "reader") text = JSON.stringify(reading);
    else if (request.stage === "writer") text = `\`\`\`javascript\n${heat}\n\`\`\``;
    else if (request.stage === "planner") text = JSON.stringify({ levels: [...content.matchAll(/^(g\d+): /gm)].slice(0, 3).map((match, index) => ({ candidate: match[1] ?? "", finding: index })) });
    else if (request.stage === "explainer") text = JSON.stringify(content.includes("You name a small learning game") ? { title: "The Warm Plate", limits: ["It leaves out the plate's thickness."] } : written);
    else if (request.stage === "reviewer") text = JSON.stringify({ findings: [] });
    else return Promise.reject(new Error(`no scripted reply for ${request.stage}`));
    return Promise.resolve({ model: request.model, text, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, finishReason: "stop" });
  },
};

const artifacts = new Map<string, unknown>();
const sink: JobSink = { emit: () => undefined, artifact: (name, value) => void artifacts.set(name, value) };
const outcome = await runJob(
  {
    source: { kind: "ingested", text: source, register },
    client,
    config: { stages: { reader: "m-reader", router: "m-router", planner: "m-planner", explainer: "m-explainer", reviewer: "m-reviewer", writer: "m-writer" }, structuredOutput: {}, planning: "candidates", mechanisms: { example: heat } },
    fetch: () => Promise.reject(new Error("no network")),
    example: "",
  },
  sink,
);
if (outcome.state !== "ready") throw new Error(`the job ended ${outcome.state}: ${outcome.message}`);
const out = join(root, "fixtures", "mechanisms", "heat-plate.world.json");
writeFileSync(out, `${JSON.stringify({ world: artifacts.get("world"), mechanism: artifacts.get("mechanism") }, null, 2)}\n`);
console.log(`wrote ${out}`);
