import { describe, expect, it } from "vitest";
import { evaluateGate, fromPlaywrightReport, fromVitestReport, type TestResult } from "../gate/evidence.ts";

const known = ["R01", "R02", "R03"];
const passed = (name: string): TestResult => ({ source: "vitest", name, status: "passed" });

describe("evaluateGate", () => {
  it("reports a required requirement that no test carries as missing", () => {
    const outcome = evaluateGate({ requires: ["R01", "R02"], known, results: [passed("[R01] replays bitwise")] });

    expect(outcome.problems).toEqual(["R02 has no passing test tagged [R02]"]);
    expect(outcome.evidence).toEqual([
      { id: "R01", passed: 1, failed: 0 },
      { id: "R02", passed: 0, failed: 0 },
    ]);
  });

  it("fails a requirement when any of its tagged tests fails, even if another passes", () => {
    const results: TestResult[] = [
      passed("[R01] replays bitwise"),
      { source: "vitest", name: "[R01] oracle: alignment orders the flock", status: "failed" },
    ];

    const outcome = evaluateGate({ requires: ["R01"], known, results });

    expect(outcome.problems).toEqual(["R01 has 1 failing test(s)"]);
  });

  it("fails the gate for any skipped test, tagged or not", () => {
    const results: TestResult[] = [
      passed("[R01] replays bitwise"),
      { source: "playwright", name: "smoke › loads", status: "skipped" },
    ];

    const outcome = evaluateGate({ requires: ["R01"], known, results });

    expect(outcome.problems).toEqual(["skipped test: smoke › loads (playwright)"]);
  });

  it("reports a tag that names no known requirement", () => {
    const outcome = evaluateGate({ requires: [], known, results: [passed("[R13] a typo in a tag")] });

    expect(outcome.problems).toEqual(["unknown requirement tag [R13] in: [R13] a typo in a tag"]);
  });

  it("counts a test with several tags toward each of them", () => {
    const outcome = evaluateGate({ requires: ["R01", "R03"], known, results: [passed("[R01][R03] both at once")] });

    expect(outcome.problems).toEqual([]);
    expect(outcome.evidence).toEqual([
      { id: "R01", passed: 1, failed: 0 },
      { id: "R03", passed: 1, failed: 0 },
    ]);
  });

  it("fails the gate when a test fails even if it carries no tag", () => {
    const results: TestResult[] = [passed("[R01] replays bitwise"), { source: "vitest", name: "health", status: "failed" }];

    const outcome = evaluateGate({ requires: ["R01"], known, results });

    expect(outcome.problems).toEqual(["failing test: health (vitest)"]);
  });
});

describe("fromVitestReport", () => {
  it("maps each assertion status and turns a file that crashed before any test into a failure", () => {
    const report = {
      testResults: [
        {
          name: "/repo/packages/a/test/a.test.ts",
          status: "passed",
          message: "",
          assertionResults: [
            { fullName: "a passes", status: "passed" },
            { fullName: "a fails", status: "failed" },
            { fullName: "a is skipped", status: "skipped" },
            { fullName: "a is todo", status: "todo" },
            { fullName: "a is pending", status: "pending" },
            { fullName: "a is disabled", status: "disabled" },
          ],
        },
        {
          name: "/repo/packages/b/test/b.test.ts",
          status: "failed",
          message: "SyntaxError: Unexpected token",
          assertionResults: [],
        },
      ],
    };

    expect(fromVitestReport(report)).toEqual([
      { source: "vitest", name: "a passes", status: "passed" },
      { source: "vitest", name: "a fails", status: "failed" },
      { source: "vitest", name: "a is skipped", status: "skipped" },
      { source: "vitest", name: "a is todo", status: "skipped" },
      { source: "vitest", name: "a is pending", status: "skipped" },
      { source: "vitest", name: "a is disabled", status: "skipped" },
      {
        source: "vitest",
        name: "/repo/packages/b/test/b.test.ts did not run: SyntaxError: Unexpected token",
        status: "failed",
      },
    ]);
  });

  it("turns a file that failed outside its tests (e.g. in a hook) into a failure", () => {
    const report = {
      testResults: [
        {
          name: "/repo/packages/c/test/c.test.ts",
          status: "failed",
          message: "Error: afterAll hook timed out\n    at stack line",
          assertionResults: [{ fullName: "c passes", status: "passed" }],
        },
      ],
    };

    expect(fromVitestReport(report)).toEqual([
      { source: "vitest", name: "c passes", status: "passed" },
      {
        source: "vitest",
        name: "/repo/packages/c/test/c.test.ts failed outside its tests: Error: afterAll hook timed out",
        status: "failed",
      },
    ]);
  });

  it("rejects a report that has no testResults", () => {
    expect(() => fromVitestReport({ numTotalTests: 0 })).toThrow(/testResults/);
  });
});

describe("fromPlaywrightReport", () => {
  it("names tests by their suite path, maps outcomes, and turns run errors into failures", () => {
    const report = {
      suites: [
        {
          title: "smoke.spec.ts",
          specs: [{ title: "shell loads", tests: [{ status: "expected" }] }],
          suites: [
            {
              title: "local world",
              specs: [
                { title: "[R04] slider moves the readout", tests: [{ status: "unexpected" }] },
                { title: "flaky one", tests: [{ status: "flaky" }] },
                { title: "skipped one", tests: [{ status: "skipped" }] },
              ],
            },
          ],
        },
      ],
      errors: [{ message: "Error: Timed out waiting for the web server" }],
    };

    expect(fromPlaywrightReport(report)).toEqual([
      { source: "playwright", name: "smoke.spec.ts › shell loads", status: "passed" },
      { source: "playwright", name: "smoke.spec.ts › local world › [R04] slider moves the readout", status: "failed" },
      { source: "playwright", name: "smoke.spec.ts › local world › flaky one", status: "failed" },
      { source: "playwright", name: "smoke.spec.ts › local world › skipped one", status: "skipped" },
      { source: "playwright", name: "run error: Error: Timed out waiting for the web server", status: "failed" },
    ]);
  });

  it("rejects a report that has no suites", () => {
    expect(() => fromPlaywrightReport({ errors: [] })).toThrow(/suites/);
  });
});
