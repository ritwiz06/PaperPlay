import { describe, expect, it } from "vitest";
import { checkDocs, type RepoView } from "../docs/check.ts";

const COMMITS = new Set(["abc1234", "def5678"]);

/** A minimal documentation set that satisfies every rule. Each test plants one failure in it. */
function validFiles(): Map<string, string> {
  return new Map([
    ["docs/README.md", "# Documentation\n\n## Index\n\nTable.\n\n## Session log template\n\nTemplate.\n"],
    ["docs/project-brief.md", "# Brief\n\n## Who it is for\n\nPeople.\n\n## What it promises, and what it does not\n\nA sandbox.\n"],
    [
      "docs/roadmap.md",
      "# Roadmap\n\n## Gates\n\n## G1 Playable baseline\n\n## G2 Verified authored world\n\n## G3 Constrained generation\n\n## G4 Evaluation and feature freeze\n\n## G5 Delivery\n\n## Effort\n\n## Plan changes\n",
    ],
    [
      "docs/status.md",
      "# Status\n\nUpdated 2026-10-01.\n\n## Where we are\n\n- **Working commit:** `abc1234` on `g1/x`.\n\n## Latest check:gate (G1), 2026-10-01\n\n## Blockers\n\n## Decisions waiting on the owner\n\n## Next three actions\n\n## Recommendations\n",
    ],
    ["docs/requirements.md", "# Requirements\n\n## How evidence is counted\n\n## Evidence\n"],
    [
      "docs/architecture.md",
      "# Architecture\n\n## Package map\n\napps/web, apps/api, packages/contracts.\n\n## Dependency directions\n\n## Data flow\n\n## Contracts and versions\n\n## Invariants and where they are enforced\n\n## Runtime and tooling\n\n## Changes\n",
    ],
    [
      "docs/concepts.md",
      "# Concepts\n\n## Science\n\n### Torus\n\nWhat it is.\n\n- **Used in:** `packages/contracts/src/index.ts`, `apps/web`\n- **Why here:** No edges.\n- **Learn more:** https://example.org/torus\n\n## Engineering\n\n## Graphics\n\n## AI and agents\n",
    ],
    [
      "docs/progress.md",
      "# Progress\n\n## 2026-10-01 · Newest slice\n\n- Commits: `abc1234`, `def5678`\n\n## 2026-09-28 · Older slice\n\n- Commits: `0000000`\n",
    ],
    ["docs/decisions/ADR-0001-stack.md", "# ADR-0001\n\n## Context\n\nWhy.\n\n## Decision\n\nWhat.\n"],
    ["docs/sessions/2026-09-30.md", "# Old session in an older format\n"],
    [
      "docs/sessions/2026-10-01.md",
      "# Session\n\n## Goal\n\n## What I read\n\n## What changed, by commit\n\n## Checks run, exact output\n\n## Concepts introduced\n\n## Decisions made and needed\n\n## Problems and how they were solved\n\n## Next\n",
    ],
    ["packages/contracts/src/index.ts", "export {};\n"],
    ["apps/web/package.json", "{}\n"],
    ["apps/api/package.json", "{}\n"],
  ]);
}

function repoOf(files: Map<string, string>, commits: ReadonlySet<string> = COMMITS): RepoView {
  const directories = new Set<string>();
  for (const path of files.keys()) {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) directories.add(parts.slice(0, i).join("/"));
  }
  return {
    read: (path) => files.get(path),
    exists: (path) => files.has(path) || directories.has(path),
    list: (dir) => {
      const prefix = `${dir}/`;
      const names = new Set<string>();
      for (const path of [...files.keys(), ...directories]) {
        if (path.startsWith(prefix)) names.add(path.slice(prefix.length).split("/")[0] ?? "");
      }
      return [...names].sort();
    },
    isDirectory: (path) => directories.has(path),
    commitExists: (sha) => commits.has(sha),
  };
}

function plant(edit: (files: Map<string, string>) => void, commits?: ReadonlySet<string>): string[] {
  const files = validFiles();
  edit(files);
  return checkDocs(repoOf(files, commits));
}

const replaceIn = (files: Map<string, string>, path: string, from: string, to: string): void => {
  const text = files.get(path);
  if (text === undefined || !text.includes(from)) throw new Error(`fixture ${path} lacks ${from}`);
  files.set(path, text.replace(from, to));
};

