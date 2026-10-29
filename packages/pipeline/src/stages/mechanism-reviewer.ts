/**
 * The generated tier's reviewer (ADR-0058's amendment): the reviewer's job on a world whose model a
 * coding model wrote, with the questions such a world needs. Its findings say what kind of repair a
 * level needs: a What-if that cannot teach its level is replaced by another candidate, never
 * reworded; words that misdescribe the module are written again; an outcome the module restates
 * rather than computes is replaced. It cannot overturn a check. The compartment family's reviewer,
 * whose recordings its bake-off replays, is unchanged.
 */
import { z } from "zod";
import { completeStructured, type ChatMessage, type ModelClient } from "../models/index.ts";
import { DATA_RULE } from "./source.ts";

export const MechanismFinding = z.strictObject({
  /** The level it concerns, by its order from 1, or null for the whole world. */
  level: z.int().min(1).max(9).nullable(),
  severity: z.enum(["blocking", "advice"]),
  /**
   * The repair it needs: "what-if", another What-if (the level is replaced); "wording", its words
   * written again; "restated", the module writes in an outcome the paper reports rather than
   * computing it (the level is replaced); "other", anything else.
   */
  kind: z.enum(["what-if", "wording", "restated", "other"]),
  finding: z.string().min(1).max(400),
  suggestion: z.string().min(1).max(400),
});
export type MechanismFinding = z.infer<typeof MechanismFinding>;

export const MechanismReview = z.strictObject({ findings: z.array(MechanismFinding).max(12) });
export type MechanismReview = z.infer<typeof MechanismReview>;

export const MECHANISM_REVIEWER_INSTRUCTIONS = [
  "You review a small learning game made from a scientific paper, before a learner sees it. Its model is a module a coding model wrote: code checked how it behaves, but nothing checked that it is the paper's model.",
  DATA_RULE,
  "For each level, ask three questions:",
  "- Does its What-if teach what the level is about, changing the setting as the paper means it? Taking a mechanism away is what the paper means by it: removing the √dk scaling is dividing by 1, not multiplying the scores by 0. A What-if that cannot teach its level, or misrepresents what the paper means by the change, is blocking, kind what-if: the level is replaced by another, never reworded.",
  "- Do its words say what the module does and what was measured? Words that misdescribe the module, or claim the opposite of the measured difference, are blocking, kind wording: they are written again.",
  "- Does the module compute this outcome, or restate the paper's number? An outcome the module writes in, as a constant or a table of the paper's results, rather than computing it from its mechanism, is blocking, kind restated.",
  "Rules:",
  "- You cannot change a check's result. A failed check stays failed whatever you say; never call one acceptable.",
  "- Mark a finding blocking only when the level would teach something false or misleading; anything that could merely be clearer is advice, and anything else misleading is kind other.",
  "- Each suggestion is a scoped repair to one level.",
  "- If nothing is wrong, return no findings. Never invent a problem.",
].join("\n");

/** Room for a reasoning model to think before it writes its findings, as the family reviewer's. */
export const MECHANISM_REVIEWER_MAX_TOKENS = 32_000;

export function mechanismReviewerMessages(input: { readonly title: string; readonly world: string; readonly checks: string; readonly passages: string; readonly module: string }): ChatMessage[] {
  return [
    { role: "system", content: MECHANISM_REVIEWER_INSTRUCTIONS },
    {
      role: "user",
      content: `Paper: ${input.title}\n\nPAPER START\n${input.passages}\nPAPER END\n\nThe module, as the sandbox runs it:\n${input.module}\n\nThe world:\n${input.world}\n\nThe checks' results:\n${input.checks}\n\nReview the world.`,
    },
  ];
}

export function reviewMechanism(client: ModelClient, model: string, input: Parameters<typeof mechanismReviewerMessages>[0], options: { readonly structuredOutput: boolean; readonly stage?: "reviewer" | "second-reviewer" }) {
  return completeStructured(client, { stage: options.stage ?? "reviewer", model, messages: mechanismReviewerMessages(input), temperature: 0, maxTokens: MECHANISM_REVIEWER_MAX_TOKENS }, MechanismReview, { name: "review", structuredOutput: options.structuredOutput });
}
