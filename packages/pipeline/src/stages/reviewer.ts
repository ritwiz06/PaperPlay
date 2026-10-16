/**
 * The reviewer (R10, every-paper.md §3.7): reads a built world, the paper's passages and the checks'
 * results, and suggests. It cannot overturn a failed check, approve a world or edit the spec: its
 * findings go to the controller, which spends a scoped repair on a level it finds definitional.
 */
import { z } from "zod";
import { completeStructured, type ChatMessage, type ModelClient } from "../models/index.ts";
import { DATA_RULE } from "./source.ts";

export const Finding = z.strictObject({
  /** The level it concerns, by its order from 1, or null for the whole world. */
  level: z.int().min(1).max(9).nullable(),
  /** Blocking: the world says something false or misleading, or a level teaches nothing worth learning. Advice: it could be clearer. */
  severity: z.enum(["blocking", "advice"]),
  /**
   * What is wrong: a level whose effect follows from the model's definitions alone (ADR-0037), a
   * statement the paper does not support, one worded beyond its measurement, or something else.
   */
  kind: z.enum(["definitional", "unsupported", "overstated", "other"]),
  finding: z.string().min(1).max(400),
  /** A scoped repair: what to change, in that level alone. */
  suggestion: z.string().min(1).max(400),
});
export type Finding = z.infer<typeof Finding>;

export const Review = z.strictObject({ findings: z.array(Finding).max(12) });
export type Review = z.infer<typeof Review>;

export const REVIEWER_INSTRUCTIONS = [
  "You review a small learning game, a playable world generated from a scientific paper, before a learner sees it.",
  DATA_RULE,
  "You read each level's statements and the checks' results, and find what a careful teacher would: a statement the paper does not support, a statement labelled the paper's that is really a teaching choice, a claim worded more strongly than its measurement, a What-if that cannot teach what its level is about, a confusing word.",
  "Rules:",
  "- You cannot change a check's result. A failed check stays failed whatever you say; never call one acceptable.",
  "- A level whose effect follows from the model's definitions alone teaches nothing the paper found: setting a rate to zero empties the compartment it fills, a compartment fed by nothing stays empty, a larger inflow gives more. Mark it blocking, of kind definitional, and suggest a What-if that tests one of the paper's findings instead.",
  "- Mark a finding blocking only when the world would teach something false or misleading, or a level is definitional; otherwise advice.",
  "- Each suggestion is a scoped repair to one level: what to change there, and nothing else.",
  "- If nothing is wrong, return no findings. Never invent a problem.",
].join("\n");

/** Room for a reasoning model to think before it writes its findings: 8,000 ran out while thinking. */
export const REVIEWER_MAX_TOKENS = 32_000;

export function reviewerMessages(input: { readonly title: string; readonly world: string; readonly checks: string; readonly passages: string }): ChatMessage[] {
  return [
    { role: "system", content: REVIEWER_INSTRUCTIONS },
    { role: "user", content: `Paper: ${input.title}\n\nPAPER START\n${input.passages}\nPAPER END\n\nThe world:\n${input.world}\n\nThe checks' results:\n${input.checks}\n\nReview the world.` },
  ];
}

export function review(client: ModelClient, model: string, input: Parameters<typeof reviewerMessages>[0], options: { readonly structuredOutput: boolean }) {
  return completeStructured(client, { stage: "reviewer", model, messages: reviewerMessages(input), temperature: 0, maxTokens: REVIEWER_MAX_TOKENS }, Review, { name: "review", structuredOutput: options.structuredOutput });
}
