/**
 * The router (every-paper.md §3.2): which family covers a paper's mechanism, and so which tier it
 * goes to. Tier A only where a released primitive covers the mechanism; tier B for a family whose
 * primitive is not released, or a new mechanism; tier C when nothing playable is honest.
 */
import { FAMILIES, FamilyId } from "@paperplay/contracts";
import { z } from "zod";
import { completeStructured, type ChatMessage, type ModelClient } from "../models/index.ts";
import { DATA_RULE } from "./source.ts";

/**
 * The families the router may name: those its bake-off's recordings know. Attention has a primitive
 * (ADR-0054) but no worlds yet, so a paper on it is tier C until it does; adding it here would also
 * change the schema every recorded router call was asked with.
 */
export const RoutedFamily = FamilyId.exclude(["attention"]);
export type RoutedFamily = z.infer<typeof RoutedFamily>;

/** The families with a released primitive today (G3a): the flock's agents and the compartment solver. */
export const RELEASED_FAMILIES: readonly RoutedFamily[] = Object.freeze(["agents", "compartments"]);

/** The families whose worlds the pipeline makes from a paper today. */
export const GENERATED_FAMILIES: readonly RoutedFamily[] = Object.freeze(["compartments"]);

/**
 * What each family can play today, and what it cannot (ADR-0055): the router read only the
 * families' names, and sent 18 of the 34 AI papers to learning, which plays an optimiser on a loss
 * landscape and nothing more. A family's reach grows here when its primitives do.
 */
export const FAMILY_CAPABILITIES: Readonly<Record<RoutedFamily, string>> = Object.freeze({
  agents: "a flock or crowd of agents, each following local rules such as separation, alignment and cohesion, on a two-dimensional space; worlds authored by hand, not made from papers yet.",
  compartments: "a well-mixed population in compartments whose sizes change by ordinary differential equations: epidemics (SIR, SEIR and their kin), treatment and adherence, cell populations; the pipeline makes these worlds from a paper.",
  learning: "an optimiser stepping on a two-dimensional loss landscape: gradient descent, momentum, Nesterov's method, adaptive steps such as Adam's; a small network trained with dropout is planned. It does not cover model architectures (attention, transformers, convolutional networks), pre-training or fine-tuning, language models, generative or diffusion models, scaling laws, parallel training, or agents built on language models.",
  "study-design": "a study's design simulated as cohorts: randomisation, sample size, confounding; not built yet.",
  grids: "a field on a grid, such as diffusion of heat or a reaction–diffusion pattern; not built yet.",
  networks: "a process on a network of contacts, such as an epidemic on a contact network; not built yet.",
});

export const RouteDecision = z.strictObject({
  /** The paper's field, in a few words. */
  domain: z.string().min(1).max(100),
  /** Its mechanism, in one plain sentence. */
  mechanism: z.string().min(1).max(300),
  /** The family that covers the mechanism, or none. */
  family: z.union([RoutedFamily, z.literal("none")]),
  tier: z.enum(["A", "B", "C"]),
  /** Why, in one or two sentences. */
  reason: z.string().min(1).max(400),
});
export type RouteDecision = z.infer<typeof RouteDecision>;

/**
 * The router's instructions. With capabilities, a job's (ADR-0055): each family's real reach, and a
 * mechanism no existing family covers sent to tier C. Without, as the router bake-off recorded them,
 * so its recordings replay.
 */
export function routerInstructions(options: { readonly capabilities?: boolean } = {}): string {
  if (!options.capabilities) return recordedInstructions();
  const catalogue = RoutedFamily.options
    .map((id) => ({ id, name: FAMILIES[id].name }))
    .map((family) => `- ${family.id}: ${family.name}. It plays ${FAMILY_CAPABILITIES[family.id]}${GENERATED_FAMILIES.includes(family.id) ? " Made from papers." : ""}`)
    .join("\n");
  return [
    "You decide which family of playable models covers a scientific paper's mechanism, from its title, abstract and equations.",
    DATA_RULE,
    `The families:\n${catalogue}`,
    "Tiers:",
    "- A: a family whose worlds are made from papers covers the mechanism as the paper states it.",
    "- B: an existing family covers the mechanism, as its description says, but its worlds are not made from papers yet, or the mechanism needs a model the family plans.",
    "- C: no existing family covers the mechanism, as each description says, or the paper has no mechanism a learner could honestly play with, such as a survey, a theorem with no dynamics, or a purely empirical result. Its family is none. A mechanism of a family that does not exist yet, such as attention in transformers, a diffusion model, a scaling law or an agent built on a language model, is tier C until that family exists.",
    "Choose by mechanism, not by subject: an epidemic on a contact network is networks; a well-mixed epidemic is compartments. Never stretch a family past what its description says it plays.",
  ].join("\n");
}

/** The instructions before 2026-10-25, which the router bake-off's recordings hold. */
function recordedInstructions(): string {
  const catalogue = RoutedFamily.options
    .map((id) => ({ id, name: FAMILIES[id].name }))
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

export function routerMessages(paper: { readonly title: string; readonly abstract: string; readonly equations: readonly string[] }, options: { readonly capabilities?: boolean } = {}): ChatMessage[] {
  const equations = paper.equations.slice(0, 12).join("\n") || "(none given)";
  return [
    { role: "system", content: routerInstructions(options) },
    { role: "user", content: `PAPER START\nTitle: ${paper.title}\n\nAbstract: ${paper.abstract}\n\nSome of its display equations:\n${equations}\nPAPER END\n\nRoute the paper.` },
  ];
}

export function route(client: ModelClient, model: string, paper: Parameters<typeof routerMessages>[0], options: { readonly structuredOutput: boolean; readonly capabilities?: boolean }) {
  return completeStructured(client, { stage: "router", model, messages: routerMessages(paper, { capabilities: options.capabilities ?? false }), temperature: 0, maxTokens: 4000 }, RouteDecision, { name: "route", structuredOutput: options.structuredOutput });
}
