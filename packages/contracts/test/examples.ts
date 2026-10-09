// Valid example documents for contract tests. The content is synthetic on purpose:
// nothing here quotes or cites a real paper.
import type { z } from "zod";

export interface Issue {
  code: string;
  path: string;
}

/** The issues a schema reports for a value, reduced to code and dotted path. */
export function issuesOf(schema: z.ZodType, value: unknown): Issue[] {
  const result = schema.safeParse(value);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({ code: issue.code, path: issue.path.join(".") }));
}

export const sha = (char: string): string => char.repeat(64);

export function anchor() {
  return {
    sourceId: "example2026",
    page: 3,
    sectionId: "s2-local-rules",
    charStart: 120,
    charEnd: 240,
    quote: "An example passage used only by contract tests.",
  };
}

export function manifest() {
  return {
    schemaVersion: "sourcemanifest/1",
    sourceId: "example2026",
    title: "An example source for contract tests",
    authors: ["A. Example"],
    year: 2026,
    venue: "Test proceedings",
    sha256: sha("a"),
    accessedAt: "2026-09-28T21:00:00Z",
    localCopyPermitted: false,
    sections: [
      { id: "s1-introduction", title: "Introduction", page: 1 },
      { id: "s2-local-rules", title: "Local rules" },
    ],
  };
}

export function action() {
  return {
    actionId: "alignment-strength",
    label: "Move together",
    targetVariable: "alignmentWeight",
    range: [0, 2] as [number, number],
    unit: "per second",
    defaultValue: 1,
    origin: "teaching-choice",
    anchors: [] as ReturnType<typeof anchor>[],
  };
}

export function runRecord() {
  return {
    schemaVersion: "runrecord/2",
    runId: "run-0001",
    worldSpecHash: sha("b"),
    primitive: { id: "flock.planar.weighted", version: "2.0.0" },
    codeHash: sha("c"),
    lockHash: sha("d"),
    seed: 42,
    initialState: { agents: [] },
    timestep: 1 / 60,
    sampleInterval: 60,
    totalSteps: 120,
    events: [
      { kind: "param", step: 0, actionId: "alignment-strength", value: 1 },
      { kind: "place", step: 30, entityId: "beacon-1", entity: "beacon", x: 8, y: 8 },
      { kind: "param", step: 60, actionId: "alignment-strength", value: 0 },
      { kind: "remove", step: 90, entityId: "beacon-1" },
    ],
    observables: { directionalAgreement: [0.1, 0.4, 0.9], clusterCount: [5, 3, 1] },
    hashes: { "state@120": sha("e") },
    runtime: { engine: "node 24.21.0", os: "darwin arm64" },
    tolerance: 1e-9,
  };
}

const ALL_SHOWN_AT = {
  beginner: { show: ["range-words", "analogy"], hide: ["control-value", "range-numbers", "readout-number", "equation"] },
  intermediate: { show: ["control-value", "range-numbers", "readout-number"], hide: ["range-words", "equation", "analogy"] },
  advanced: { show: ["control-value", "range-numbers", "readout-number", "equation"], hide: ["range-words", "analogy"] },
} as const;

export function explanation() {
  return {
    beginner: { text: "Each walker matches the walkers beside it.", ...structuredClone(ALL_SHOWN_AT.beginner), analogy: "Like a queue shuffling forward.", origin: "teaching-choice", anchors: [] as unknown[] },
    intermediate: { text: "Each step, a walker steers toward its neighbours' mean heading.", ...structuredClone(ALL_SHOWN_AT.intermediate), origin: "teaching-choice", anchors: [] as unknown[] },
    advanced: { text: "The steer is proportional to the gap between headings.", ...structuredClone(ALL_SHOWN_AT.advanced), equation: "a = k (u − v)", origin: "teaching-choice", anchors: [] as unknown[] },
  };
}

