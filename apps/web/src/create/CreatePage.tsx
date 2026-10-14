/**
 * /create, on a local development server only (ADR-0030): paste an arXiv id or a PMCID, and watch
 * the job's real states arrive from the API over server-sent events, as a storyboard (R11). There is
 * no progress bar and no time estimate: a stage is done when the job has left it. A failure, an
 * unsupported paper or a question for the owner says exactly why, in the job's own words. The
 * production build holds none of this; the public site only plays worlds built beforehand.
 */
import type { JobEvent, JobState } from "@paperplay/contracts";
import { useEffect, useRef, useState, type FormEvent } from "react";
import "./create.css";

/** The path a job takes, in order; repairs and endings are shown where they happen. */
const PATH: readonly { readonly state: JobState; readonly title: string; readonly what: string }[] = [
  { state: "received", title: "Received", what: "The request is in." },
  { state: "parsing", title: "Reading the source", what: "Fetched and read with restricted readers; its licence recorded." },
  { state: "planning", title: "Planning", what: "Routed, read, transcribed twice by different vendors, matched, then levels planned." },
  { state: "building", title: "Building", what: "Assembled and built against the solver, its units and checks." },
  { state: "running", title: "The level rule", what: "Every What-if swept over 20 starts." },
  { state: "checking", title: "Checking", what: "Every anchor checked against the source; the reviewer reads it." },
  { state: "ready", title: "Ready", what: "Built and checked: playable." },
];
const ENDINGS: Readonly<Partial<Record<JobState, string>>> = {
  needs_information: "Needs your decision",
  unsupported: "Not supported",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function CreatePage() {
  const [source, setSource] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const stream = useRef<EventSource | null>(null);

  useEffect(() => () => stream.current?.close(), []);

  const start = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setEvents([]);
    stream.current?.close();
    const response = await fetch("/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: source.trim() }) }).catch(() => null);
    if (!response) {
      setError("The API is not running. Start it with npm run dev:api, or npm run pipeline:live -- serve for live model calls.");
      return;
    }
    const body = (await response.json()) as { jobId?: string; error?: string };
    if (!response.ok || !body.jobId) {
      setError(body.error ?? `The API answered ${response.status}.`);
      return;
    }
    setJobId(body.jobId);
    const events = new EventSource(`/api/jobs/${body.jobId}/events`);
    events.addEventListener("state", (message) => {
      const parsed = JSON.parse((message as MessageEvent<string>).data) as JobEvent;
      setEvents((seen) => (seen.some((entry) => entry.seq === parsed.seq) ? seen : [...seen, parsed]));
    });
    events.onerror = () => events.close();
    stream.current = events;
  };

  // Each event under the stage it belongs to; a repair under the stage it repairs.
  const logged = new Map<JobState, JobEvent[]>();
  let stage: JobState = "received";
  for (const entry of events) {
    if (PATH.some((step) => step.state === entry.state)) stage = entry.state;
    if (entry.state === "repairing" || PATH.some((step) => step.state === entry.state)) logged.set(stage, [...(logged.get(stage) ?? []), entry]);
  }
  const last = events.at(-1);
  const reached = new Set(events.map((entry) => entry.state));
  const ending = last && ENDINGS[last.state] ? last : null;
  const statusOf = (state: JobState): "done" | "now" | "waiting" =>
    last?.state === state && !ending ? "now" : reached.has(state) && (last?.state !== state || state === "ready") ? "done" : "waiting";

  return (
    <main className="create">
      <header className="create-head">
        <p className="create-local">On this machine only: the public site never runs this page.</p>
        <h1>Make a world from a paper</h1>
        <p>Paste an arXiv id with its version, or a PubMed Central id. PaperPlay makes worlds from compartment-model papers, so far.</p>
      </header>
      <form className="create-form" onSubmit={(event) => void start(event)}>
        <label htmlFor="create-source">Paper</label>
        <input id="create-source" value={source} onChange={(event) => setSource(event.target.value)} placeholder="arxiv:2506.19869v1 or pmc:PMC12334037" autoComplete="off" spellCheck={false} />
        <button type="submit" className="create-go" disabled={source.trim().length === 0}>
          Make a world
        </button>
        <p className="create-note">A PDF from your files comes with PDF ingest, next.</p>
      </form>
      {error ? (
        <p className="create-error" role="alert">
          {error}
        </p>
      ) : null}
      {jobId ? (
        <section className="storyboard" aria-labelledby="storyboard-title" data-state={last?.state ?? "received"}>
          <h2 id="storyboard-title">Job {jobId}</h2>
          <ol>
            {PATH.map((step) => {
              const status = statusOf(step.state);
              const said = logged.get(step.state) ?? [];
              return (
                <li key={step.state} className={`story story-${status}`} data-step={step.state} aria-current={status === "now" ? "step" : undefined}>
                  <span className="story-mark" aria-hidden="true" />
                  <div>
                    <h3>
                      {step.title} <span className="story-status">{status === "done" ? "done" : status === "now" ? "now" : "waiting"}</span>
                    </h3>
                    <p className="story-what">{step.what}</p>
                    {said.length > 0 ? (
                      <ul className="story-log">
                        {said.map((entry) => (
                          <li key={entry.seq} className={entry.state === "repairing" ? "story-repair" : undefined}>
                            {entry.state === "repairing" ? "Repair: " : ""}
                            {entry.message}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
          {ending ? (
            <div className={`story-ending story-${ending.state}`} role="status">
              <h3>{ENDINGS[ending.state]}</h3>
              <p>{ending.message}</p>
            </div>
          ) : null}
          {last?.state === "ready" ? (
            <p className="story-play">
              <a href={`/world/job/${jobId}`}>Play the world</a>
            </p>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
