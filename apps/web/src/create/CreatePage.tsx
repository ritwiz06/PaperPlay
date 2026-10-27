/**
 * /create, on a local development server only (ADR-0030): paste an arXiv id or a PMCID, and watch
 * the job's real states arrive from the API over server-sent events, as a storyboard (R11). There is
 * no progress bar and no time estimate: a stage is done when the job has left it. A failure, an
 * unsupported paper or a question for the owner says exactly why, in the job's own words. Levels
 * that pass every check are playable before the job ends, and the storyboard shows the rest arriving;
 * a paper made before is served at once (R13, ADR-0053). The production build holds none of this;
 * the public site only plays worlds built beforehand.
 */
import type { JobEvent, JobState, Origin } from "@paperplay/contracts";
import { OriginChip } from "@paperplay/ui/react";
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

/** The levels released so far: each passed every check; no reviewer has read them yet (R13). */
interface Released {
  readonly levels: readonly { readonly level: number; readonly title: string }[];
  readonly of: number;
}

/**
 * The explainer page a paper falls back to, tier C (ADR-0058): what it asks and finds, each finding
 * with its passage where the source holds it, and why there is no world.
 */
interface ExplainerPage {
  readonly title: string;
  readonly why: string;
  readonly question: string | null;
  readonly mechanism: string;
  readonly findings: readonly { readonly text: string; readonly origin: Origin; readonly quote: string | null }[];
}

/** A paper made before, under today's rules: its world's address, and the job that made it. */
interface Cached {
  readonly world: string;
  readonly jobId: string;
  readonly madeAt: string;
}