export function guide() {
  return {
    idle: "No walker leads.",
    raised: "You raised Follow{to}, so walkers turn harder.",
    lowered: "You lowered Follow{to}, so walkers turn less.",
    atMinimum: "At 0, no walker follows anyone.",
    readings: [
      { atLeast: 0.6, words: "most walkers head the same way" },
      { atLeast: 0, words: "headings are scattered" },
    ],
    trend: { rising: { beginner: "and more are joining in", measured: "rising" }, falling: { beginner: "and they are drifting apart", measured: "falling" }, steady: "holding", within: 0.03 },
  };
}

/** One level of a synthetic world: a walking model, not any real paper's. */
export function level(id: string, order: number, kind: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    order,
    kind,
    title: `A level called ${id}`,
    goal: "Move the control and watch.",
    bonus: false,
    binding: { type: "primitive", primitive: { id: "example.walkers", version: "1.0.0" }, params: {} as Record<string, number> },
    manipulable: { ...action(), origin: "paper-derived", anchors: [anchor()] as unknown[] },
    slider: { step: 0.05, ends: ["Ignore", "Follow"] },
    observable: { metricId: "agreement", label: "Directional agreement", shortLabel: "Agreement", unit: "fraction", decimals: 2, origin: "computed-observation" },
    counterfactual: {
      prompt: "What if walkers ignored each other?",
      altParams: { alignmentWeight: 0 } as Record<string, unknown>,
      expectedQualitativeEffect: "The right crowd stays scattered.",
      origin: "teaching-choice",
      isSpeculative: false,
      anchors: [] as unknown[],
      difference: difference(),
    },
    setup: [] as unknown[],
    explanation: explanation(),
    caption: { text: "Walkers match their neighbours", origin: "paper-derived", anchors: [anchor()] as unknown[] },
    guide: guide(),
    furtherReading: [] as string[],
    carryForward: "Walkers can agree without a leader.",
    ...overrides,
  };
}

export function worldSpec() {
  return {
    schemaVersion: "worldspec/2",
    status: "reviewed",
    title: "Walkers' Square",
    source: manifest(),
    digest: {
      question: "How do walkers agree on a direction?",
      hookResult: { text: "Local matching is enough.", anchors: [anchor()] as unknown[] },
      causalChain: [
        { id: "local", claim: "Walkers see only neighbours.", dependsOn: [] as string[], anchors: [anchor()] as unknown[], origin: "paper-derived" },
        { id: "agree", claim: "Agreement spreads.", dependsOn: ["local"], anchors: [anchor()] as unknown[], origin: "paper-derived" },
      ],
    },
    design: { world: "valley", palette: "cream-teal", density: "comfortable", sections: [{ levelId: "hook", chartType: "none", motion: "none" }] },
    levels: [level("hook", 1, "hook"), level("idea", 2, "idea"), level("result", 3, "result")] as Record<string, unknown>[],
    primitivesUsed: [{ id: "example.walkers", version: "1.0.0" }],
    checks: { suiteIds: ["schema"], suiteVersions: { schema: "1" } as Record<string, string> },
    limitations: ["A synthetic world for contract tests."],
  };
}

export function difference() {
  return {
    metricId: "agreement",
    label: "Agreement after 20 seconds",
    unit: "fraction",
    summary: { kind: "at", seconds: 20 } as Record<string, unknown>,
    seconds: 20,
    claim: { kind: "each", relation: "lower", by: 0.5 } as Record<string, unknown>,
  };
}

export function exploration() {
  return {
    predictPrompt: "Will walkers who see everyone agree faster?",
    choices: ["Faster", "About the same, or slower"],
    interveneActionId: "alignment-strength",
    observeMetricId: "agreement",
    explainPrompt: "Why might seeing everyone not help?",
    explanation: { text: "The model's walkers see only neighbours.", origin: "paper-derived", anchors: [anchor()] as unknown[] },
  };
}

export function placeholder(need = "The passage on matching neighbours.") {
  return { placeholder: true, sourceId: "example2026", need };
}

export function pendingSource() {
  return { pending: true, sourceId: "example2026", title: "An example source", authors: ["A. Example"], year: 2026, need: "The PDF, for pages and ranges." };
}
