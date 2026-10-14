/**
 * The capability probe (ADR-0030): does a model hold its reply to a JSON Schema on this gateway,
 * and if not, does plain JSON, validated and retried once, work instead? One small extraction, a
 * compartment model's names and a rate from three sentences, asked both ways.
 */
import { completeStructured, extractJson, jsonSchemaOf, type ModelClient } from "@paperplay/pipeline/models";
import { z } from "zod";

/** What the probe asks for: small, exact, and checkable. */
export const ProbeAnswer = z.strictObject({
  compartments: z.array(z.strictObject({ symbol: z.string().min(1), name: z.string().min(1) })).min(1),
  recoveryRatePerDay: z.number(),
});
export type ProbeAnswer = z.infer<typeof ProbeAnswer>;

const PASSAGE =
  "We divide the population into three groups: susceptible people (S), infected people (I) and recovered people (R). " +
  "Infected people recover at a constant rate gamma. An infection lasts five days on average, so gamma = 0.2 per day.";

const messages = [
  { role: "system" as const, content: "You extract facts from scientific text exactly as stated. You never add facts the text does not state." },
  { role: "user" as const, content: `Text:\n${PASSAGE}\n\nList each group's symbol and name, and the recovery rate per day.` },
];

/** Whether an answer is the right one: three compartments S, I, R and a rate of 0.2. */
export const probeCorrect = (answer: ProbeAnswer): boolean =>
  answer.compartments.map((compartment) => compartment.symbol.trim()).join(",") === "S,I,R" && Math.abs(answer.recoveryRatePerDay - 0.2) < 1e-9;

export interface ProbeResult {
  readonly model: string;
  /** What the gateway's model list claims. */
  readonly claimsSchema: boolean;
  /** With a JSON Schema sent: valid at the first reply, invalid, or the call failed. */
  readonly structured: "honoured" | "not honoured" | "failed";
  /** Without one: valid at the first reply, after one retry, or not at all. */
  readonly plainJson: "first reply" | "after a retry" | "failed";
  readonly correct: boolean;
  readonly notes: string;
}

const firstLine = (error: unknown): string => (error instanceof Error ? error.message : String(error)).split("\n")[0]?.slice(0, 160) ?? "";

export async function probeModel(client: ModelClient, model: string, claimsSchema: boolean): Promise<ProbeResult> {
  const base = { stage: "probe" as const, model, messages, temperature: 0, maxTokens: 4000 };
  const notes: string[] = [];
  let structured: ProbeResult["structured"];
  let correct = false;
  try {
    const response = await client.complete({ ...base, jsonSchema: jsonSchemaOf("probe_answer", ProbeAnswer) });
    const parsed = (() => {
      try {
        // Honoured means the reply is the object itself, with nothing around it.
        return ProbeAnswer.safeParse(JSON.parse(response.text.trim()));
      } catch {
        return ProbeAnswer.safeParse(undefined);
      }
    })();
    structured = parsed.success ? "honoured" : "not honoured";
    if (parsed.success) correct = probeCorrect(parsed.data);
    else {
      const loose = (() => {
        try {
          return ProbeAnswer.safeParse(extractJson(response.text)).success;
        } catch {
          return false;
        }
      })();
      notes.push(loose ? "with a schema, the JSON came wrapped in other text" : "with a schema, the reply did not match it");
    }
  } catch (error) {
    structured = "failed";
    notes.push(`with a schema: ${firstLine(error)}`);
  }
  let plainJson: ProbeResult["plainJson"];
  try {
    const result = await completeStructured(client, base, ProbeAnswer, { name: "probe_answer", structuredOutput: false });
    plainJson = result.attempts === 1 ? "first reply" : "after a retry";
    correct ||= probeCorrect(result.value);
  } catch (error) {
    plainJson = "failed";
    notes.push(`plain JSON: ${firstLine(error)}`);
  }
  return { model, claimsSchema, structured, plainJson, correct, notes: notes.join("; ") };
}
