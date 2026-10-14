/**
 * The transcriber (ADR-0024, item 2): a paper's compartment model, written down as a Transcription.
 * The first and second transcriptions use this same instruction, from models of different vendors,
 * and the second never sees the first.
 */
import type { SourceText } from "@paperplay/contracts";
import { completeStructured, type ChatMessage, type ModelClient } from "../models/index.ts";
import { Transcription } from "../transcribe/schema.ts";
import { DATA_RULE, promptSource } from "./source.ts";

export const TRANSCRIBER_INSTRUCTIONS = [
  "You transcribe the compartment model in a scientific paper, a system of ordinary differential equations, into JSON, exactly as the paper states it.",
  DATA_RULE,
  "Rules:",
  "- One compartment per state variable of the model's main system, one equation per compartment: d(compartment)/dt = rate.",
  "- Give every compartment and parameter an id: a letter, then letters, digits or underscores, such as S, C_q, theta_N or beta1. Keep the paper's own symbol in 'symbol' and a plain name in 'name'.",
  "- Write each rate as a formula over those ids with numbers, + - * / ^, brackets, exp() and log() only. Write out any shorthand the paper defines, such as a force of infection, in full. No other functions, no derivatives, no time t.",
  "- Units are powers of people, cells, molecules, length, mass and time: a rate per day is {\"time\": -1}; a number of people {\"people\": 1}; a share or a proportion {}. Use the time unit the paper's rates are per.",
  "- Values: give each parameter's value and each compartment's starting value exactly as the paper states it. Never invent or estimate one. If the paper states none, use null. If the paper gives several scenarios, use the first it gives in full.",
  "- Quotes: every 'quote' and 'initialQuote' is copied character for character from the paper text, 3 to 200 characters, where that thing is stated: a value from its table row or sentence, an equation from the equation itself. For a starting value of null, initialQuote is null.",
  "- Leave out anything the paper does not state as part of its model.",
].join("\n");

export function transcriberMessages(source: SourceText, title: string): ChatMessage[] {
  return [
    { role: "system", content: TRANSCRIBER_INSTRUCTIONS },
    { role: "user", content: `Paper: ${title}\n\n${promptSource(source).block}\n\nTranscribe the paper's compartment model.` },
  ];
}

export async function transcribe(client: ModelClient, model: string, source: SourceText, title: string, options: { readonly structuredOutput: boolean; readonly stage?: "transcriber" | "second-transcriber" }) {
  return completeStructured(
    client,
    { stage: options.stage ?? "transcriber", model, messages: transcriberMessages(source, title), temperature: 0, maxTokens: 16_000 },
    Transcription,
    { name: "transcription", structuredOutput: options.structuredOutput },
  );
}
