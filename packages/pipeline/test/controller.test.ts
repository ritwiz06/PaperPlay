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
  "An illustrative example instead takes beta = 0.0002 and gamma = 0.2.",
  "When the infected recover faster, the epidemic infects fewer people.",
  "Below a threshold of susceptible people, the illness fades out.",
  "R_0 = \\frac{\\beta N}{\\gamma}",
  "where $N = 995$ is the town.",
  "A recovery rate above 50% brings the reproduction number below 1.",
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
  equations: [{ id: "eq1", labels: [], number: "1", latex: "R_0 = \\frac{\\beta N}{\\gamma}", sectionId: "s3-model", start: offset("R_0 = "), end: offset("R_0 = ") + "R_0 = \\frac{\\beta N}{\\gamma}".length }],
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
      finding: 0,
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
      finding: 1,
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
      finding: 2,
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

const FINDINGS = [
  { kind: "result", text: "Faster recovery means fewer infected.", quote: "When the infected recover faster, the epidemic infects fewer people." },
  { kind: "threshold", text: "Below a threshold the illness fades.", quote: "Below a threshold of susceptible people, the illness fades out." },
];

const replies = (overrides: Partial<Record<string, readonly unknown[]>> = {}) => ({
  router: [{ domain: "epidemiology", mechanism: "A well-mixed epidemic.", family: "compartments", tier: "A", reason: "Three compartments." }],
  reader: [{ question: "Why does an epidemic end?", mechanism: "Infection and recovery.", modelEquations: [], result: { text: "It ends before everyone is infected.", quote: "The epidemic ends before everyone has been infected." }, findings: FINDINGS }],
  transcriber: [transcription()],
  "second-transcriber": [transcription()],
  planner: [good()],
  explainer: [words()],
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
    // The paper's own numbers ran before planning (ADR-0040); its headline states no threshold, so no level says anything of it.
    expect(artifacts.get("own-numbers")).toMatchObject({ schemaVersion: "reproducibility/1", verdict: "not-applicable", stop: null, observation: null });
    const world = artifacts.get("world") as { ownNumbers?: { verdict: string; statements: unknown[] }; levels: { observation?: unknown }[] };
    expect(world.ownNumbers?.verdict).toBe("not-applicable");
    expect(world.ownNumbers?.statements.length).toBeGreaterThan(0);
    expect(world.levels.every((level) => level.observation === undefined)).toBe(true);
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
    // The measurement at the world's own values goes with it, so the planner can aim its claim.
    expect(replan?.messages.map((message) => message.content).join("\n")).toMatch(/at the world's own values this world measures [\d.e-]+ and the What-if [\d.e-]+, (higher|lower) by [\d.e-]+/);
  }, 60_000);

  it("keeps a failed check failed after two repairs, and never asks the reviewer, scripted to approve, to rule on it", async () => {
    const wrong = { ...good(), levels: [0, 1, 2].map((index) => planLevel(index, { difference: { compartment: "s", summary: "at", at: 150, time: 150, relation: "higher", by: 20 } })) };
    const client = scripted(replies({ planner: [wrong, wrong, wrong], reviewer: [{ findings: [{ level: 1, severity: "advice", finding: "The world is acceptable." }] }] }));
    const { outcome, states } = await run(client);
    expect(outcome.state).toBe("failed");
    // The hook is never dropped (ADR-0040): with no confirmed mismatch to fall back on, the job stops on it.
    expect(outcome.message).toMatch(/^level 1, the hook on the paper's headline, still fails after its repairs, and the hook is never dropped: level 1 \("An epidemic that ends by itself"\): its claim holds on/);
    expect(states.filter((state) => state === "repairing")).toHaveLength(2);
    expect(states).not.toContain("checking");
    expect(client.calls.filter((call) => call.stage === "reviewer")).toHaveLength(0);
  }, 60_000);

  it("drops a level other than the hook that still fails after its repairs, keeping why, and shows each repair its control's response", async () => {
    const failing = planLevel(1, { title: "A level that fails", difference: { compartment: "s", summary: "at", at: 150, time: 150, relation: "higher", by: 20 } });
    const plan = { ...good(), levels: [...good().levels, failing] };
    const client = scripted(replies({ planner: [plan, plan, plan] }));
    const { outcome, artifacts, events } = await run(client);
    expect(outcome.state).toBe("ready");
    expect(artifacts.get("dropped")).toEqual([{ level: 4, title: "A level that fails", reasons: [expect.stringMatching(/^its claim holds on \d+ of 20 starts, fewer than 16/)] }]);
    expect(events.some((event) => /^dropped 1 level\(s\) the rules refuse, keeping 3: "A level that fails", its claim holds on/.test(event.message))).toBe(true);
    const replan = client.calls.filter((call) => call.stage === "planner")[1];
    expect(replan?.messages.map((message) => message.content).join("\n")).toMatch(/level 4 \("A level that fails"\): its claim holds on .*; how its control moves the model, each halved and doubled: beta halved .*gamma halved \(0\.1 to 0\.05\)/);
    expect((artifacts.get("world") as { levels: unknown[] }).levels).toHaveLength(3);
  }, 60_000);

  it("falls back to the first anchored finding the model shows when the hook fails and the paper's own numbers confirm its headline does not appear (ADR-0040)", async () => {
    const headline = { text: "Recovering faster than half stops the spread.", quote: "A recovery rate above 50% brings the reproduction number below 1." };
    const reader = [{ question: "Why does an epidemic end?", mechanism: "Infection and recovery.", modelEquations: [], result: headline, findings: FINDINGS }];
    const hookFails = planLevel(0, { difference: { compartment: "s", summary: "at", at: 150, time: 150, relation: "higher", by: 20 } });
    const plan = { ...good(), levels: [hookFails, planLevel(1), planLevel(2), planLevel(1, { title: "Faster spread, again", kind: "idea" })] };
    const client = scripted(replies({ reader, planner: [plan, plan, plan] }));
    const { outcome, artifacts } = await run(client);
    const own = artifacts.get("own-numbers") as { verdict: string; observation: string; formulas: { agrees: boolean }[] };
    expect(own.verdict).toBe("mismatch");
    expect(own.formulas.map((formula) => formula.agrees)).toEqual([true]);
    // The planner was told what level 1 does when the headline's threshold does not appear.
    expect(client.calls.find((call) => call.stage === "planner")?.messages.map((message) => message.content).join("\n")).toMatch(/Level 1 still tests the headline, finding 0, by its direction/);
    expect(outcome.state).toBe("ready");
    const world = artifacts.get("world") as { levels: { title: string; kind: string; observation?: { text: string; origin: string } }[]; ownNumbers: { statements: { text: string }[] } };
    expect(world.levels.map((level) => [level.title, level.kind])).toEqual([["Faster spread", "hook"], ["A threshold", "idea"], ["Faster spread, again", "idea"]]);
    expect(world.levels[0]?.observation).toEqual({ text: "The paper's headline does not appear in this world at the values it lists, and its direction does not show here either, so this level tests another of its findings: Faster recovery means fewer infected.", origin: "computed-observation", anchors: [] });
    expect(world.ownNumbers.statements.at(-1)?.text).toBe(world.levels[0]?.observation?.text);
    expect(artifacts.get("dropped")).toEqual([{ level: 1, title: "An epidemic that ends by itself", reasons: [expect.stringMatching(/^its claim holds on/)] }]);
  }, 60_000);

  it("asks two planners from different vendors and keeps the better level for each slot, recording each level's planner (ADR-0043)", async () => {
    // With 300 susceptible the epidemic never starts, so more stay well: a claim of fewer fails.
    const wrong = planLevel(2, { difference: { compartment: "s", summary: "at", at: 150, time: 150, relation: "lower", by: 20 } });
    const first = { ...good(), levels: [planLevel(0), planLevel(1), wrong] };
    const client = scripted(replies({ planner: [first], "second-planner": [good()] }));
    const { outcome, states, artifacts, events } = await run(client, { stages: { ...config.stages, "second-planner": "m-second-planner" } });
    expect(outcome.state).toBe("ready");
    // The second planner's level 3 meets the rules where the first's does not: no repair is needed.
    expect(states).not.toContain("repairing");
    expect(artifacts.get("plan-sources")).toEqual([
      { level: 1, title: "An epidemic that ends by itself", planner: "m-planner" },
      { level: 2, title: "Faster spread", planner: "m-planner" },
      { level: 3, title: "A threshold", planner: "m-second-planner" },
    ]);
    expect(events.some((event) => /^two planners planned: m-planner, 2 of 3 levels meeting the rules; m-second-planner, 3 of 3; kept level 1 from m-planner, level 2 from m-planner, level 3 from m-second-planner$/.test(event.message))).toBe(true);
    expect(client.calls.filter((call) => call.stage === "second-planner").map((call) => call.model)).toEqual(["m-second-planner"]);
  }, 60_000);

  it("uses the first planner's plan alone when the second gives none the schema reads", async () => {
    const client = scripted(replies({ "second-planner": [{ not: "a plan" }] }));
    const { outcome, artifacts, events } = await run(client, { stages: { ...config.stages, "second-planner": "m-second-planner" } });
    expect(outcome.state).toBe("ready");
    expect(events.some((event) => /^the second planner, m-second-planner, gave no plan the schema reads .*; the first planner's plan is used alone$/.test(event.message))).toBe(true);
    expect((artifacts.get("plan-sources") as { planner: string }[]).every((entry) => entry.planner === "m-planner")).toBe(true);
  }, 60_000);

  it("checks only the second transcription's structure: a quote it miscopied does not stop the world", async () => {
    const miscopied = transcription(0.1) as { equations: { quote: string }[] };
    const second = { ...miscopied, equations: miscopied.equations.map((equation, index) => (index === 0 ? { ...equation, quote: "dS/dt = -beta S I, as copied wrongly" } : equation)) };
    const { outcome, states } = await run(scripted(replies({ "second-transcriber": [second] })));
    expect(outcome.state).toBe("ready");
    expect(states).not.toContain("repairing");
  }, 60_000);

  it("picks the paper's main set of values by rule when it states two, and keeps the other as an alternative", async () => {
    const sets = (main: boolean) => ({
      ...transcription(0.1),
      valueSets: [
        { id: "main", label: "the model's values", quote: "The infection rate is beta = 0.0003", fittedToData: false, mainResults: main, usageQuote: null, firstResult: null, values: [{ of: "beta", value: 0.0003, quote: "beta = 0.0003" }, { of: "gamma", value: 0.1, quote: "gamma = 0.1" }] },
        { id: "example", label: "an illustrative example", quote: "An illustrative example instead takes", fittedToData: false, mainResults: false, usageQuote: null, firstResult: null, values: [{ of: "beta", value: 0.0002, quote: "beta = 0.0002" }, { of: "gamma", value: 0.2, quote: "gamma = 0.2" }] },
      ],
    });
    const { outcome, events, artifacts } = await run(scripted(replies({ transcriber: [sets(true)], "second-transcriber": [sets(true)] })));
    expect(outcome.state).toBe("ready");
    expect(events.map((event) => event.message).join("\n")).toMatch(/on the paper's set "the model's values" \(the set the paper's main results use\)/);
    const model = artifacts.get("model") as { alternatives: { id: string; values: Record<string, number> }[] };
    expect(model.alternatives).toMatchObject([{ id: "example", values: { beta: 0.0002, gamma: 0.2 } }]);
    // When nothing the rule reads tells the sets apart, the owner decides, and nothing is planned.
    const undecided = await run(scripted(replies({ transcriber: [sets(false)], "second-transcriber": [sets(false)] })));
    expect(undecided.outcome).toMatchObject({ state: "needs_information", message: expect.stringMatching(/the rule cannot pick one/) as unknown });
    expect(undecided.states).not.toContain("building");
  }, 60_000);

  it("reads a plan that names things as the paper writes them, β and S, as the model's ids", async () => {
    const asPaper = { ...good(), levels: [planLevel(0, { control: { parameter: "β", label: "How easily it spreads", lowEnd: "Hardly", highEnd: "Easily" }, watch: "S", difference: { compartment: "S", summary: "at", at: 150, time: 150, relation: "lower", by: 20 } }), planLevel(1), planLevel(2)] };
    const { outcome, artifacts } = await run(scripted(replies({ planner: [asPaper] })));
    expect(outcome.state).toBe("ready");
    const world = artifacts.get("world") as { levels: { manipulable: { targetVariable: string } }[] };
    expect(world.levels[0]?.manipulable.targetVariable).toBe("beta");
  }, 60_000);

  it("repairs a world whose hook does not test the paper's headline result (ADR-0037)", async () => {
    const offTheHeadline = { ...good(), levels: [planLevel(0, { finding: 1 }), planLevel(1), planLevel(2)] };
    const client = scripted(replies({ planner: [offTheHeadline, good()] }));
    const { outcome } = await run(client);
    expect(outcome.state).toBe("ready");
    const replan = client.calls.filter((call) => call.stage === "planner")[1];
    expect(replan?.messages.map((message) => message.content).join("\n")).toMatch(/level 1, the hook, must test the paper's headline result, finding 0/);
  }, 60_000);

  // Level 2 measured as a mean, which is not emergent, so a definitional block on it can stand (ADR-0044).
  const onAverage = () => planLevel(1, { difference: { compartment: "i", summary: "mean", at: null, time: 60, relation: "higher", by: 5 }, effect: "Twice as easily, more than 5 more people are infected on average over 60 days." });
  const averagePlan = () => ({ ...good(), levels: [planLevel(0), onAverage(), planLevel(2)] });
  const block = (kind: "definitional" | "unsupported", term: string | null = null) => ({ findings: [{ level: 2, severity: "blocking", kind, finding: kind === "definitional" ? "Faster recovery emptying the infected follows from the rate's definition." : "Its goal says recovery spreads the illness, which the equations do not.", suggestion: "Change level 2 alone.", term }] });
  const twoReviewers = { stages: { ...config.stages, "second-reviewer": "m-second-reviewer" } };

  it("sends a level the reviewer finds definitional, naming its term, back to the planner, then checks the world again", async () => {
    const client = scripted(replies({ planner: [averagePlan(), good()], reviewer: [block("definitional", "gamma*i"), { findings: [] }] }));
    const { outcome, states, artifacts } = await run(client);
    expect(outcome.state).toBe("ready");
    expect(states).toEqual(["received", "parsing", "planning", "building", "running", "checking", "repairing", "building", "running", "checking", "ready"]);
    const replan = client.calls.filter((call) => call.stage === "planner")[1];
    expect(replan?.messages.map((message) => message.content).join("\n")).toMatch(/level 2 \("Faster spread"\): the reviewer finds its effect follows from the model's definitions alone/);
    expect(client.calls.filter((call) => call.stage === "reviewer")).toHaveLength(2);
    // The reviewer was given the equations and each level's direct-effect tag.
    const asked = client.calls.find((call) => call.stage === "reviewer")?.messages.map((message) => message.content).join("\n") ?? "";
    expect(asked).toMatch(/di\/dt = /);
    expect(asked).toMatch(/Level 2: its control gamma appears directly in di\/dt, the measured compartment's own equation, taking from it \(.+\); the level measures its level or total\./);
    expect((artifacts.get("review-decisions") as { stands: boolean }[])[0]).toMatchObject({ pass: 1, reviewer: "m-reviewer", level: 2, kind: "definitional", valid: true, stands: true });
  }, 60_000);

  it("lets a block stand only when a second reviewer from another vendor makes it too", async () => {
    const alone = scripted(replies({ planner: [averagePlan()], reviewer: [block("definitional", "gamma*i")], "second-reviewer": [{ findings: [] }] }));
    const one = await run(alone, twoReviewers);
    expect(one.outcome.state).toBe("ready");
    expect(one.states).not.toContain("repairing");
    expect(one.artifacts.get("review-decisions")).toEqual([{ pass: 1, reviewer: "m-reviewer", level: 2, kind: "definitional", blocking: true, term: "gamma*i", valid: true, stands: false, reason: "di/dt holds i × gamma, which holds gamma; m-second-reviewer makes no such block" }]);
    expect(one.events.some((event) => event.message === "level 2: m-reviewer's definitional block does not stand: di/dt holds i × gamma, which holds gamma; m-second-reviewer makes no such block")).toBe(true);
    expect(alone.calls.filter((call) => call.stage === "second-reviewer").map((call) => call.model)).toEqual(["m-second-reviewer"]);

    const both = scripted(replies({ planner: [averagePlan(), good()], reviewer: [block("definitional", "gamma*i"), { findings: [] }], "second-reviewer": [block("definitional", "gamma * i"), { findings: [] }] }));
    const agreed = await run(both, twoReviewers);
    expect(agreed.outcome.state).toBe("ready");
    expect(agreed.states).toContain("repairing");
    expect(both.calls.filter((call) => call.stage === "planner")[1]?.messages.map((message) => message.content).join("\n")).toMatch(/level 2 \("Faster spread"\): both reviewers find its effect follows from the model's definitions alone/);
  }, 60_000);

  it("ignores, and records, a definitional block that names no valid term or measures an emergent summary", async () => {
    const termless = await run(scripted(replies({ planner: [averagePlan()], reviewer: [block("definitional", null)] })));
    expect(termless.outcome.state).toBe("ready");
    expect(termless.states).not.toContain("repairing");
    expect(termless.artifacts.get("review-decisions")).toMatchObject([{ level: 2, valid: false, stands: false, reason: "it names no term; a definitional block must name a term of di/dt holding the control" }]);
    // The plan's own level 2 measures when 100 are first infected at once: emergent, whatever the term.
    const emergent = await run(scripted(replies({ reviewer: [block("definitional", "gamma*i")] })));
    expect(emergent.outcome.state).toBe("ready");
    expect(emergent.states).not.toContain("repairing");
    expect(emergent.artifacts.get("review-decisions")).toMatchObject([{ level: 2, valid: false, reason: "the level measures the first-reach of i, an emergent summary, which is never definitional" }]);
  }, 60_000);

  it("sends words that misdescribe the model back to the explainer once, and drops the level if they still do", async () => {
    const reworded = { ...words(), goal: "Change how fast people recover, and watch the infected.", effect: "Twice as easily, 100 people are infected at once more than 5 days sooner." };
    const fixed = scripted(replies({ explainer: [words(), words(), words(), reworded], reviewer: [block("unsupported"), { findings: [] }] }));
    const once = await run(fixed);
    expect(once.outcome.state).toBe("ready");
    expect(once.states).toEqual(["received", "parsing", "planning", "building", "running", "checking", "repairing", "building", "running", "checking", "ready"]);
    const asked = fixed.calls.filter((call) => call.stage === "explainer")[3]?.messages.map((message) => message.content).join("\n") ?? "";
    expect(asked).toMatch(/The reviewers found that level 2's words misdescribe the model: Its goal says recovery spreads the illness/);
    expect(fixed.calls.filter((call) => call.stage === "planner")).toHaveLength(1);
    expect((once.artifacts.get("world") as { levels: { goal: string }[] }).levels[1]?.goal).toBe("Change how fast people recover, and watch the infected.");

    // Still misdescribed after its words were written again: dropped, which leaves too few levels here.
    const stuck = await run(scripted(replies({ explainer: [words(), words(), words(), reworded], reviewer: [block("unsupported")] })));
    expect(stuck.outcome).toMatchObject({ state: "needs_information", message: expect.stringMatching(/^too few levels meet the rules: level 2 \("Faster spread"\): its words still misdescribe the model after they were written again/) as unknown });
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
