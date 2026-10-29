import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canMove, GENERATED_MODEL_LABEL, SourceText, type JobState, type SourceRegisterEntry } from "@paperplay/contracts";
import { registry } from "@paperplay/primitives";
import { describe, expect, it } from "vitest";
import { buildWorld } from "../src/builder/build.ts";
import { garbledName } from "../src/controller/mechanism.ts";
import { runJob, type JobSink } from "../src/controller/run.ts";
import type { ChatRequest, ModelClient } from "../src/models/index.ts";

// The generated-mechanism tier's job (ADR-0058), on a synthetic paper no family covers, every model
// reply from a script and the module run for real in its sandbox: the writer's module is checked,
// its candidate levels judged over 20 seeds, the planner chooses, the explainer writes, the reviewers
// read, and the world is ready on a generated model, labelled as one. A paper the writer finds
// nothing to play in, or a module that never passes, falls back to the explainer page.

const root = join(import.meta.dirname, "..", "..", "..");
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
const offset = (needle: string): number => TEXT.indexOf(needle);
const source: SourceText = SourceText.parse({
  schemaVersion: "sourcetext/1",
  sourceId: "test-heat",
  sha256: createHash("sha256").update(TEXT).digest("hex"),
  text: TEXT,
  sections: [
    { id: "front", title: "Title", start: 0, end: offset("Abstract") },
    { id: "s2-abstract", title: "Abstract", start: offset("Abstract"), end: offset("Model\n") },
    { id: "s3-model", title: "Model", start: offset("Model\n"), end: TEXT.length },
  ],
  equations: [],
  macros: [],
});
const register: SourceRegisterEntry = {
  sourceId: "test-heat",
  title: "Heat on a plate",
  authors: ["Ada Lovelace"],
  year: 2026,
  venue: null,
  identifiers: {},
  route: "arxiv-source",
  licence: "cc-by",
  licenceUrl: "http://creativecommons.org/licenses/by/4.0/",
  licenceEvidence: "a test",
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
  beginner: { text: "Heat spreads out.", analogy: "Like milk in coffee." },
  intermediate: { text: "The diffusion sets the spread." },
  advanced: { text: "Each cell moves toward its neighbours.", equation: "u ← u + D∇²u", quote: null },
  guide: { idle: "Watch the heat spread.", raised: "You raised it{to}, so heat spreads faster.", lowered: "You lowered it{to}, so heat spreads slower.", readings: [{ atLeast: 0.5, words: "hot" }, { atLeast: 0, words: "cool" }], rising: "and rising", falling: "and falling" },
  afterwards: { text: "The plate evens out.", quote: null, question: "Why does it even out?" },
};
const written = { ...words, title: "A level", goal: "Move the control and watch.", control: { label: "Diffusion", lowEnd: "Slow", highEnd: "Fast" }, whatIf: "What if heat spread slower?", effect: "The What-if differs by more than the claim.", prediction: { prompt: "Would it differ?", claimed: "Yes", other: "No" }, passageTitle: "The paper says", carryForward: "Spreading evens heat." };

/** A level's words written again, in the shape a rewrite answers with: its depths, and its four sentences. */
const rewritten = { ...words, goal: "Move the control and watch.", whatIf: "What if heat spread at a different rate?", prediction: "Will the other plate differ?", effect: "The What-if differs by more than the claim." };

/** A client for the tier: the writer's modules in turn, the planner choosing the first three candidates it is shown, and the rest scripted. */
function tierClient(writer: readonly string[], options: { readonly reviewer?: unknown; readonly words?: Partial<typeof written>; readonly reworded?: Partial<typeof rewritten> } = {}) {
  const calls: ChatRequest[] = [];
  let writes = 0;
  const client: ModelClient = {
    complete(request) {
      calls.push(request);
      const content = request.messages.map((message) => message.content).join("\n");
      let text: string;
      if (request.stage === "router") text = JSON.stringify({ domain: "physics", mechanism: "Heat diffusing on a plate.", family: "none", tier: "C", reason: "No family plays a field's diffusion from papers yet." });
      else if (request.stage === "reader") text = JSON.stringify(reading);
      else if (request.stage === "writer") text = writer[Math.min(writes++, writer.length - 1)] ?? "";
      else if (request.stage === "planner" || request.stage === "second-planner") {
        // The hook from its own list when there is one, then the first two of the others, as a planner must.
        const [hooks = "", rest = ""] = content.split("Candidates for levels 2 to 5");
        const idsIn = (part: string) => [...part.matchAll(/^(g\d+): /gm)].map((match) => match[1] ?? "");
        const ids = rest ? [idsIn(hooks)[0] ?? "", ...idsIn(rest), ...idsIn(hooks).slice(1)].slice(0, 3) : idsIn(content).slice(0, 3);
        text = JSON.stringify({ levels: ids.map((candidate, index) => ({ candidate, finding: index })) });
      } else if (request.stage === "explainer") text = JSON.stringify(content.includes("You name a small learning game") ? { title: "The Warm Plate", limits: ["It leaves out the plate's thickness."] } : content.includes("words misdescribe the model") ? { ...rewritten, ...options.reworded } : { ...written, ...options.words });
      else if (request.stage === "reviewer") text = JSON.stringify(typeof options.reviewer === "function" ? (options.reviewer as (content: string) => unknown)(content) : (options.reviewer ?? { findings: [] }));
      else return Promise.reject(new Error(`no scripted reply for ${request.stage}`));
      return Promise.resolve({ model: request.model, text, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, finishReason: "stop" });
    },
  };
  return { client, calls };
}

