/**
 * The generated-mechanism tier (ADR-0058), Node only: the sandbox a writer's module runs in, the
 * checks it must pass, and the writer's fix loop.
 */
export { CHECK_WORDS, checkMechanism, everyOf, feedbackOf, paramsWith, runOnce, type MechanismCheck, type MechanismCheckName, type MechanismReport, type MechanismRun } from "./checks.ts";
export { FIX_ROUNDS, writeCheckedMechanism, type LoopOptions, type WriterOutcome, type WriterRound } from "./loop.ts";
export { openSandbox, type MechanismSandbox, type SandboxAnswer, type SandboxLimits } from "./sandbox.ts";
