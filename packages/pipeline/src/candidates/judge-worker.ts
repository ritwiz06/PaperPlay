/** One worker's share of the candidates, judged off the main thread (ADR-0055). */
import { parentPort, workerData } from "node:worker_threads";
import { judgeCandidates, type JudgeInput } from "./judge.ts";
import type { LevelCandidate } from "./types.ts";

const { input, candidates } = workerData as { input: JudgeInput; candidates: LevelCandidate[] };
parentPort?.postMessage(judgeCandidates(input, candidates));
