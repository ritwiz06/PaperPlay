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
