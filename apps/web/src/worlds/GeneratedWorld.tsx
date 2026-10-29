/**
 * A world the pipeline generated, played in the town kit: from the local API's job on a development
 * server (/world/job/<id>), or a world it keeps by paper and version (/world/cached/<key>), or from
 * fixtures/worldspecs/generated/ on any build (/world/generated/<id>), since the public site only
 * plays worlds built beforehand (ADR-0030). Either way the builder checks it here before it plays,
 * and a world that does not build is refused with the reason. A job still running plays the levels
 * it has released, each past every check, and says the reviewers have not read them (R13, ADR-0053).
 * A world on a generated module (ADR-0058) plays that module in the browser's sandbox, once its
 * source's hash matches the one the world names; otherwise it is refused.
 */
import { MechanismManifest } from "@paperplay/contracts";
import { buildWorld } from "@paperplay/pipeline";
import { registry } from "@paperplay/primitives";
import { useEffect, useState } from "react";
import { HookWorld } from "../hook/HookWorld.tsx";
import { openBrowserSandbox, type BrowserSandbox } from "../mechanism/sandbox.ts";
import { mechanismWorld } from "./mechanism-world.tsx";
import { townWorld } from "./town-world.tsx";
import type { PlayableWorld } from "./types.ts";

/** The generated worlds this build holds, each loaded only when its page is opened. */
const GENERATED = import.meta.glob<{ default: unknown }>("../../../../fixtures/worldspecs/generated/*.json");

export function generatedWorldIds(): string[] {
  return Object.keys(GENERATED).map((path) => path.replace(/^.*\/(.+)\.json$/, "$1"));
}

type From = { readonly job: string } | { readonly generated: string } | { readonly cached: string };

/** Levels a running job released: how many of how many. */
interface Partial {
  readonly levels: number;
  readonly of: number;
}

/** A generated world's module (ADR-0058): from the job that wrote it, or the cache beside its world, on a development server. */
async function moduleOf(from: From): Promise<string> {
  if (!import.meta.env.DEV || "generated" in from) throw new Error("a generated module plays only on a local development server, from the job that wrote it");
  const response = await fetch("job" in from ? `/api/jobs/${encodeURIComponent(from.job)}/artifacts/mechanism` : `/api/worlds/${encodeURIComponent(from.cached)}/mechanism`);
  if (!response.ok) throw new Error(`the world's module is not available: the API answered ${response.status}`);
  const { source } = (await response.json()) as { source?: unknown };
  if (typeof source !== "string") throw new Error("the world's module came without its source");
  return source;
}

const hex = (bytes: ArrayBuffer): string => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

async function load(from: From): Promise<{ readonly spec: unknown; readonly partial: Partial | null }> {
  if ("job" in from || "cached" in from) {
    // From the local API, on a development server only; a production build drops this.
    if (!import.meta.env.DEV) throw new Error("a job's world plays only on a local development server");
    if ("cached" in from) {
      const kept = await fetch(`/api/worlds/${encodeURIComponent(from.cached)}`);
      if (!kept.ok) throw new Error(`no world is kept for ${from.cached}: the API answered ${kept.status}`);
      return { spec: await kept.json(), partial: null };
    }
    const response = await fetch(`/api/jobs/${encodeURIComponent(from.job)}/world`);
    if (response.ok) return { spec: await response.json(), partial: null };
    // Not ready yet: the levels it has released, if any have passed every check.
    const released = response.status === 409 ? await fetch(`/api/jobs/${encodeURIComponent(from.job)}/released`) : null;
    if (!released?.ok) throw new Error(`the job's world is not available: the API answered ${response.status}, and no level has passed its checks yet`);
    const part = (await released.json()) as { levels: unknown[]; of: number; world: unknown };
    return { spec: part.world, partial: { levels: part.levels.length, of: part.of } };
  }
  const loader = GENERATED[`../../../../fixtures/worldspecs/generated/${from.generated}.json`];
  if (!loader) throw new Error(`there is no generated world ${from.generated}`);
  return { spec: (await loader()).default, partial: null };
}

export function GeneratedWorld({ from }: { readonly from: From }) {
  const [play, setPlay] = useState<PlayableWorld | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [partial, setPartial] = useState<Partial | null>(null);
  /** Whether the job has released more levels, or finished, since this page loaded them. */
  const [newer, setNewer] = useState(false);
  const [round, setRound] = useState(0);
  useEffect(() => {
    let live = true;
    let sandbox: BrowserSandbox | null = null;
    load(from)
      .then(async ({ spec, partial: part }) => {
        if (live) setPartial(part);
        const built = buildWorld(spec, registry);
        if (!built.ok) throw new Error(`the world does not build: ${built.problems.slice(0, 3).map((entry) => `${entry.path}: ${entry.message}`).join("; ")}`);
        // "A PaperPlay world about" the paper itself, by its title, so a generated world names its source.
        const about = `“${built.world.source.title}”`;
        if (built.world.family.id !== "generated") {
          if (live) setPlay(townWorld(built.world, { about }));
          return;
        }
        // A generated module: the one the world names by its hash, run only in the sandbox.
        const binding = (spec as { levels: { binding: { module: { sha256: string }; manifest: unknown } }[] }).levels[0]?.binding;
        if (!binding) throw new Error("the world names no module");
        const source = await moduleOf(from);
        const digest = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source)));
        if (digest !== binding.module.sha256) throw new Error("the module's source does not match the hash its world names, so it is not run");
        const opened = openBrowserSandbox(source);
        sandbox = opened;
        if (live) setPlay(mechanismWorld(built.world, opened, MechanismManifest.parse(binding.manifest), { about }));
      })
      .catch((error: unknown) => live && setProblem(error instanceof Error ? error.message : String(error)));
    return () => {
      live = false;
      void sandbox?.close();
    };
  }, [from, round]);
  // While levels are still arriving, the job's events say when more have passed or the world is ready.
  const job = "job" in from ? from.job : null;
  useEffect(() => {
    // A development server's API only: a production build holds none of this (ADR-0030).
    if (!import.meta.env.DEV || !partial || job === null) return;
    const events = new EventSource(`/api/jobs/${encodeURIComponent(job)}/events`);
    events.addEventListener("state", (message) => {
      const event = JSON.parse((message as MessageEvent<string>).data) as { step?: string; state?: string };
      if (event.step === "release" || event.state === "ready") setNewer(true);
    });
    events.onerror = () => events.close();
    return () => events.close();
  }, [partial, job]);
  if (problem) return <main className="page not-found"><p>{problem}</p></main>;
  if (!play) return <main className="page"><p>Building the world…</p></main>;
  // In the HUD's own flow, so it never lies over the fork or the journal.
  const arriving = partial ? (
    <aside className="arriving" role="status">
      <p>
        Still being made: {partial.levels} of {partial.of} levels have passed every check and are playable; the reviewers have not read them yet.
      </p>
      {newer ? (
        <button
          type="button"
          onClick={() => {
            setNewer(false);
            setPlay(null);
            setRound((count) => count + 1);
          }}
        >
          Show the newest levels
        </button>
      ) : null}
    </aside>
  ) : null;
  return <HookWorld key={round} play={play} notice={arriving} />;
}
