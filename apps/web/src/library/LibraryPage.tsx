/**
 * /library (ADR-0049): every world this build holds, hand-made and generated, grouped by its paper,
 * each with its kind, its status, its levels and a picture of its stage. It reads the index that
 * `npm run library` writes from the fixtures, so the page loads no world until one is opened. The
 * public build holds only worlds built beforehand, so it lists only those; a development server
 * also lists the worlds its API has made.
 */
import { lazy, Suspense } from "react";
import index from "./worlds.json";
import "./library.css";

/** The worlds this machine's API has made, on a development server only. */
const ThisMachine = import.meta.env.DEV ? lazy(() => import("./ThisMachine.tsx").then((module) => ({ default: module.ThisMachine }))) : null;

interface LibraryWorld {
  readonly id: string;
  readonly route: string | null;
  readonly title: string;
  readonly madeBy: "hand" | "pipeline";
  readonly status: "verified" | "draft" | "generated" | "retired";
  readonly family: string;
  readonly paper: { readonly title: string; readonly authors: readonly string[]; readonly year: number; readonly venue: string | null };
  readonly levels: readonly { readonly order: number; readonly title: string; readonly bonus: boolean }[];
  readonly thumbnail: string;
  readonly recordedOn: string | null;
  readonly definitional: readonly number[];
  readonly retired: { readonly on: string; readonly reason: string; readonly replacedBy: string | null } | null;
}

const WORLDS = (index as { readonly worlds: readonly LibraryWorld[] }).worlds;

const STATUS: Readonly<Record<LibraryWorld["status"], { readonly label: string; readonly meaning: string }>> = {
  verified: { label: "Verified", meaning: "made by hand, every passage it quotes checked against the paper" },
  draft: { label: "Draft", meaning: "made by hand, its passages not yet checked against the paper" },
  generated: { label: "Generated", meaning: "made by the pipeline from the paper, checked by its rules" },
  retired: { label: "Retired", meaning: "no longer played, kept as a record, with why" },
};

/** Authors as a citation writes them: "Reynolds", "Kermack and McKendrick", "Sutskever et al." */
function authorsOf(authors: readonly string[]): string {
  const surname = (name: string): string => name.trim().split(/\s+/).at(-1) ?? name;
  if (authors.length === 1) return surname(authors[0] ?? "");
  if (authors.length === 2) return `${surname(authors[0] ?? "")} and ${surname(authors[1] ?? "")}`;
  return `${surname(authors[0] ?? "")} et al.`;
}

const listed = (orders: readonly number[]): string => (orders.length === 1 ? `level ${orders[0]}` : `levels ${orders.slice(0, -1).join(", ")} and ${orders.at(-1)}`);

/** The worlds grouped by paper, in the index's order: hand-made worlds first, then each paper's generated ones, newest first. */
function byPaper(worlds: readonly LibraryWorld[]): { readonly paper: LibraryWorld["paper"]; readonly worlds: readonly LibraryWorld[] }[] {
  const groups: { paper: LibraryWorld["paper"]; worlds: LibraryWorld[] }[] = [];
  for (const world of worlds) {
    const group = groups.find((entry) => entry.paper.title === world.paper.title);
    if (group) group.worlds.push(world);
    else groups.push({ paper: world.paper, worlds: [world] });
  }
  return groups;
}

function WorldRow({ world }: { readonly world: LibraryWorld }) {
  const status = STATUS[world.status];
  const picture = <img src={world.thumbnail} alt="" width={320} height={200} loading="lazy" />;
  const replacement = world.retired?.replacedBy ? WORLDS.find((entry) => entry.id === world.retired?.replacedBy) : undefined;
  return (
    <li className={`library-world${world.route ? "" : " library-world-retired"}`} data-world={world.id}>
      {world.route ? (
        <a className="library-thumb" href={world.route} tabIndex={-1} aria-hidden="true">
          {picture}
        </a>
      ) : (
        <span className="library-thumb" aria-hidden="true">
          {picture}
        </span>
      )}
      <div className="library-text">
        <h3>{world.route ? <a href={world.route}>{world.title}</a> : world.title}</h3>
        <p className="library-meta">
          <span className={`library-status library-status-${world.status}`} title={status.meaning}>
            {status.label}
          </span>{" "}
          <span>{world.madeBy === "hand" ? "Made by hand" : `Made by the pipeline${world.recordedOn ? ` on ${world.recordedOn}` : ""}`}</span>
          <span aria-hidden="true"> · </span>
          <span>{world.family}</span>
          <span aria-hidden="true"> · </span>
          <code className="library-route">{world.route ?? world.id}</code>
        </p>
        {world.retired ? (
          <p className="library-note library-retired">
            Retired on {world.retired.on}: {world.retired.reason}
            {replacement?.route ? (
              <>
                {" "}
                Replaced by <a href={replacement.route}>{replacement.title}</a>, {replacement.recordedOn ?? ""}.
              </>
            ) : null}
          </p>
        ) : null}
        <ol className="library-levels" aria-label={`${world.title}'s levels`}>
          {world.levels.map((level) => (
            <li key={level.order}>{level.bonus ? `${level.title} (bonus)` : level.title}</li>
          ))}
        </ol>
        {world.definitional.length > 0 ? (
          <p className="library-note">
            Made before the rule of 2026-10-18: {listed(world.definitional)} {world.definitional.length === 1 ? "is" : "are"} definitional by it. Kept as made.
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function LibraryPage() {
  const groups = byPaper(WORLDS);
  return (
    <div className="shell library-shell">
      <header className="masthead">
        <p className="brand">PaperPlay</p>
        <h1>Library</h1>
      </header>
      <main className="page library">
        <p className="library-intro">
          Every world this build holds: made by hand, as references, or by the pipeline from a paper. Verified worlds quote only passages checked against their paper; a
          draft is not checked yet; a generated world is checked by the pipeline's rules.
        </p>
        {groups.map((group) => (
          <section key={group.paper.title} className="library-paper" aria-labelledby={`paper-${group.worlds[0]?.id ?? ""}`}>
            <h2 id={`paper-${group.worlds[0]?.id ?? ""}`}>
              <cite>{group.paper.title}</cite>
            </h2>
            <p className="library-citation">
              {authorsOf(group.paper.authors)}, {group.paper.year}
              {group.paper.venue ? `. ${group.paper.venue}` : ""}
            </p>
            <ul className="library-worlds">
              {group.worlds.map((world) => (
                <WorldRow key={world.id} world={world} />
              ))}
            </ul>
          </section>
        ))}
        {ThisMachine ? (
          <Suspense fallback={null}>
            <ThisMachine />
          </Suspense>
        ) : null}
      </main>
    </div>
  );
}
