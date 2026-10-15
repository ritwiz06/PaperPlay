/**
 * The explainer (every-paper.md §3.3): each planned level's words at three depths, its guide's
 * script, and what the guide says once a What-if's result is in. Every text is a teaching choice
 * unless it quotes the paper, in which case the quote must be in the source and the text is labelled
 * the paper's. It never presents an inference as the paper's.
 */
import { wordCount } from "@paperplay/contracts";
import { z } from "zod";
import { completeStructured, type ChatMessage, type ModelClient } from "../models/index.ts";
import type { Plan } from "./planner.ts";
import { DATA_RULE } from "./source.ts";

const Quote = z.string().min(3).max(300);
const Words = (max: number) => z.string().min(1).max(max);
const UpTo = (words: number) => z.string().min(1).refine((text) => wordCount(text) <= words, { error: `at most ${words} words` });
const Did = z.string().refine((text) => text.split("{to}").length === 2 && !/[{}]/.test(text.replaceAll("{to}", "")), { error: "holds {to} exactly once, and no other braces" });

export const ExplainedLevel = z.strictObject({
  beginner: z.strictObject({ text: UpTo(90), analogy: Words(200) }),
  intermediate: z.strictObject({ text: UpTo(150) }),
  /** The equation in plain Unicode mathematics, and, when it is the paper's own, a verbatim quote of it. */
  advanced: z.strictObject({ text: UpTo(200), equation: Words(200), quote: Quote.nullable() }),
  guide: z.strictObject({
    idle: Words(160),
    /** "You raised …{to}, so …": {to} once, where the new value goes. */
    raised: Did,
    lowered: Did,
    /** What the watched value means, highest threshold first, the last at the bottom of its range. */
    readings: z.array(z.strictObject({ atLeast: z.number(), words: Words(80) })).min(2).max(5),
    rising: Words(60),
    falling: Words(60),
  }),
  /** What the guide says once the What-if's result is in, and the question it leaves. */
  afterwards: z.strictObject({ text: Words(300), quote: Quote.nullable(), question: Words(160) }),
});
export type ExplainedLevel = z.infer<typeof ExplainedLevel>;

export const Explanation = z.strictObject({ levels: z.array(ExplainedLevel).min(3).max(6) });
export type Explanation = z.infer<typeof Explanation>;

export const EXPLAINER_INSTRUCTIONS = [
  "You write the words of a small learning game, a playable world built from a scientific paper, for each of its planned levels, in order.",
  DATA_RULE,
  "For each level:",
  "- beginner: at most 90 words, no numbers or symbols, and an everyday analogy.",
  "- intermediate: at most 150 words, with the control's and the watched value's names.",
  "- advanced: at most 200 words, and the relevant equation in plain Unicode mathematics, such as dI/dt = βSI − γI. If the equation is the paper's own, give a verbatim quote of it from the paper; otherwise null.",
  "- guide: idle, a sentence before the learner acts; raised and lowered, each 'You … {to}, so …' with {to} exactly once where the new value goes; readings, 2 to 5 descriptions of the watched value, highest threshold first, each a lower bound in the value's own units, the last the bottom of its range; rising and falling, a short clause each.",
  "- afterwards: what the guide says once the What-if's result is in, connecting it to the paper, with a verbatim quote of the paper where it says so (else null), and a question for the learner.",
  "Rules: plain, short sentences in sentence case; say only what the paper or the model states; never present your own inference as the paper's; every quote copied character for character, 3 to 200 characters.",
].join("\n");

export function explainerMessages(input: { readonly title: string; readonly plan: Plan; readonly passages: string; readonly model: string }): ChatMessage[] {
  return [
    { role: "system", content: EXPLAINER_INSTRUCTIONS },
    { role: "user", content: `Paper: ${input.title}\n\nThe model:\n${input.model}\n\nThe plan:\n${JSON.stringify(input.plan.levels, null, 1)}\n\nPAPER START\n${input.passages}\nPAPER END\n\nWrite each level's words, in the plan's order.` },
  ];
}

export function explain(client: ModelClient, model: string, input: Parameters<typeof explainerMessages>[0], options: { readonly structuredOutput: boolean }) {
  return completeStructured(client, { stage: "explainer", model, messages: explainerMessages(input), temperature: 0, maxTokens: 32_000 }, Explanation, { name: "explanation", structuredOutput: options.structuredOutput });
}
