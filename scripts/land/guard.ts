/**
 * What `npm run land` records for a commit, and the rule the pre-push hook enforces with it
 * (ADR-0009): a push may move `main` only to a commit land recorded as gate-passed and
 * CI-green. Records live inside the git directory, so they are never committed and never
 * make the tree dirty.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface LandRecord {
  sha: string;
  branch: string;
  /** `npm run check:gate` exited 0 on this commit, with a clean tree. */
  gate: { status: "passed"; at: string };
  /** CI's run on this exact commit concluded success. Absent until it has. */
  ci?: { status: "success"; runId: number; url: string; at: string };
}

const ZERO = /^0+$/;

export const recordPath = (gitDir: string, sha: string): string => join(gitDir, "paperplay", "landed", `${sha}.json`);

export function readRecord(gitDir: string, sha: string): LandRecord | undefined {
  const path = recordPath(gitDir, sha);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as LandRecord;
  } catch {
    return undefined;
  }
}

export function writeRecord(gitDir: string, record: LandRecord): void {
  const path = recordPath(gitDir, record.sha);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
}

/** Why `main` may not move to `sha`, or undefined when land recorded it gate-passed and CI-green. */
export function mainRefusal(gitDir: string, sha: string): string | undefined {
  const record = readRecord(gitDir, sha);
  const short = sha.slice(0, 7);
  if (!record || record.sha !== sha) return `${short} was not landed: main moves only through npm run land`;
  if (record.gate.status !== "passed") return `${short}: land has no passing check:gate for it`;
  if (record.ci?.status !== "success") return `${short}: land has no green CI run for it`;
  return undefined;
}

/**
 * The pre-push rule. Git gives the hook one line per ref:
 * `<local ref> <local sha> <remote ref> <remote sha>`. Only lines that would move or delete
 * `main` are checked; every other branch and tag pushes freely.
 */
export function pushRefusals(input: string, gitDir: string): string[] {
  const refusals: string[] = [];
  for (const line of input.split("\n")) {
    const [, localSha, remoteRef, remoteSha] = line.trim().split(/\s+/);
    if (remoteRef !== "refs/heads/main" || !localSha) continue;
    if (ZERO.test(localSha)) refusals.push("deleting main is refused");
    else if (localSha === remoteSha) continue;
    else {
      const refusal = mainRefusal(gitDir, localSha);
      if (refusal) refusals.push(refusal);
    }
  }
  return refusals;
}
