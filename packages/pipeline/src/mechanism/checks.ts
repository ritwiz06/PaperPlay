/**
 * The checks a generated mechanism must pass before any level is made from it (ADR-0058), each
 * deterministic and run headless in the Node sandbox: it loads; the same seed gives the same
 * results; it runs at both ends of every parameter's range; it gives no NaN or Infinity; its
 * measurements respond to its parameters; its frames draw in its kit; and it is quick enough to
 * play. Their problems, in words, are what the writer is told when it is asked to fix the module.
 */
import { MECHANISM_LIMITS, MechanismManifest, parseFrame, type MechanismParam } from "@paperplay/contracts";
import { openSandbox, type MechanismSandbox, type SandboxAnswer, type SandboxLimits } from "./sandbox.ts";

export type MechanismCheckName = "loads" | "declares" | "computes" | "deterministic" | "ranges" | "finite" | "responds" | "frames" | "speed";

export interface MechanismCheck {
  readonly name: MechanismCheckName;
  readonly passed: boolean;
  readonly problems: readonly string[];
}

export interface MechanismReport {
  readonly passed: boolean;
  readonly manifest: MechanismManifest | null;
  readonly checks: readonly MechanismCheck[];
  /** The average time of one step with its measurement and frame, in milliseconds, once measured. */
  readonly stepMs: number | null;
}

/** What each check asks, in the words the writer is told. */
export const CHECK_WORDS: Readonly<Record<MechanismCheckName, string>> = Object.freeze({
  loads: "it loads: the source parses, defines mechanism with init, step, measure and frame, and declares a valid manifest",
  declares: "every parameter says what the paper means by it: paper: { normal, without, meaning }",
  computes: "it computes its outcomes from its mechanism and never writes in a number the paper reports as a result",
  deterministic: "the same seed gives the same measurements and frames, run after run",
  ranges: "it runs at its defaults, and at the minimum and the maximum of every parameter",
  finite: "every measurement is a finite number at every step: no NaN, no Infinity",
  responds: "moving each parameter across its range changes at least one measurement, and every measurement responds to at least one parameter",
  frames: "every frame is a valid frame of the declared kit",
  speed: `a step with its measurement and frame takes ${MECHANISM_LIMITS.stepMs} ms or less on average`,
});

/** A run of a module, as the sandbox gives it: the measurements every `every` steps, and the frames asked for. */
export interface MechanismRun {
  readonly measures: readonly (readonly number[])[];
  readonly frames: Readonly<Record<string, unknown>>;
}

/** The parameters at their defaults, one set to a value; integers stay whole. */
export const paramsWith = (params: readonly MechanismParam[], change: { readonly id: string; readonly value: number } | null = null): Record<string, number> =>
  Object.fromEntries(params.map((param) => [param.id, change && change.id === param.id ? (param.integer ? Math.round(change.value) : change.value) : param.default]));

/** How often a run is measured: about 50 times over its steps. */
export const everyOf = (steps: number): number => Math.max(1, Math.floor(steps / 50));

/** One run in the sandbox, from init: its measurements, and its frames at the start, the middle and the end. */
export async function runOnce(sandbox: MechanismSandbox, manifest: MechanismManifest, seed: number, params: Record<string, number>): Promise<{ readonly run: MechanismRun } | { readonly failure: Extract<SandboxAnswer, { ok: false }> }> {
  const answer = await sandbox.request({ op: "run", seed, params, steps: manifest.steps, every: everyOf(manifest.steps), frameAt: [0, Math.floor(manifest.steps / 2), manifest.steps] });
  if (!answer.ok) return { failure: answer };
  return { run: { measures: (answer["measures"] ?? []) as number[][], frames: (answer["frames"] ?? {}) as Record<string, unknown> } };
}

const where = (failure: Extract<SandboxAnswer, { ok: false }>): string => (failure.line ? `line ${failure.line}: ${failure.error}` : failure.error);
const shown = (value: number): string => (Number.isFinite(value) ? Number(value.toPrecision(4)).toString() : String(value));

/** The largest relative difference between two runs' measurements, measurement by measurement. */
const differs = (a: MechanismRun, b: MechanismRun, index: number): boolean =>
  a.measures.some((row, at) => {
    const x = row[index] ?? 0;
    const y = b.measures[at]?.[index] ?? 0;
    return Math.abs(x - y) > 1e-9 * Math.max(1, Math.abs(x), Math.abs(y));
  });

/** A number the paper reports as a result, and the words it came from. */
export interface PaperNumber {
  readonly value: number;
  readonly text: string;
}

