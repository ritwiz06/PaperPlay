import { OriginLegend } from "@paperplay/ui/react";
import { useSyncExternalStore } from "react";
import { HookWorld } from "./hook/HookWorld.tsx";
import { LocalWorld } from "./world/LocalWorld.tsx";
import { THRESHOLD_TOWN_PLAY } from "./worlds/epidemic.tsx";
import { FLOCKING_PLAY } from "./worlds/flocking.tsx";

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
