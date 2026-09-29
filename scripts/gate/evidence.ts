/**
 * Pure helpers behind `npm run check:gate`: turn test reports into flat results and
 * judge them against a gate. A test proves a requirement by carrying its id in its
 * title, e.g. "[R01] same seed and events replay bitwise".
 */

export interface TestResult {
  source: "vitest" | "playwright";
  name: string;
  status: "passed" | "failed" | "skipped";
}

export interface RequirementEvidence {
  id: string;
  passed: number;
  failed: number;
}

export interface GateOutcome {
  problems: string[];
  evidence: RequirementEvidence[];
}

const TAG = /\[(R\d{2})\]/g;

function tagsOf(name: string): string[] {
  return [...name.matchAll(TAG)].map((match) => match[1] ?? "");
}

function firstLine(text: string): string {
  return text.split("\n")[0] ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function evaluateGate(input: {
  requires: readonly string[];
  known: readonly string[];
  results: readonly TestResult[];
}): GateOutcome {
  const problems: string[] = [];

  for (const result of input.results) {
    const tags = tagsOf(result.name);
    for (const tag of tags) {
      if (!input.known.includes(tag)) problems.push(`unknown requirement tag [${tag}] in: ${result.name}`);
    }
    if (result.status === "skipped") problems.push(`skipped test: ${result.name} (${result.source})`);
    // Failures of required requirements are reported per requirement below; every other failure here.
    if (result.status === "failed" && !tags.some((tag) => input.requires.includes(tag))) {
      problems.push(`failing test: ${result.name} (${result.source})`);
    }
  }

  const evidence = input.requires.map((id) => {
    const tagged = input.results.filter((result) => tagsOf(result.name).includes(id));
    return {
      id,
      passed: tagged.filter((result) => result.status === "passed").length,
      failed: tagged.filter((result) => result.status === "failed").length,
    };
  });

  for (const { id, passed, failed } of evidence) {
    if (failed > 0) problems.push(`${id} has ${failed} failing test(s)`);
    else if (passed === 0) problems.push(`${id} has no passing test tagged [${id}]`);
  }

  return { problems, evidence };
}

interface VitestFile {
  name: string;
  status: string;
  message?: string;
  assertionResults: { fullName: string; status: string }[];
}

export function fromVitestReport(report: unknown): TestResult[] {
  if (!isRecord(report) || !Array.isArray(report.testResults)) {
    throw new Error("Vitest report has no testResults array");
  }
  const results: TestResult[] = [];
  for (const file of report.testResults as VitestFile[]) {
    for (const assertion of file.assertionResults) {
      results.push({
        source: "vitest",
        name: assertion.fullName,
        status: assertion.status === "passed" ? "passed" : assertion.status === "failed" ? "failed" : "skipped",
      });
    }
    const failedInsideATest = file.assertionResults.some((assertion) => assertion.status === "failed");
    if (file.status === "failed" && !failedInsideATest) {
      const where = file.assertionResults.length === 0 ? "did not run" : "failed outside its tests";
      results.push({ source: "vitest", name: `${file.name} ${where}: ${firstLine(file.message ?? "")}`, status: "failed" });
    }
  }
  return results;
}

interface PlaywrightSuite {
  title: string;
  specs?: { title: string; tests: { status: string }[] }[];
  suites?: PlaywrightSuite[];
}

export function fromPlaywrightReport(report: unknown): TestResult[] {
  if (!isRecord(report) || !Array.isArray(report.suites)) {
    throw new Error("Playwright report has no suites array");
  }
  const results: TestResult[] = [];
  const walk = (suite: PlaywrightSuite, path: string[]): void => {
    const here = [...path, suite.title];
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        results.push({
          source: "playwright",
          name: [...here, spec.title].join(" › "),
          // "flaky" means it failed at least once; with retries off it counts as a failure.
          status: test.status === "expected" ? "passed" : test.status === "skipped" ? "skipped" : "failed",
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, here);
  };
  for (const suite of report.suites as PlaywrightSuite[]) walk(suite, []);

  const errors = Array.isArray(report.errors) ? (report.errors as { message: string }[]) : [];
  for (const error of errors) {
    results.push({ source: "playwright", name: `run error: ${firstLine(error.message)}`, status: "failed" });
  }
  return results;
}