/**
 * The numbers the paper reports among its results, from the reader's headline and findings: those
 * written with a decimal point or as a percentage, as results are. A whole number alone, a count, a
 * size or a year, is as likely a setting a module needs, and is left alone.
 */
export function resultNumbersOf(texts: readonly string[]): PaperNumber[] {
  const found = new Map<number, string>();
  for (const text of texts) {
    for (const match of text.matchAll(/(?<![\w.])(\d+(?:\.\d+)?)(\s?%)?(?![\w.]*\d)/g)) {
      const literal = match[1] ?? "";
      const value = Number(literal);
      if (!Number.isFinite(value) || !(literal.includes(".") || match[2])) continue;
      if (!found.has(value)) found.set(value, text.slice(Math.max(0, (match.index ?? 0) - 40), (match.index ?? 0) + literal.length + 20).trim());
    }
  }
  return [...found].map(([value, text]) => ({ value, text }));
}

/** The source with its comments and strings blanked out, each line kept where it was. */
const codeOnly = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/g, (part) => part.replace(/[^\n]/g, " "));

/**
 * A module that writes in the paper's reported numbers, as constants or tables, restates results
 * rather than computing them (ADR-0058's amendment): every literal in its code equal to one, unless
 * it is one of the module's own parameter settings, such as the paper's d_k of 64.
 */
export function restatedNumbers(source: string, manifest: MechanismManifest, results: readonly PaperNumber[]): string[] {
  const settings = new Set([manifest.steps, ...manifest.params.flatMap((param) => [param.min, param.max, param.default, param.paper?.normal, param.paper?.without ?? undefined].filter((value): value is number => value !== undefined))]);
  const reported = results.filter((result) => !settings.has(result.value));
  const code = codeOnly(source);
  const problems: string[] = [];
  for (const match of code.matchAll(/(?<![\w$.])(\d+(?:\.\d+)?(?:e[+-]?\d+)?)(?![\w$])/gi)) {
    const value = Number(match[1]);
    const result = reported.find((entry) => entry.value === value);
    if (!result) continue;
    const line = code.slice(0, match.index ?? 0).split("\n").length;
    problems.push(`line ${line}: ${match[1] ?? ""} is a number the paper reports as a result ("${result.text}"); compute the outcome from the mechanism instead of writing it in`);
  }
  return problems;
}

export interface CheckOptions {
  /** The numbers the paper reports among its results, which a module must never write in. */
  readonly results?: readonly PaperNumber[];
}

/**
 * Runs every check on a module's source in a fresh sandbox, and closes it. Loading stops the rest
 * when it fails; the others all run, so the writer hears every problem at once.
 */
