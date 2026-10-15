import { createHash } from "node:crypto";
import { canMove, JOB_TRANSITIONS, JobState, SourceText, type JobState as State, type SourceRegisterEntry } from "@paperplay/contracts";
import { describe, expect, it } from "vitest";
import { runJob, type JobConfig, type JobSink } from "../src/controller/run.ts";
import type { ChatRequest, ModelClient } from "../src/models/index.ts";

// The controller (R10, R11): real states only, along the allowed transitions; at most two scoped
// repairs; `ready` only when the builder, the family's checks, the level rule and provenance have
// passed. The paper here is synthetic, and every model reply comes from a script.

const TEXT = [
  "A small epidemic model",
  "",
  "Abstract",
  "",
  "We model an epidemic in a town of people who are susceptible, infected or recovered.",
  "",
  "Model",
  "",
  "The susceptible S, the infected I and the recovered R change as",
  "dS/dt = -beta S I, dI/dt = beta S I - gamma I, dR/dt = gamma I.",
  "The infection rate is beta = 0.0003 per person per day and the recovery rate is gamma = 0.1 per day.",
  "At the start S(0) = 995, I(0) = 5 and R(0) = 0.",
  "The epidemic ends before everyone has been infected.",
].join("\n");
const offset = (needle: string): number => TEXT.indexOf(needle);
const source: SourceText = SourceText.parse({
  schemaVersion: "sourcetext/1",
  sourceId: "test-sir",
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
  sourceId: "test-sir",
  title: "A small epidemic model",
  authors: ["Ada Lovelace"],
  year: 2026,
  venue: null,
  identifiers: {},
  route: "arxiv-source",
  licence: "cc-by",
  licenceUrl: "http://creativecommons.org/licenses/by/4.0/",
  licenceEvidence: "a test",
  sha256: "0".repeat(64),
  accessedAt: "2026-10-14T00:00:00.000Z",
  textKept: true,
  attribution: "a test",
};

const transcription = (gamma = 0.1) => ({
  timeUnit: "day",
  compartments: [
    { id: "S", symbol: "S", name: "Susceptible", unit: { people: 1 }, initial: 995, initialQuote: "S(0) = 995", quote: "The susceptible S" },
    { id: "I", symbol: "I", name: "Infected", unit: { people: 1 }, initial: 5, initialQuote: "I(0) = 5", quote: "the infected I" },
    { id: "R", symbol: "R", name: "Recovered", unit: { people: 1 }, initial: 0, initialQuote: "R(0) = 0", quote: "the recovered R" },
  ],
  parameters: [
    { id: "beta", symbol: "β", name: "Infection rate", unit: { people: -1, time: -1 }, value: 0.0003, quote: "beta = 0.0003" },
    { id: "gamma", symbol: "γ", name: "Recovery rate", unit: { time: -1 }, value: gamma, quote: "gamma = 0.1" },
  ],
  equations: [
    { of: "S", rate: "-beta*S*I", quote: "dS/dt = -beta S I" },
    { of: "I", rate: "beta*S*I - gamma*I", quote: "dI/dt = beta S I - gamma I" },
    { of: "R", rate: "gamma*I", quote: "dR/dt = gamma I" },
  ],
});

const LEVELS: readonly Record<string, unknown>[] = [
    {
      kind: "hook",
      title: "An epidemic that ends by itself",
      goal: "Change how easily it spreads, and watch who stays well.",
      control: { parameter: "beta", label: "How easily it spreads", lowEnd: "Hardly", highEnd: "Easily" },
      watch: "s",
      whatIf: { prompt: "What if the infected stayed infectious twice as long?", parameter: "gamma", value: 0.05 },
      difference: { compartment: "s", summary: "at", at: 150, time: 150, relation: "lower", by: 20 },
      effect: "Infectious twice as long, more people catch it: by day 150 more than 20 fewer are still susceptible.",
      prediction: { prompt: "Would fewer stay well?", claimed: "Fewer", other: "About as many" },
      passage: { title: "The epidemic ends early", quote: "The epidemic ends before everyone has been infected." },
      carryForward: "It ends before everyone is infected.",
    },
    {
      kind: "background",
      title: "Faster spread",
      goal: "Change how fast people recover, and watch the infected.",
      control: { parameter: "gamma", label: "How fast people recover", lowEnd: "Slowly", highEnd: "Quickly" },
      watch: "i",
      whatIf: { prompt: "What if it spread twice as easily?", parameter: "beta", value: 0.0006 },
      difference: { compartment: "i", summary: "first-reach", at: 100, time: 60, relation: "lower", by: 5 },
      effect: "Twice as easily, 100 people are infected at once more than 5 days sooner.",
      prediction: { prompt: "Sooner?", claimed: "Sooner", other: "About as soon" },
      passage: null,
      carryForward: "The infection rate sets the pace.",
    },
    {
      kind: "idea",
      title: "A threshold",
      goal: "Change how fast people recover, and find where it no longer spreads.",
      control: { parameter: "gamma", label: "How fast people recover", lowEnd: "Slowly", highEnd: "Quickly" },
      watch: "i",
      whatIf: { prompt: "What if the town had 300 susceptible people?", parameter: "s0", value: 300 },
      difference: { compartment: "i", summary: "first-reach", at: 25, time: 120, relation: "higher", by: 30 },
      effect: "With 300 people the illness fades: 25 are never infected at once within 120 days.",
      prediction: { prompt: "Would it still spread?", claimed: "No", other: "Yes" },
      passage: null,
      carryForward: "Below a threshold, it fades.",
    },
];
const planLevel = (index: number, overrides: Record<string, unknown> = {}) => ({ ...LEVELS[index], ...overrides });
const good = () => ({ title: "Test Town", perWatchSecond: 4, levels: [0, 1, 2].map((index) => planLevel(index)), limits: ["A test world."] });

const words = () => ({
  beginner: { text: "People catch it from each other.", analogy: "Like a rumour." },
  intermediate: { text: "The rates set the spread." },
  advanced: { text: "The model's equations.", equation: "dI/dt = βSI − γI", quote: null },
  guide: { idle: "Watch it spread.", raised: "You raised it{to}, so it spreads more.", lowered: "You lowered it{to}, so it spreads less.", readings: [{ atLeast: 100, words: "many" }, { atLeast: 0, words: "few" }], rising: "and rising", falling: "and falling" },
  afterwards: { text: "The paper says it ends early.", quote: "The epidemic ends before everyone has been infected.", question: "Why does it end?" },
});

/** A client that answers each stage from a script: each stage's replies in turn, the last repeated. */
function scripted(replies: Partial<Record<string, readonly unknown[]>>): ModelClient & { readonly calls: ChatRequest[] } {
  const calls: ChatRequest[] = [];
  const used = new Map<string, number>();
  return {
    calls,
    complete(request) {
      calls.push(request);
      const list = replies[request.stage] ?? [];
      const at = used.get(request.stage) ?? 0;
      used.set(request.stage, at + 1);
      const reply = list[Math.min(at, list.length - 1)];
      if (reply === undefined) return Promise.reject(new Error(`no scripted reply for ${request.stage}`));
      return Promise.resolve({ model: request.model, text: JSON.stringify(reply), usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, finishReason: "stop" });
    },
  };
}

const replies = (overrides: Partial<Record<string, readonly unknown[]>> = {}) => ({
  router: [{ domain: "epidemiology", mechanism: "A well-mixed epidemic.", family: "compartments", tier: "A", reason: "Three compartments." }],
  reader: [{ question: "Why does an epidemic end?", mechanism: "Infection and recovery.", modelEquations: [], result: { text: "It ends before everyone is infected.", quote: "The epidemic ends before everyone has been infected." }, claims: [] }],
  transcriber: [transcription()],
  "second-transcriber": [transcription()],
  planner: [good()],
  explainer: [{ levels: [words(), words(), words()] }],
  reviewer: [{ findings: [] }],
  ...overrides,
});

const config: JobConfig = {
  stages: { reader: "m-reader", transcriber: "m-first", "second-transcriber": "m-second", router: "m-router", planner: "m-planner", explainer: "m-explainer", reviewer: "m-reviewer" },
  structuredOutput: {},
};

async function run(client: ModelClient, overrides: Partial<JobConfig> = {}) {
  const events: { state: State; step: string; message: string }[] = [];
  const artifacts = new Map<string, unknown>();
  const sink: JobSink = { emit: (state, step, message) => void events.push({ state, step, message }), artifact: (name, value) => void artifacts.set(name, value) };
  const outcome = await runJob({ source: { kind: "ingested", text: source, register }, client, config: { ...config, ...overrides }, fetch: () => Promise.reject(new Error("no network")), example: "" }, sink);
  return { outcome, events, artifacts, states: events.map((event) => event.state).filter((state, index, all) => index === 0 || state !== all[index - 1]) };
}

describe("[R11] the job's states", () => {
  it("are a closed list, and every transition the controller makes is one the contract allows", () => {
    expect(JobState.options).toHaveLength(12);
    expect(JOB_TRANSITIONS.checking).toContain("ready");
    for (const state of JobState.options) if (state !== "checking") expect(JOB_TRANSITIONS[state], state).not.toContain("ready");
    expect(canMove("ready", "failed")).toBe(false);
    expect(canMove("planning", "cancelled")).toBe(true);
  });
});

describe("[R10] [R11] the controller", () => {
  it("runs a paper through every state to ready, with a world that builds and levels that meet the rule", async () => {
    const { outcome, states, artifacts } = await run(scripted(replies()));
    expect(outcome.state).toBe("ready");
    expect(states).toEqual(["received", "parsing", "planning", "building", "running", "checking", "ready"]);
    const swept = artifacts.get("level-rule") as { meets: boolean; holds: number }[];
    expect(swept.map((level) => level.meets)).toEqual([true, true, true]);
    expect(artifacts.get("provenance")).toEqual([]);
  }, 60_000);

  it("spends one repair when the two transcriptions disagree, and hands the job to the owner when they still do", async () => {
    const client = scripted(replies({ transcriber: [transcription(0.1), transcription(0.1)], "second-transcriber": [transcription(0.2)] }));
    const { outcome, states } = await run(client);
    expect(outcome.state).toBe("needs_information");
    expect(outcome.message).toMatch(/still disagree.*gamma/);
    expect(states).toEqual(["received", "parsing", "planning", "repairing", "planning", "needs_information"]);
    expect(client.calls.filter((call) => call.stage === "transcriber")).toHaveLength(2);
  }, 60_000);

  it("repairs a level the rule refuses, asking the planner to change that level alone, then reaches ready", async () => {
    const wrong = { ...good(), levels: [planLevel(0, { difference: { compartment: "s", summary: "at", at: 150, time: 150, relation: "higher", by: 20 } }), planLevel(1), planLevel(2)] };
    const client = scripted(replies({ planner: [wrong, good()] }));
    const { outcome, states } = await run(client);
    expect(outcome.state).toBe("ready");
    expect(states).toEqual(["received", "parsing", "planning", "building", "running", "repairing", "building", "running", "checking", "ready"]);
    const replan = client.calls.filter((call) => call.stage === "planner")[1];
    expect(replan?.messages.map((message) => message.content).join("\n")).toMatch(/These problems were found:\n- level 1 \("An epidemic that ends by itself"\): its claim holds on 0 of 20 starts/);
  }, 60_000);

  it("keeps a failed check failed after two repairs, and never asks the reviewer, scripted to approve, to rule on it", async () => {
    const wrong = { ...good(), levels: [0, 1, 2].map((index) => planLevel(index, { difference: { compartment: "s", summary: "at", at: 150, time: 150, relation: "higher", by: 20 } })) };
    const client = scripted(replies({ planner: [wrong, wrong, wrong], reviewer: [{ findings: [{ level: 1, severity: "advice", finding: "The world is acceptable." }] }] }));
    const { outcome, states } = await run(client);
    expect(outcome.state).toBe("failed");
    expect(outcome.message).toMatch(/too few levels meet the level rule/);
    expect(states.filter((state) => state === "repairing")).toHaveLength(2);
    expect(states).not.toContain("checking");
    expect(client.calls.filter((call) => call.stage === "reviewer")).toHaveLength(0);
  }, 60_000);

  it("reads a plan that names things as the paper writes them, β and S, as the model's ids", async () => {
    const asPaper = { ...good(), levels: [planLevel(0, { control: { parameter: "β", label: "How easily it spreads", lowEnd: "Hardly", highEnd: "Easily" }, watch: "S", difference: { compartment: "S", summary: "at", at: 150, time: 150, relation: "lower", by: 20 } }), planLevel(1), planLevel(2)] };
    const { outcome, artifacts } = await run(scripted(replies({ planner: [asPaper] })));
    expect(outcome.state).toBe("ready");
    const world = artifacts.get("world") as { levels: { manipulable: { targetVariable: string } }[] };
    expect(world.levels[0]?.manipulable.targetVariable).toBe("beta");
  }, 60_000);

  it("stops as unsupported when the router sends the paper to another family", async () => {
    const { outcome, states } = await run(scripted(replies({ router: [{ domain: "epidemiology", mechanism: "Spread on a network.", family: "networks", tier: "B", reason: "A contact network." }] })));
    expect(outcome.state).toBe("unsupported");
    expect(states.at(-1)).toBe("unsupported");
  });

  it("fails, saying why, when a stage has no model chosen", async () => {
    const { outcome } = await run(scripted(replies()), { stages: { ...config.stages, reader: null } });
    expect(outcome).toMatchObject({ state: "failed", message: "no model is chosen for the reader stage in apps/api/models.json" });
  });
});
