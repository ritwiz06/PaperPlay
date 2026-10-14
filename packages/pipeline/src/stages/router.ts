/**
 * The router (every-paper.md §3.2): which family covers a paper's mechanism, and so which tier it
 * goes to. Tier A only where a released primitive covers the mechanism; tier B for a family whose
 * primitive is not released, or a new mechanism; tier C when nothing playable is honest.
 */
import { FAMILIES, FamilyId } from "@paperplay/contracts";
import { z } from "zod";
import { completeStructured, type ChatMessage, type ModelClient } from "../models/index.ts";
import { DATA_RULE } from "./source.ts";

/** The families with a released primitive today (G3a): the flock's agents and the compartment solver. */
export const RELEASED_FAMILIES: readonly FamilyId[] = Object.freeze(["agents", "compartments"]);

export const RouteDecision = z.strictObject({
  /** The paper's field, in a few words. */
  domain: z.string().min(1).max(100),
  /** Its mechanism, in one plain sentence. */
  mechanism: z.string().min(1).max(300),
  /** The family that covers the mechanism, or none. */
  family: z.union([FamilyId, z.literal("none")]),
  tier: z.enum(["A", "B", "C"]),
  /** Why, in one or two sentences. */
  reason: z.string().min(1).max(400),
});
export type RouteDecision = z.infer<typeof RouteDecision>;

export function routerInstructions(): string {
  const catalogue = Object.values(FAMILIES)
    .map((family) => `- ${family.id}: ${family.name}${RELEASED_FAMILIES.includes(family.id) ? " (released)" : " (not released yet)"}`)
    .join("\n");
  return [
    "You decide which family of playable models covers a scientific paper's mechanism, from its title, abstract and equations.",
    DATA_RULE,
    `The families:\n${catalogue}`,
    "Tiers:",
    "- A: a released family covers the mechanism as the paper states it.",
    "- B: a family that is not released yet covers it, or the mechanism needs a new model of a known kind.",
    "- C: the paper has no mechanism a learner could honestly play with, such as a survey, a theorem with no dynamics, or a purely empirical result. Its family is none.",
    "Choose by mechanism, not by subject: an epidemic on a contact network is networks; a well-mixed epidemic is compartments.",
  ].join("\n");
}

export function routerMessages(paper: { readonly title: string; readonly abstract: string; readonly equations: readonly string[] }): ChatMessage[] {
  const equations = paper.equations.slice(0, 12).join("\n") || "(none given)";
  return [
    { role: "system", content: routerInstructions() },
    { role: "user", content: `PAPER START\nTitle: ${paper.title}\n\nAbstract: ${paper.abstract}\n\nSome of its display equations:\n${equations}\nPAPER END\n\nRoute the paper.` },
  ];
}

export function route(client: ModelClient, model: string, paper: Parameters<typeof routerMessages>[0], options: { readonly structuredOutput: boolean }) {
  return completeStructured(client, { stage: "router", model, messages: routerMessages(paper), temperature: 0, maxTokens: 4000 }, RouteDecision, { name: "route", structuredOutput: options.structuredOutput });
}
