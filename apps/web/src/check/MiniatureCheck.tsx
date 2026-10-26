/**
 * /check/miniature, on a development server only (ADR-0057): the trained miniature run in the
 * browser on one held-out input, every number it computes hashed, so a test can compare the
 * browser's bits with Node's. It shows nothing else; the production build holds none of it.
 */
import { attentionToy, readWeights, WeightsManifest } from "@paperplay/primitives/attention";
import { useEffect, useState } from "react";
import check from "../../../../fixtures/weights/miniature-2-heads/check.json";
import manifest from "../../../../fixtures/weights/miniature-2-heads/manifest.json";
import weightsUrl from "../../../../fixtures/weights/miniature-2-heads/weights.bin?url";

async function digest(): Promise<string> {
  const bytes = new Uint8Array(await (await fetch(weightsUrl)).arrayBuffer());
  const parsed = WeightsManifest.parse(manifest);
  const tokens = (check as { inputs: number[][] }).inputs[0] ?? [];
  const state = attentionToy.init({ tokens, vocab: parsed.architecture.vocab, dModel: parsed.architecture.dModel, heads: parsed.architecture.heads, scaled: 1, positional: 1, causal: 0, recurrent: 0, weights: readWeights(bytes, parsed), task: "previous-plus-mirror" }, 1);
  const view = new DataView(new ArrayBuffer(8));
  const bits = [...state.output.flat(), ...state.heads.flatMap((head) => head.weights.flat()), ...state.scores.flat()]
    .map((value) => {
      view.setFloat64(0, value);
      return view.getBigUint64(0).toString(16).padStart(16, "0");
    })
    .join("");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(bits));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function MiniatureCheck() {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    void digest().then(setValue);
  }, []);
  return (
    <main className="page">
      <h1>The miniature in this browser</h1>
      <p>
        Every number of one forward pass, hashed: <output data-digest={value ?? ""}>{value ?? "computing"}</output>
      </p>
    </main>
  );
}
