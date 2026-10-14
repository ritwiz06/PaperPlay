/**
 * A world the pipeline generated, played in the town kit: from the local API's job on a development
 * server (/world/job/<id>), or from fixtures/worldspecs/generated/ on any build (/world/generated/<id>),
 * since the public site only plays worlds built beforehand (ADR-0030). Either way the builder checks
 * it here before it plays, and a world that does not build is refused with the reason.
 */
import { buildWorld } from "@paperplay/pipeline";
import { registry } from "@paperplay/primitives";
import { useEffect, useState } from "react";
import { HookWorld } from "../hook/HookWorld.tsx";
import { townWorld } from "./town-world.tsx";
import type { PlayableWorld } from "./types.ts";

/** The generated worlds this build holds, each loaded only when its page is opened. */
const GENERATED = import.meta.glob<{ default: unknown }>("../../../../fixtures/worldspecs/generated/*.json");

export function generatedWorldIds(): string[] {
  return Object.keys(GENERATED).map((path) => path.replace(/^.*\/(.+)\.json$/, "$1"));
}

async function load(from: { readonly job: string } | { readonly generated: string }): Promise<unknown> {
  if ("job" in from) {
    // A job's world comes from the local API, on a development server only; a production build drops this.
    if (!import.meta.env.DEV) throw new Error("a job's world plays only on a local development server");
    const response = await fetch(`/api/jobs/${encodeURIComponent(from.job)}/world`);
    if (!response.ok) throw new Error(`the job's world is not available: the API answered ${response.status}`);
    return response.json();
  }
  const loader = GENERATED[`../../../../fixtures/worldspecs/generated/${from.generated}.json`];
  if (!loader) throw new Error(`there is no generated world ${from.generated}`);
  return (await loader()).default;
}

export function GeneratedWorld({ from }: { readonly from: { readonly job: string } | { readonly generated: string } }) {
  const [play, setPlay] = useState<PlayableWorld | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    load(from)
      .then((spec) => {
        const built = buildWorld(spec, registry);
        if (!built.ok) throw new Error(`the world does not build: ${built.problems.slice(0, 3).map((entry) => `${entry.path}: ${entry.message}`).join("; ")}`);
        if (live) setPlay(townWorld(built.world, { about: "a paper's model" }));
      })
      .catch((error: unknown) => live && setProblem(error instanceof Error ? error.message : String(error)));
    return () => {
      live = false;
    };
  }, [from]);
  if (problem) return <main className="page not-found"><p>{problem}</p></main>;
  if (!play) return <main className="page"><p>Building the world…</p></main>;
  return <HookWorld play={play} />;
}