export function CreatePage() {
  const [source, setSource] = useState("");
  const [released, setReleased] = useState<Released | null>(null);
  const [explainer, setExplainer] = useState<ExplainerPage | null>(null);
  const [cached, setCached] = useState<Cached | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const stream = useRef<EventSource | null>(null);

  useEffect(() => () => stream.current?.close(), []);

  const start = async (event: FormEvent | null, fresh = false) => {
    event?.preventDefault();
    setError(null);
    setEvents([]);
    setReleased(null);
    setExplainer(null);
    setCached(null);
    setJobId(null);
    stream.current?.close();
    // A PDF from this machine goes as itself; an identifier as a line of JSON.
    const request = file
      ? fetch(`/api/jobs/pdf?name=${encodeURIComponent(file.name)}`, { method: "POST", headers: { "content-type": "application/pdf" }, body: file })
      : fetch("/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: source.trim(), ...(fresh ? { fresh: true } : {}) }) });
    const response = await request.catch(() => null);
    if (!response) {
      setError("The API is not running. Start it with npm run dev:api, or npm run pipeline:live -- serve for live model calls.");
      return;
    }
    const body = (await response.json()) as { jobId?: string; error?: string; cached?: Cached };
    if (response.ok && body.cached) {
      setCached(body.cached);
      return;
    }
    if (!response.ok || !body.jobId) {
      setError(body.error ?? `The API answered ${response.status}.`);
      return;
    }
    setJobId(body.jobId);
    const events = new EventSource(`/api/jobs/${body.jobId}/events`);
    const id = body.jobId;
    events.addEventListener("state", (message) => {
      const parsed = JSON.parse((message as MessageEvent<string>).data) as JobEvent;
      setEvents((seen) => (seen.some((entry) => entry.seq === parsed.seq) ? seen : [...seen, parsed]));
      // Levels that passed every check: which, of how many, as the job releases them.
      if (parsed.step === "release")
        void fetch(`/api/jobs/${id}/released`)
          .then((answer) => (answer.ok ? (answer.json() as Promise<Released>) : null))
          .then((value) => value && setReleased(value))
          .catch(() => undefined);
      // A paper that falls back to tier C: its explainer page, when the job made one.
      if (parsed.state === "unsupported" || parsed.state === "failed")
        void fetch(`/api/jobs/${id}/artifacts/explainer`)
          .then((answer) => (answer.ok ? (answer.json() as Promise<ExplainerPage>) : null))
          .then((value) => value && setExplainer(value))
          .catch(() => undefined);
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
  // A stage is done once the job has left it, and ready is done on arrival: nothing follows it.
  const statusOf = (state: JobState): "done" | "now" | "waiting" =>
    !reached.has(state) ? "waiting" : last?.state !== state || state === "ready" ? "done" : ending ? "done" : "now";

  return (
    <main className="create">
      <header className="create-head">
        <p className="create-local">On this machine only: the public site never runs this page.</p>
        <h1>Make a world from a paper</h1>
        <p>Paste an arXiv id with its version or a PubMed Central id, or choose a PDF. PaperPlay makes worlds from compartment-model papers, so far.</p>
        <p>A world takes up to twelve minutes; its first levels are playable as soon as they pass their checks. Agent-experiment worlds are made beforehand only, never on request.</p>
      </header>
      <form className="create-form" onSubmit={(event) => void start(event)}>
        <label htmlFor="create-source">Paper</label>
        <input id="create-source" value={source} onChange={(event) => setSource(event.target.value)} placeholder="arxiv:2506.19869v1 or pmc:PMC12334037" autoComplete="off" spellCheck={false} />
        <button type="submit" className="create-go" disabled={source.trim().length === 0 && file === null}>
          Make a world
        </button>
        <label htmlFor="create-file" className="create-file-label">
          Or a PDF from your files
        </label>
        <input
          id="create-file"
          className="create-file"
          type="file"
          accept="application/pdf"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <p className="create-note">A PDF's text is read as it is laid out; an equation it draws rather than writes is named and left out. Its licence is unknown, so nothing from it is kept.</p>
      </form>
      {error ? (
        <p className="create-error" role="alert">
          {error}
        </p>
      ) : null}
      {cached ? (
        <section className="storyboard story-cached" aria-labelledby="cached-title">
          <h2 id="cached-title">Made before</h2>
          <p>
            This paper's world was made by job {cached.jobId} at {cached.madeAt.slice(0, 16).replace("T", " ")}, under today's rules, and passed every check then. It is served as it was made.
          </p>
          <p className="story-play">
            <a href={`/world/cached/${cached.world.replace(/^\/worlds\//, "")}`}>Play the world</a>{" "}
            <button type="button" className="story-again" onClick={() => void start(null, true)}>
              Make it again
            </button>
          </p>
        </section>
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
          {explainer ? (
            <article className="story-explainer" aria-labelledby="explainer-title">
              <h3 id="explainer-title">What the paper says</h3>
              <p className="story-explainer-why">There is no world to play for {explainer.title}: {explainer.why}.</p>
              {explainer.question ? (
                <p>
                  <OriginChip origin="generated-inference" /> It asks: {explainer.question}
                </p>
              ) : null}
              <p>
                <OriginChip origin="generated-inference" /> Its mechanism: {explainer.mechanism}
              </p>
              <ul>
                {explainer.findings.map((finding) => (
                  <li key={finding.text}>
                    <OriginChip origin={finding.origin} /> {finding.text}
                    {finding.quote ? <blockquote>{finding.quote}</blockquote> : null}
                  </li>
                ))}
              </ul>
            </article>
          ) : null}
          {released && last?.state !== "ready" ? (
            <div className="story-levels" role="status">
              <h3>
                {released.levels.length} of {released.of} levels playable
              </h3>
              <p>Each passed every check; the reviewers have not read them yet. The rest arrive as they pass.</p>
              <ul>
                {released.levels.map((level) => (
                  <li key={level.level}>
                    Level {level.level}: {level.title}
                  </li>
                ))}
              </ul>
              {!ending || ending.state === "failed" ? (
                <p className="story-play">
                  <a href={`/world/job/${jobId}`}>Play the levels that passed</a>
                </p>
              ) : null}
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