describe("documentation checker", () => {
  it("passes a complete, consistent documentation set", () => {
    expect(checkDocs(repoOf(validFiles()))).toEqual([]);
  });

  it("fails when a required document is missing", () => {
    expect(plant((files) => files.delete("docs/concepts.md"))).toEqual(["docs/concepts.md is missing"]);
  });

  it("fails when a document lacks a required heading", () => {
    expect(plant((files) => replaceIn(files, "docs/status.md", "## Recommendations\n", ""))).toEqual([
      'docs/status.md lacks the heading "## Recommendations"',
    ]);
  });

  it("fails when status.md's date differs from the newest session log", () => {
    expect(plant((files) => replaceIn(files, "docs/status.md", "Updated 2026-10-01", "Updated 2026-09-30"))).toEqual([
      "docs/status.md is dated 2026-09-30 but the newest session log is docs/sessions/2026-10-01.md",
    ]);
  });

  it("takes the newest session log by date and then by its -2, -3 suffix", () => {
    const problems = plant((files) => {
      files.set("docs/sessions/2026-10-02.md", files.get("docs/sessions/2026-10-01.md") ?? "");
      files.set("docs/sessions/2026-10-02-2.md", "# A later session the same day, missing its headings\n");
    });
    expect(problems).toContain("docs/status.md is dated 2026-10-01 but the newest session log is docs/sessions/2026-10-02-2.md");
    expect(problems).toContain('docs/sessions/2026-10-02-2.md lacks the heading "## Goal"');
  });

  it("fails when status.md names a working commit that git does not have", () => {
    expect(plant((files) => replaceIn(files, "docs/status.md", "`abc1234`", "`fff9999`"))).toEqual([
      "docs/status.md names working commit fff9999, which does not exist in git",
    ]);
  });

  it("fails when status.md names no working commit", () => {
    expect(plant((files) => replaceIn(files, "docs/status.md", "- **Working commit:** `abc1234` on `g1/x`.\n", ""))).toEqual([
      "docs/status.md has no line naming the working commit (- **Working commit:** `<sha>`)",
    ]);
  });

  it("fails when architecture.md leaves out a directory under apps/ or packages/", () => {
    expect(plant((files) => files.set("packages/ui/package.json", "{}\n"))).toEqual([
      "docs/architecture.md does not mention packages/ui",
    ]);
  });

  it("fails when a concept's Used in path does not exist", () => {
    expect(plant((files) => replaceIn(files, "docs/concepts.md", "`apps/web`", "`apps/web/src/gone.ts`"))).toEqual([
      'docs/concepts.md: "Torus" is used in apps/web/src/gone.ts, which does not exist',
    ]);
  });

  it("fails when a concept entry lacks one of its fields", () => {
    expect(plant((files) => replaceIn(files, "docs/concepts.md", "- **Why here:** No edges.\n", ""))).toEqual([
      'docs/concepts.md: "Torus" lacks its "Why here" line',
    ]);
  });

  it("fails when progress.md's newest entry names a commit that git does not have", () => {
    expect(plant(() => undefined, new Set(["abc1234"]))).toEqual([
      'docs/progress.md: the newest entry ("2026-10-01 · Newest slice") names commit def5678, which does not exist in git',
    ]);
  });

  it("fails when progress.md's newest entry names no commit", () => {
    expect(plant((files) => replaceIn(files, "docs/progress.md", "- Commits: `abc1234`, `def5678`\n", ""))).toEqual([
      'docs/progress.md: the newest entry ("2026-10-01 · Newest slice") names no commit',
    ]);
  });

  it("fails when an ADR lacks its Context or Decision section", () => {
    expect(plant((files) => replaceIn(files, "docs/decisions/ADR-0001-stack.md", "## Decision\n", "## Choice\n"))).toEqual([
      'docs/decisions/ADR-0001-stack.md lacks the heading "## Decision"',
    ]);
  });

  it("fails when there is no session log at all", () => {
    const problems = plant((files) => {
      files.delete("docs/sessions/2026-09-30.md");
      files.delete("docs/sessions/2026-10-01.md");
    });
    expect(problems).toContain("docs/sessions/ holds no session log (YYYY-MM-DD.md)");
  });
});