async function run(client: ModelClient, stageMs: Partial<Record<"writer", number>> = {}) {
  const events: { state: JobState; step: string; message: string }[] = [];
  const artifacts = new Map<string, unknown>();
  const sink: JobSink = { emit: (state, step, message) => void events.push({ state, step, message }), artifact: (name, value) => void artifacts.set(name, value) };
  const outcome = await runJob(
    {
      source: { kind: "ingested", text: source, register },
      client,
      config: { stages: { reader: "m-reader", router: "m-router", planner: "m-planner", explainer: "m-explainer", reviewer: "m-reviewer", writer: "m-writer" }, structuredOutput: {}, planning: "candidates", mechanisms: { example: heat } },
      fetch: () => Promise.reject(new Error("no network")),
      example: "",
      deadline: { jobMs: 60_000, mechanismJobMs: 600_000, stageMs },
    },
    sink,
  );
  const states = events.map((event) => event.state).filter((state, index, all) => index === 0 || state !== all[index - 1]);
  return { outcome, events, artifacts, states };
}

const fenced = (module: string): string => `\`\`\`javascript\n${module}\n\`\`\``;

describe("[R08] [R11] the generated-mechanism tier's job (ADR-0058)", () => {
  it("writes the module, checks it, and makes a world from it through the rules every world meets, labelled as generated", async () => {
    const { client, calls } = tierClient([fenced(heat)]);
    const { outcome, states, artifacts, events } = await run(client);
    expect(outcome.state, events.at(-1)?.message).toBe("ready");
    expect(states).toEqual(["received", "parsing", "planning", "building", "running", "checking", "ready"]);
    states.slice(1).forEach((state, index) => expect(canMove(states[index] as JobState, state)).toBe(true));
    // The writer was asked once, the module passed, and every stage after it is the machinery's own.
    expect(calls.map((call) => call.stage).filter((stage, index, all) => all.indexOf(stage) === index)).toEqual(["router", "reader", "writer", "planner", "explainer", "reviewer"]);
    const mechanism = artifacts.get("mechanism") as { sha256: string; source: string };
    expect(mechanism.sha256).toBe(createHash("sha256").update(mechanism.source).digest("hex"));
    const world = artifacts.get("world") as { routing: { tier: string; family: string }; status: string; levels: { binding: { type: string; module: { sha256: string } } }[] };
    expect(world.routing).toMatchObject({ tier: "generated", family: "generated" });
    expect(world.status).toBe("draft");
    expect(world.levels.every((level) => level.binding.type === "mechanism" && level.binding.module.sha256 === mechanism.sha256)).toBe(true);
    const built = buildWorld(world, registry);
    expect(built.ok).toBe(true);
    if (built.ok) expect(built.world.family.label).toBe(GENERATED_MODEL_LABEL);
    expect(events.find((event) => event.step === "release")?.message).toMatch(/levels pass every check and are playable/);
  }, 60_000);

  it("knows a garbled world name: its instruction repeated, a run-on phrase, or a list", () => {
    expect(garbledName("at most 5 words, naming the paper's sujb")).toBe(true);
    expect(garbledName("Attention, the paper's big idea: why it works")).toBe(true);
    expect(garbledName("A world where every token watches every other token closely")).toBe(true);
    expect(garbledName("The Warm Plate")).toBe(false);
    expect(garbledName("Attention in a row of words")).toBe(false);
  });

  it("names the world by its module when the explainer's name repeats its instruction", async () => {
    const { client } = tierClient([fenced(heat)]);
    const echoing: ModelClient = { complete: (request) => (request.stage === "explainer" && request.messages.some((message) => message.content.includes("You name a small learning game")) ? Promise.resolve({ model: request.model, text: JSON.stringify({ title: "at most 5 words, naming the paper's sujb", limits: ["It is a toy."] }), usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, finishReason: "stop" }) : client.complete(request)) };
    const { outcome, artifacts } = await run(echoing);
    expect(outcome.state).toBe("ready");
    expect((artifacts.get("world") as { title: string }).title).toBe("Heat spreading over a plate");
  }, 60_000);

  it("sends the checks' problems back to the writer, at most three times, then falls back to the explainer page", async () => {
    const deaf = heat.replace("const cells = new Array(old.length);", "const cells = new Array(old.length);\n    params = { diffusion: 0.12, cooling: 0.05 };");
    const fixed = await run(tierClient([fenced(deaf), fenced(heat)]).client);
    expect(fixed.outcome.state).toBe("ready");
    expect(fixed.states.slice(0, 5)).toEqual(["received", "parsing", "planning", "repairing", "planning"]);
    const never = await run(tierClient([fenced(deaf)]).client);
    expect(never.outcome.state).toBe("unsupported");
    expect(never.outcome.message).toMatch(/still fails its checks.*explainer page, tier C/);
    expect([0, 1, 2, 3].every((round) => never.artifacts.has(`mechanism-round-${round}`))).toBe(true);
    expect(never.artifacts.has("mechanism-round-4")).toBe(false);
    const page = never.artifacts.get("explainer") as { findings: { origin: string; quote: string | null }[]; why: string };
    expect(page.why).toMatch(/still fails its checks/);
    expect(page.findings.map((finding) => finding.origin)).toEqual(["paper-derived", "paper-derived", "paper-derived"]);
  }, 60_000);

  it("falls back to the explainer page when the writer never answers within its time, after asking again", async () => {
    const { client } = tierClient([fenced(heat)]);
    const slow: ModelClient = { complete: (request) => (request.stage === "writer" ? new Promise((resolve) => setTimeout(() => resolve(client.complete(request)), 400)) : client.complete(request)) };
    const { outcome, artifacts } = await run(slow, { writer: 100 });
    expect(outcome.state).toBe("unsupported");
    expect(outcome.message).toMatch(/explainer page, tier C/);
    expect([0, 1, 2, 3].every((round) => (artifacts.get(`mechanism-round-${round}`) as { problems: string } | undefined)?.problems.includes("did not arrive"))).toBe(true);
    expect(artifacts.has("explainer")).toBe(true);
  }, 60_000);

  it("replaces a hook whose What-if a reviewer refuses with the next hook-eligible candidate, never rewording it (ADR-0058's amendment)", async () => {
    let blocked = 0;
    const reviewer = (content: string) => {
      if (/^Level 1,/m.test(content) && (blocked += 1) === 1) return { findings: [{ level: 1, severity: "blocking", kind: "what-if", finding: "This What-if cannot teach the level.", suggestion: "Change the setting as the paper means it." }] };
      return { findings: [] };
    };
    const { client, calls } = tierClient([fenced(heat)], { reviewer });
    const { outcome, events, artifacts } = await run(client);
    expect(outcome.state, events.at(-1)?.message).toBe("ready");
    const hookOf = (world: unknown) => (world as { levels: { counterfactual: { altParams: Record<string, number> } }[] }).levels[0]?.counterfactual.altParams;
    const before = hookOf((artifacts.get("released") as { world: unknown }).world);
    const after = hookOf(artifacts.get("world"));
    expect(after).not.toEqual(before);
    // Both What-ifs take a parameter away as the paper means it: diffusion or cooling at 0.
    expect(Object.values(before ?? {})).toEqual([0]);
    expect(Object.values(after ?? {})).toEqual([0]);
    expect(events.some((event) => event.state === "repairing" && event.message.includes("replacing level 1"))).toBe(true);
    expect(events.some((event) => /level 1 is now g\d+/.test(event.message))).toBe(true);
    expect(calls.some((call) => call.stage === "explainer" && call.messages.some((message) => message.content.includes("words misdescribe the model")))).toBe(false);
  }, 60_000);

  it("writes again the words a reviewer finds misdescribe the module, and keeps the level", async () => {
    let blocked = 0;
    const reviewer = (content: string) => (/^Level 2,/m.test(content) && (blocked += 1) === 1 ? { findings: [{ level: 2, severity: "blocking", kind: "wording", finding: "It says the plate heats up.", suggestion: "Say it cools." }] } : { findings: [] });
    const { client, calls } = tierClient([fenced(heat)], { reviewer });
    const { outcome, events } = await run(client);
    expect(outcome.state, events.slice(-4).map((event) => event.message).join(" | ")).toBe("ready");
    expect(events.some((event) => event.message.includes("writing again the words of level 2"))).toBe(true);
    expect(calls.filter((call) => call.stage === "explainer" && call.messages.some((message) => message.content.includes("words misdescribe the model")))).toHaveLength(1);
  }, 60_000);

  it("writes again a What-if worded as taking a setting away where its value does not (ADR-0058's amendment)", async () => {
    const { outcome, events } = await run(tierClient([fenced(heat)], { words: { whatIf: "What if the edge's cooling were removed?" }, reworded: { whatIf: "What if the rate were set to its highest?" } }).client);
    expect(outcome.state, events.at(-1)?.message).toBe("ready");
    // One level sets a parameter without taking it away (its highest); its words said otherwise, and are written again.
    expect(events.filter((event) => event.step === "words" && event.message.includes("its What-if says it takes"))).toHaveLength(1);
  }, 60_000);

  it("takes the writer's refusal as the paper's answer, and shows the explainer page instead", async () => {
    const { outcome, artifacts } = await run(tierClient(["NO MECHANISM: the paper is a survey of plates."]).client);
    expect(outcome.state).toBe("unsupported");
    expect(outcome.message).toMatch(/no mechanism a learner could play with: the paper is a survey of plates/);
    expect(artifacts.has("explainer")).toBe(true);
    expect(artifacts.has("world")).toBe(false);
  }, 60_000);
});
