/**
 * The reader: what a paper asks, the mechanism it proposes, which of its equations define its
 * model, its headline result, and its stated findings (results, thresholds, conclusions), each
 * with a verbatim quote that ingest's text must hold. The planner's levels test these findings
 * (ADR-0037).
 */
import type { SourceText } from "@paperplay/contracts";
import { z } from "zod";
import { completeStructured, type ChatMessage, type ModelClient } from "../models/index.ts";
import { DATA_RULE, promptSource } from "./source.ts";

const Quote = z.string().min(3).max(300);

export const Reading = z.strictObject({
  /** The question the paper sets out to answer, in one plain sentence. */
  question: z.string().min(1).max(300),
  /** The mechanism it proposes, in one plain sentence. */
  mechanism: z.string().min(1).max(300),
  /** The ids of the display equations that define its model, from the list given. */
  modelEquations: z.array(z.string().min(1)).max(12),
  /** The paper's headline result, the one its abstract leads with, and where the paper states it. */
  result: z.strictObject({ text: z.string().min(1).max(400), quote: Quote }),
  /** Up to eight further findings the paper states from its model, each with where it states it. */
  findings: z
    .array(
      z.strictObject({
        /** A result the model shows, a threshold it finds, or a conclusion the paper draws. */
        kind: z.enum(["result", "threshold", "conclusion"]),
        text: z.string().min(1).max(300),
        quote: Quote,
      }),
    )
    .max(8),
});
export type Reading = z.infer<typeof Reading>;

export const READER_INSTRUCTIONS = [
  "You read a scientific paper and say, in plain English, what it asks, what mechanism it proposes, and what its model shows.",
  DATA_RULE,
  "Rules:",
  "- modelEquations lists the ids, from the paper's list of display equations, of the equations that define the model itself: the system of differential equations and any definition it needs, such as a force of infection. Not analysis, proofs or derived results.",
  "- result is the paper's headline result: what its abstract or conclusion says its model shows.",
  "- findings are what the paper finds from its model, beyond the headline: a result its simulations show, a threshold it derives (such as a basic reproduction number above or below one), or a conclusion it draws, such as which intervention matters most. Not what follows from the model's definitions alone, not its assumptions, not its methods.",
  "- Every quote is copied character for character from the paper text, 3 to 200 characters, where the paper states that thing.",
  "- State only what the paper states. Never add a finding of your own.",
].join("\n");

export function readerMessages(source: SourceText, title: string): ChatMessage[] {
  return [
    { role: "system", content: READER_INSTRUCTIONS },
    { role: "user", content: `Paper: ${title}\n\n${promptSource(source).block}\n\nRead the paper.` },
  ];
}

export function read(client: ModelClient, model: string, source: SourceText, title: string, options: { readonly structuredOutput: boolean }) {
  return completeStructured(client, { stage: "reader", model, messages: readerMessages(source, title), temperature: 0, maxTokens: 16_000 }, Reading, { name: "reading", structuredOutput: options.structuredOutput });
}
