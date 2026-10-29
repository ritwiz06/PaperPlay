/**
 * /check/kits, on a development server only (ADR-0058): the six generic scene kits a generated
 * mechanism draws in, each with a hand-made frame, so their look can be judged and a test can
 * see that each one draws. `?kit=towers` shows one kit alone, at the size of the window, and
 * `?sample=towers-even` one of the frames kept off the page for a single look.
 */
import { MechanismCanvas } from "@paperplay/ui/react/mechanism";
import { KIT_SAMPLES, LOOK_SAMPLES, parsedSample, type KitSample } from "./kit-samples.ts";
import "./kits.css";

export function KitsCheck() {
  const query = new URLSearchParams(window.location.search);
  const [only, named] = [query.get("kit"), query.get("sample")];
  const samples = named ? LOOK_SAMPLES.filter((sample) => sample.id === named) : KIT_SAMPLES.filter((sample) => !only || sample.kit === only);
  return (
    <main className={`kits-check${only || named ? " kits-check-one" : ""}`}>
      <header className="kits-check-head">
        <h1>The generic scene kits</h1>
        <p>Hand-made frames, one for each kit a generated mechanism draws in. They show the look, not any result.</p>
      </header>
      <div className="kits-check-cards">
        {samples.map((sample) => (
          <Card key={sample.id ?? sample.kit} sample={sample} />
        ))}
      </div>
    </main>
  );
}

function Card({ sample }: { readonly sample: KitSample }) {
  const parsed = parsedSample(sample);
  const heading = `kit-${sample.id ?? sample.kit}`;
  return (
    <section className="kits-check-card" aria-labelledby={heading} data-kit={sample.kit}>
      <h2 id={heading}>{sample.title}</h2>
      <p>{sample.note}</p>
      <div className="kits-check-stage">
        {"frame" in parsed ? (
          <MechanismCanvas frame={parsed.frame} label={sample.label} />
        ) : (
          <ul className="kits-check-problems" aria-label="What is wrong with this frame">
            {parsed.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
