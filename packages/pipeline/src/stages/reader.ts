/**
 * The reader: what a paper asks, the mechanism it proposes, which of its equations define its
 * model, and the result it shows, each claim with a verbatim quote that ingest's text must hold.
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
  /** The main result its model shows, and where the paper states it. */
  result: z.strictObject({ text: z.string().min(1).max(400), quote: Quote }),
  /** Up to six further claims, each with where the paper states it. */
  claims: z.array(z.strictObject({ text: z.string().min(1).max(300), quote: Quote })).max(6),
});
export type Reading = z.infer<typeof Reading>;

export const READER_INSTRUCTIONS = [
  "You read a scientific paper and say, in plain English, what it asks, what mechanism it proposes, and what its model shows.",
  DATA_RULE,
  "Rules:",
  "- modelEquations lists the ids, from the paper's list of display equations, of the equations that define the model itself: the system of differential equations and any definition it needs, such as a force of infection. Not analysis, proofs or derived results.",
  "- Every quote is copied character for character from the paper text, 3 to 200 characters, where the paper states that thing.",
  "- State only what the paper states. Never add a claim of your own.",
].join("\n");

export function readerMessages(source: SourceText, title: string): ChatMessage[] {
  return [
    { role: "system", content: READER_INSTRUCTIONS },
    { role: "user", content: `Paper: ${title}\n\n${promptSource(source).block}\n\nRead the paper.` },
  ];
}

export function read(client: ModelClient, model: string, source: SourceText, title: string, options: { readonly structuredOutput: boolean }) {
  return completeStructured(client, { stage: "reader", model, messages: readerMessages(source, title), temperature: 0, maxTokens: 8000 }, Reading, { name: "reading", structuredOutput: options.structuredOutput });
}
