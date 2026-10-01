import { useEffect, useRef } from "react";
import { startLocalStage } from "./stage/local-stage.ts";

/**
 * The stage for the first world. Controls, the paper and readouts arrive with the
 * WorldStage and LabBench slice; the web app renders state and never computes science.
 */
export function App() {
  const stage = useRef<HTMLElement>(null);

  useEffect(() => {
    const container = stage.current;
    return container ? startLocalStage(container) : undefined;
  }, []);

  return (
    <div className="shell">
      <header className="masthead">
        <h1>PaperPlay</h1>
        <p>Murmuration Valley</p>
      </header>
      <main className="stage" ref={stage} />
    </div>
  );
}
