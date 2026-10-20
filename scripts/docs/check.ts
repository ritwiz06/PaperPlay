/**
 * Rules behind `npm run check:docs`, which runs inside check:gate. Pure: it reads the
 * repository through RepoView, so tests can plant each failure in memory. The command in
 * scripts/check-docs.ts supplies the real files and git.
 */
export interface RepoView {
  /** File contents, or undefined when the file does not exist. */
  read(path: string): string | undefined;
  exists(path: string): boolean;
  /** Names directly inside a directory, or [] when it does not exist. */
  list(dir: string): string[];
  isDirectory(path: string): boolean;
  commitExists(sha: string): boolean;
  /** Whether a commit is main's tip, or a commit on the current branch beyond it. */
  isCurrent(sha: string): boolean;
}

/** status.md is a snapshot that fits on a screen; history belongs in progress.md and the session logs. */
export const STATUS_MAX_LINES = 80;

/** Every document the system requires, with the second-level headings each must carry. */
export const REQUIRED_DOCS: Readonly<Record<string, readonly string[]>> = {
  "docs/README.md": ["Index", "Session log template"],
  "docs/project-brief.md": ["Who it is for", "What it promises, and what it does not"],
  "docs/roadmap.md": [
    "Gates",
    "G1 Playable baseline",
    "G2 Verified authored world",
    "G3 Constrained generation",
    "G4 Evaluation and feature freeze",
    "G5 Delivery",
    "Effort",
    "Plan changes",
  ],
  "docs/status.md": [
    "Where we are",
    "Latest check:gate",
    "Blockers",
    "Decisions waiting on the owner",
    "Next three actions",
    "Recommendations",
  ],
  "docs/requirements.md": ["How evidence is counted", "Evidence"],
  "docs/architecture.md": [
    "Package map",
    "Dependency directions",
    "Data flow",
    "Contracts and versions",
    "Invariants and where they are enforced",
    "Runtime and tooling",
    "Changes",
  ],
  "docs/concepts.md": ["Science", "Engineering", "Graphics", "AI and agents"],
  "docs/progress.md": [],
};

/** The session log template (docs/README.md); only the newest log must follow it. */
export const SESSION_HEADINGS = [
  "Goal",
  "What I read",
  "What changed, by commit",
  "Checks run, exact output",
  "Concepts introduced",
  "Decisions made and needed",
  "Problems and how they were solved",
  "Next",
] as const;

export const ADR_HEADINGS = ["Context", "Decision"] as const;
const CONCEPT_FIELDS = ["Used in", "Why here", "Learn more"] as const;
const SESSION_FILE = /^(\d{4}-\d{2}-\d{2})(?:-(\d+))?\.md$/;

function missingHeadings(path: string, text: string, headings: readonly string[]): string[] {
  const lines = text.split("\n");
  return headings
    .filter((heading) => !lines.some((line) => line.startsWith(`## ${heading}`)))
    .map((heading) => `${path} lacks the heading "## ${heading}"`);
}

/** Splits a document into blocks that each start with a heading line matching `start`. */
function blocks(text: string, start: RegExp, stop: RegExp): { heading: string; body: string }[] {
  const found: { heading: string; body: string }[] = [];
  let current: { heading: string; lines: string[] } | null = null;
  for (const line of text.split("\n")) {
    if (start.test(line)) {
      if (current) found.push({ heading: current.heading, body: current.lines.join("\n") });
      current = { heading: line, lines: [] };
    } else if (stop.test(line)) {
      if (current) found.push({ heading: current.heading, body: current.lines.join("\n") });
      current = null;
    } else {
      current?.lines.push(line);
    }
  }
  if (current) found.push({ heading: current.heading, body: current.lines.join("\n") });
  return found;
}

const backticked = (text: string): string[] => [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? "");

