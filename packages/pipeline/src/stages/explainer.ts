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
/**
 * A guide line with {to} where the learner's new value goes. A model that writes a value there
 * instead has it mended to the placeholder, in the two ways that slip can be read: a number ("You
 * raise the rate to 0.1, so …"), or a value named in at most four words before the clause's comma
 * ("You set the treatment rate to fast treatment, so …"). Anything else must still hold {to}
 * exactly once.
 */
export const mendTo = (text: unknown): unknown => {
  if (typeof text !== "string" || text.includes("{to}")) return text;
  const numbered = text.replace(/\s+to\s+[-−]?\d+(?:[.,]\d+)*(?:\s*%|\s*(?:per|a|an)\s+\w+)?/, "{to}");
  return numbered !== text ? numbered : text.replace(/\s+to\s+[^\s,{}]+(?:\s+[^\s,{}]+){0,3}(?=,)/, "{to}");
};
const Did = z.preprocess(mendTo, z.string().refine((text) => text.split("{to}").length === 2 && !/[{}]/.test(text.replaceAll("{to}", "")), { error: "holds {to} exactly once, and no other braces" }));

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
  "You write the words of a small learning game, a playable world built from a scientific paper, for one of its planned levels at a time.",
  DATA_RULE,
  "For the level named:",
  "- beginner: at most 90 words, no numbers or symbols, and an everyday analogy.",
  "- intermediate: at most 150 words, with the control's and the watched value's names.",
  "- advanced: at most 200 words, and the relevant equation in plain Unicode mathematics, such as dI/dt = βSI − γI. If the equation is the paper's own, give a verbatim quote of it from the paper; otherwise null.",
  "- guide: idle, a sentence before the learner acts; raised and lowered, each 'You … {to}, so …' with {to} exactly once where the new value goes; readings, 2 to 5 descriptions of the watched value, highest threshold first, each a lower bound in the value's own units, the last the bottom of its range; rising and falling, a short clause each.",
  "- afterwards: what the guide says once the What-if's result is in, connecting it to the paper, with a verbatim quote of the paper where it says so (else null), and a question for the learner.",
  "Rules: plain, short sentences in sentence case; say only what the paper or the model states; never present your own inference as the paper's; every quote copied character for character, 3 to 200 characters.",
  "Numbers as the chart shows them: when the model's compartments are shares of a population, adding up to one, write every amount as people in a town of 10,000, never as a share: a share of 0.004 is 40 people.",
].join("\n");

export function explainerMessages(input: { readonly title: string; readonly plan: Plan; readonly passages: string; readonly model: string }, level: number): ChatMessage[] {
  const planned = input.plan.levels[level];
  return [
    { role: "system", content: EXPLAINER_INSTRUCTIONS },
    {
      role: "user",
      content: `Paper: ${input.title}\n\nThe model:\n${input.model}\n\nThe whole plan, for context:\n${JSON.stringify(input.plan.levels, null, 1)}\n\nPAPER START\n${input.passages}\nPAPER END\n\nWrite the words of level ${level + 1}, "${planned?.title ?? ""}", alone, as one JSON object.`,
    },
  ];
}

/**
 * One level a call, held to its schema where the model honours one (ADR-0037): asked for every
 * level at once, gemma4-31b-it looped on whitespace under the schema and, in plain JSON, closed a
 * level before its guide, twice. A schema-held reply that runs out or comes back empty is asked for
 * again as plain JSON. The explainer is not ranked by the bake-off; it takes the planner's model.
 */
export async function explain(client: ModelClient, model: string, input: Parameters<typeof explainerMessages>[0], options: { readonly structuredOutput: boolean }): Promise<{ readonly value: Explanation }> {
  // One level a call: a small reply has less room to loop or nest wrongly, and a failure costs one level's words.
  const levels: ExplainedLevel[] = [];
  for (let level = 0; level < input.plan.levels.length; level++) {
    const words = await completeStructured(client, { stage: "explainer", model, messages: explainerMessages(input, level), temperature: 0, maxTokens: 16_000 }, ExplainedLevel, { name: "level_words", structuredOutput: options.structuredOutput, moreRoom: true });
    levels.push(words.value);
  }
  return { value: Explanation.parse({ levels }) };
}

/**
 * A level's words written again where a reviewer found they misdescribe the model (ADR-0044): its
 * words, and every sentence of the plan's a learner reads, its goal, its What-if's question, its
 * prediction's question and its effect, so whichever sentence was blocked can be mended (the
 * owner's rule of 2026-10-18 sends the sentence to the explainer). Its What-if's value, what it
 * measures and its claim stay the planner's.
 */
/**
 * Bounded by words, not characters: a character limit in a schema lets a model's constrained reply
 * stop mid-word, as a goal once did ("The vaccinated group's o"). Each ends a sentence.
 */
const Sentences = (words: number) => UpTo(words).refine((text) => /[.!?]["”’)]?$/.test(text.trim()), { error: "must end a sentence" });
export const RewordedLevel = z.strictObject({ ...ExplainedLevel.shape, goal: Sentences(30), whatIf: Sentences(30), prediction: Sentences(30), effect: Sentences(50) });
export type RewordedLevel = z.infer<typeof RewordedLevel>;

/** One scoped wording repair: the level's words and its sentences again, saying only what the model's equations do. */
export async function reword(client: ModelClient, model: string, input: Parameters<typeof explainerMessages>[0], level: number, problem: string, options: { readonly structuredOutput: boolean }): Promise<{ readonly value: RewordedLevel }> {
  const planned = input.plan.levels[level];
  const messages: ChatMessage[] = [
    ...explainerMessages(input, level),
    {
      role: "user",
      content: `A reviewer found that level ${level + 1}'s words misdescribe the model: ${problem}\nWrite this level's words again, saying only what the model's equations do: its goal, one sentence of at most 30 words; its What-if's question and its prediction's question, each one question of at most 30 words, both about the same change as now, ${planned?.whatIf.parameter ?? ""} at ${planned?.whatIf.value ?? ""} (now: "${planned?.whatIf.prompt ?? ""}" and "${planned?.prediction.prompt ?? ""}"); and its effect, at most 50 words. Its claim stays as it is: the effect sentence states the same measured difference as this one, in words the equations support: "${planned?.effect ?? ""}"`,
    },
  ];
  const words = await completeStructured(client, { stage: "explainer", model, messages, temperature: 0, maxTokens: 16_000 }, RewordedLevel, { name: "reworded_level", structuredOutput: options.structuredOutput, moreRoom: true });
  return { value: words.value };
}

