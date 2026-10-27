/**
 * The library's worlds made on this machine (ADR-0049), on a development server only: the jobs the
 * API holds since it started, each ready one linked to its world. A production build holds none of
 * this, so the public library lists only the worlds built beforehand.
 */
import { GENERATED_MODEL_LABEL } from "@paperplay/contracts";
import { useEffect, useState } from "react";

interface JobRow {
  readonly jobId: string;
  readonly source: string;
  readonly state: string;
  readonly world: { readonly title: string; readonly levels: readonly { readonly order: number; readonly title: string; readonly bonus: boolean }[] } | null;
  /** A world on a module a coding model wrote, checked and never verified (ADR-0058). */
  readonly generatedModel?: boolean;
}

type Listing = { readonly kind: "loading" } | { readonly kind: "none"; readonly why: string } | { readonly kind: "jobs"; readonly jobs: readonly JobRow[] };

export function ThisMachine() {
  const [listing, setListing] = useState<Listing>({ kind: "loading" });
  useEffect(() => {
    let live = true;
    fetch("/api/jobs")
      .then(async (response) => (response.ok ? ((await response.json()) as { jobs: JobRow[] }) : Promise.reject(new Error(String(response.status)))))
      .then((body) => live && setListing({ kind: "jobs", jobs: body.jobs }))
      .catch(() => live && setListing({ kind: "none", why: "The API is not running, so this list is empty: start it with npm run dev:api, or npm run pipeline:live -- serve to make worlds live." }));
    return () => {
      live = false;
    };
  }, []);
  return (
    <section className="library-paper" aria-labelledby="this-machine">
      <h2 id="this-machine">Made on this machine</h2>
      <p className="library-citation">Worlds the API has made since it started, from /create. Not in the public build.</p>
      {listing.kind === "loading" ? <p className="library-note">Asking the API…</p> : null}
      {listing.kind === "none" ? <p className="library-note">{listing.why}</p> : null}
      {listing.kind === "jobs" && listing.jobs.length === 0 ? <p className="library-note">None yet: make one at <a href="/create">/create</a>.</p> : null}
      {listing.kind === "jobs" && listing.jobs.length > 0 ? (
        <ul className="library-worlds">
          {listing.jobs.map((job) => (
            <li key={job.jobId} className="library-world library-world-job" data-job={job.jobId}>
              <div className="library-text">
                <h3>{job.world ? <a href={`/world/job/${job.jobId}`}>{job.world.title}</a> : job.source}</h3>
                <p className="library-meta">
                  <span className="library-status library-status-generated">{job.world ? (job.generatedModel ? "Generated model" : "Generated") : "Not ready"}</span> <span>{job.source}</span>
                  <span aria-hidden="true"> · </span>
                  <span>job {job.state}</span>
                </p>
                {job.generatedModel ? <p className="library-note">{GENERATED_MODEL_LABEL.charAt(0).toUpperCase() + GENERATED_MODEL_LABEL.slice(1)}.</p> : null}
                {job.world ? (
                  <ol className="library-levels" aria-label={`${job.world.title}'s levels`}>
                    {job.world.levels.map((level) => (
                      <li key={level.order}>{level.bonus ? `${level.title} (bonus)` : level.title}</li>
                    ))}
                  </ol>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