function newestSessionLog(repo: RepoView): { name: string; date: string } | undefined {
  return repo
    .list("docs/sessions")
    .map((name) => ({ name, match: SESSION_FILE.exec(name) }))
    .filter((entry): entry is { name: string; match: RegExpExecArray } => entry.match !== null)
    .map(({ name, match }) => ({ name, date: match[1] ?? "", part: Number(match[2] ?? 1) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.part - b.part)
    .at(-1);
}

export function checkDocs(repo: RepoView): string[] {
  const problems: string[] = [];

  for (const [path, headings] of Object.entries(REQUIRED_DOCS)) {
    const text = repo.read(path);
    if (text === undefined) problems.push(`${path} is missing`);
    else problems.push(...missingHeadings(path, text, headings));
  }

  const adrs = repo.list("docs/decisions").filter((name) => /^ADR-\d{4}-.+\.md$/.test(name));
  if (adrs.length === 0) problems.push("docs/decisions/ holds no ADR (ADR-NNNN-title.md)");
  for (const name of adrs) {
    const path = `docs/decisions/${name}`;
    problems.push(...missingHeadings(path, repo.read(path) ?? "", ADR_HEADINGS));
  }

  const newest = newestSessionLog(repo);
  if (!newest) {
    problems.push("docs/sessions/ holds no session log (YYYY-MM-DD.md)");
  } else {
    const path = `docs/sessions/${newest.name}`;
    problems.push(...missingHeadings(path, repo.read(path) ?? "", SESSION_HEADINGS));
  }

  const status = repo.read("docs/status.md");
  if (status !== undefined) {
    const dated = /^Updated (\d{4}-\d{2}-\d{2})/m.exec(status)?.[1];
    if (!dated) problems.push("docs/status.md has no \"Updated YYYY-MM-DD\" line");
    else if (newest && dated !== newest.date) {
      problems.push(`docs/status.md is dated ${dated} but the newest session log is docs/sessions/${newest.name}`);
    }
    const working = /\*\*Working commit:\*\*\s*`([0-9a-f]{7,40})`/.exec(status)?.[1];
    if (!working) problems.push("docs/status.md has no line naming the working commit (- **Working commit:** `<sha>`)");
    else if (!repo.commitExists(working)) problems.push(`docs/status.md names working commit ${working}, which does not exist in git`);
    else if (!repo.isCurrent(working)) problems.push(`docs/status.md names working commit ${working}, which is neither main's tip nor on the current branch: rewrite status.md for this session`);
    const lines = status.trimEnd().split("\n").length;
    if (lines > STATUS_MAX_LINES) problems.push(`docs/status.md is ${lines} lines; a snapshot fits in ${STATUS_MAX_LINES}, and history belongs in progress.md and the session logs`);
  }

  const architecture = repo.read("docs/architecture.md");
  if (architecture !== undefined) {
    for (const base of ["apps", "packages"]) {
      for (const name of repo.list(base)) {
        const dir = `${base}/${name}`;
        if (repo.isDirectory(dir) && !architecture.includes(dir)) problems.push(`docs/architecture.md does not mention ${dir}`);
      }
    }
  }

  const concepts = repo.read("docs/concepts.md");
  if (concepts !== undefined) {
    for (const { heading, body } of blocks(concepts, /^### /, /^## /)) {
      const title = heading.replace(/^### /, "").trim();
      for (const field of CONCEPT_FIELDS) {
        const line = new RegExp(`^- \\*\\*${field}:\\*\\*(.*)$`, "m").exec(body);
        if (!line) {
          problems.push(`docs/concepts.md: "${title}" lacks its "${field}" line`);
          continue;
        }
        if (field !== "Used in") continue;
        const paths = backticked(line[1] ?? "");
        if (paths.length === 0) problems.push(`docs/concepts.md: "${title}" names no path it is used in`);
        for (const path of paths) {
          if (!repo.exists(path)) problems.push(`docs/concepts.md: "${title}" is used in ${path}, which does not exist`);
        }
      }
    }
  }

  const progress = repo.read("docs/progress.md");
  if (progress !== undefined) {
    const [entry] = blocks(progress, /^## \d{4}-\d{2}-\d{2} · /, /^## /);
    if (!entry) {
      problems.push("docs/progress.md has no entry (## YYYY-MM-DD · title)");
    } else {
      const title = entry.heading.replace(/^## /, "").trim();
      const commits = backticked(/^- Commits:(.*)$/m.exec(entry.body)?.[1] ?? "").filter((sha) => /^[0-9a-f]{7,40}$/.test(sha));
      if (commits.length === 0) problems.push(`docs/progress.md: the newest entry ("${title}") names no commit`);
      for (const sha of commits) {
        if (!repo.commitExists(sha)) {
          problems.push(`docs/progress.md: the newest entry ("${title}") names commit ${sha}, which does not exist in git`);
        }
      }
    }
  }

  return problems;
}