export async function checkMechanism(source: string, limits: SandboxLimits = MECHANISM_LIMITS, options: CheckOptions = {}): Promise<MechanismReport> {
  const checks: MechanismCheck[] = [];
  const record = (name: MechanismCheckName, problems: readonly string[]) => checks.push({ name, passed: problems.length === 0, problems });
  if (source.length > MECHANISM_LIMITS.sourceChars) {
    record("loads", [`the module is ${source.length} characters long; the limit is ${MECHANISM_LIMITS.sourceChars}`]);
    return { passed: false, manifest: null, checks, stepMs: null };
  }
  const sandbox = openSandbox(source, limits);
  try {
    const described = await sandbox.request({ op: "describe" });
    if (!described.ok) {
      record("loads", [where(described)]);
      return { passed: false, manifest: null, checks, stepMs: null };
    }
    const parsed = MechanismManifest.safeParse(described["manifest"]);
    if (!parsed.success) {
      record("loads", parsed.error.issues.slice(0, 8).map((issue) => `the manifest's ${issue.path.join(".") || "fields"}: ${issue.message}`));
      return { passed: false, manifest: null, checks, stepMs: null };
    }
    record("loads", []);
    const manifest = parsed.data;
    record("declares", manifest.params.filter((param) => !param.paper).map((param) => `${param.id} does not say what the paper means by it: give it paper: { normal, without, meaning }`));
    record("computes", restatedNumbers(source, manifest, options.results ?? []).slice(0, 6));

    // The default run, twice on one seed: the reference every other check compares with.
    const first = await runOnce(sandbox, manifest, 1, paramsWith(manifest.params));
    const again = await runOnce(sandbox, manifest, 1, paramsWith(manifest.params));
    const ranges: string[] = [];
    const finite: string[] = [];
    const frames: string[] = [];
    const looked = (label: string, outcome: Awaited<ReturnType<typeof runOnce>>): MechanismRun | null => {
      if ("failure" in outcome) {
        ranges.push(`${label}: ${where(outcome.failure)}`);
        return null;
      }
      const { run } = outcome;
      const width = manifest.measurements.length;
      const short = run.measures.findIndex((row) => row.length !== width);
      if (short >= 0) finite.push(`${label}: measure(state) gave ${run.measures[short]?.length ?? 0} of the ${width} measurements at sample ${short}`);
      for (const [index, measurement] of manifest.measurements.entries()) {
        const at = run.measures.findIndex((row) => typeof row[index] !== "number" || !Number.isFinite(row[index]));
        if (at >= 0) finite.push(`${label}: ${measurement.id} is ${String(run.measures[at]?.[index])} at step ${at * everyOf(manifest.steps)}`);
      }
      for (const [step, frame] of Object.entries(run.frames)) {
        const checked = parseFrame(manifest.kit, frame);
        if (!checked.ok) frames.push(`${label}, the frame at step ${step}: ${checked.problems.join("; ")}`);
      }
      return run;
    };
    const reference = looked("at the defaults, seed 1", first);
    const repeat = "run" in again ? again.run : null;
    record("deterministic", reference && repeat && JSON.stringify(reference) !== JSON.stringify(repeat) ? ["two runs on seed 1 at the defaults gave different measurements or frames: use only the seed for chance, never the clock or shared state"] : []);

    // Both ends of every range, the others at their defaults.
    const ends = new Map<string, { readonly low: MechanismRun | null; readonly high: MechanismRun | null }>();
    for (const param of manifest.params) {
      const runAt = async (value: number) => looked(`${param.id} at ${shown(value)}`, await runOnce(sandbox, manifest, 1, paramsWith(manifest.params, { id: param.id, value })));
      ends.set(param.id, { low: await runAt(param.min), high: await runAt(param.max) });
    }
    record("ranges", ranges.slice(0, 10));
    record("finite", finite.slice(0, 10));

    // Each parameter moves something; each measurement is moved by something.
    const responds: string[] = [];
    const moved = new Set<number>();
    for (const param of manifest.params) {
      const end = ends.get(param.id);
      if (!end?.low || !end.high) continue;
      const changed = manifest.measurements.map((_, index) => index).filter((index) => differs(end.low as MechanismRun, end.high as MechanismRun, index));
      changed.forEach((index) => moved.add(index));
      if (changed.length === 0) responds.push(`moving ${param.id} from ${shown(param.min)} to ${shown(param.max)} changes no measurement`);
    }
    if (checks.every((check) => check.name !== "ranges" || check.passed))
      manifest.measurements.forEach((measurement, index) => {
        if (!moved.has(index)) responds.push(`${measurement.id} responds to no parameter`);
      });
    record("responds", responds);
    record("frames", frames.slice(0, 10));

    // Speed: a run kept in the sandbox and stepped one step at a time with its frame, as a world plays.
    let stepMs: number | null = null;
    const speed: string[] = [];
    const started = await sandbox.request({ op: "start", run: "speed", seed: 1, params: paramsWith(manifest.params) });
    if (started.ok) {
      const count = Math.min(60, manifest.steps);
      const began = performance.now();
      for (let n = 0; n < count; n += 1) {
        const advanced = await sandbox.request({ op: "advance", run: "speed", steps: 1, params: paramsWith(manifest.params) });
        if (!advanced.ok) {
          speed.push(`stepping one step at a time: ${where(advanced)}`);
          break;
        }
      }
      stepMs = (performance.now() - began) / count;
      if (speed.length === 0 && stepMs > MECHANISM_LIMITS.stepMs) speed.push(`a step with its measurement and frame takes ${shown(stepMs)} ms on average; the limit is ${MECHANISM_LIMITS.stepMs} ms`);
    } else speed.push(`starting a run: ${where(started)}`);
    record("speed", speed);
    return { passed: checks.every((check) => check.passed), manifest, checks, stepMs };
  } finally {
    await sandbox.close();
  }
}

/** The report as the writer reads it: every failed check and its problems, or nothing when all pass. */
export function feedbackOf(report: MechanismReport): string {
  const failed = report.checks.filter((check) => !check.passed);
  if (failed.length === 0) return "";
  return failed.map((check) => `- ${check.name} (${CHECK_WORDS[check.name]}):\n${check.problems.map((problem) => `  - ${problem}`).join("\n")}`).join("\n");
}
