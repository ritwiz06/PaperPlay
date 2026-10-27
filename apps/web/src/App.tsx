import { OriginLegend } from "@paperplay/ui/react";
import { lazy, Suspense, useMemo, useSyncExternalStore } from "react";
import { HookWorld } from "./hook/HookWorld.tsx";
import { LocalWorld } from "./world/LocalWorld.tsx";
import { THRESHOLD_TOWN_PLAY } from "./worlds/epidemic.tsx";
import { FLOCKING_PLAY } from "./worlds/flocking.tsx";
import { MOMENTUM_PLAY } from "./worlds/momentum.tsx";
import { GeneratedWorld } from "./worlds/GeneratedWorld.tsx";
import { LibraryPage } from "./library/LibraryPage.tsx";

/** /create, on a development server only: a production build holds none of it (ADR-0030). */
const CreatePage = import.meta.env.DEV ? lazy(() => import("./create/CreatePage.tsx").then((module) => ({ default: module.CreatePage }))) : null;
/** The trained miniature's bits in the browser, for a test to compare with Node's, on a development server only (ADR-0057). */
const MiniatureCheck = import.meta.env.DEV ? lazy(() => import("./check/MiniatureCheck.tsx").then((module) => ({ default: module.MiniatureCheck }))) : null;
/** The mechanism sandbox in the browser, for the tests of what a module cannot reach, on a development server only (ADR-0058). */
const SandboxCheck = import.meta.env.DEV ? lazy(() => import("./check/SandboxCheck.tsx").then((module) => ({ default: module.SandboxCheck }))) : null;
/** The six generic scene kits, each drawing a hand-made frame, on a development server only (ADR-0058). */
const KitsCheck = import.meta.env.DEV ? lazy(() => import("./check/KitsCheck.tsx").then((module) => ({ default: module.KitsCheck }))) : null;

const subscribe = (onChange: () => void) => {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
};
const currentPath = () => window.location.pathname;

/**
 * The shell: a masthead with the origin legend, which is always on screen, and the page for
 * the current path. The web app renders state and submits actions; it never computes science.
 */
export function App() {
  const path = useSyncExternalStore(subscribe, currentPath);
  // The game-first shell (ADR-0008) owns the whole window: no masthead over its stage.
  if (path === "/world/hook") return <HookWorld play={FLOCKING_PLAY} />;
  if (path === "/world/epidemic") return <HookWorld play={THRESHOLD_TOWN_PLAY} />;
  if (path === "/world/momentum") return <HookWorld play={MOMENTUM_PLAY} />;
  if (path === "/library") return <LibraryPage />;
  const generated = /^\/world\/generated\/([A-Za-z0-9._-]+)$/.exec(path)?.[1];
  if (generated) return <Generated id={generated} />;
  if (import.meta.env.DEV) {
    const job = /^\/world\/job\/([a-z0-9-]+)$/.exec(path)?.[1];
    if (job) return <FromJob id={job} />;
    const cached = /^\/world\/cached\/([a-z]+-[A-Za-z0-9.]+)$/.exec(path)?.[1];
    if (cached) return <FromCache keyed={cached} />;
    if (path === "/check/miniature" && MiniatureCheck)
      return (
        <Suspense fallback={null}>
          <MiniatureCheck />
        </Suspense>
      );
    if (path === "/check/sandbox" && SandboxCheck)
      return (
        <Suspense fallback={null}>
          <SandboxCheck />
        </Suspense>
      );
    if (path === "/check/kits" && KitsCheck)
      return (
        <Suspense fallback={null}>
          <KitsCheck />
        </Suspense>
      );
    if (path === "/create" && CreatePage)
      return (
        <Suspense fallback={null}>
          <CreatePage />
        </Suspense>
      );
  }
  const world = path === "/world/local";
  return (
    <div className="shell">
      <header className="masthead">
        <p className="brand">PaperPlay</p>
        <h1>{world ? "Murmuration Valley" : "Nothing here"}</h1>
        <OriginLegend />
      </header>
      {world ? (
        <main className="page">
          <LocalWorld />
        </main>
      ) : (
        <main className="page not-found">
          <p>There is no page at {path}.</p>
          <p>
            <a href="/world/local">Go to Murmuration Valley</a>
          </p>
        </main>
      )}
    </div>
  );
}

function Generated({ id }: { readonly id: string }) {
  const from = useMemo(() => ({ generated: id }), [id]);
  return <GeneratedWorld from={from} />;
}

function FromJob({ id }: { readonly id: string }) {
  const from = useMemo(() => ({ job: id }), [id]);
  return <GeneratedWorld from={from} />;
}

/** A world the local API keeps by paper and version (R13, ADR-0053). */
function FromCache({ keyed }: { readonly keyed: string }) {
  const from = useMemo(() => ({ cached: keyed }), [keyed]);
  return <GeneratedWorld from={from} />;
}
